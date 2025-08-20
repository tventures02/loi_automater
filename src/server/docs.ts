var LOI_QUEUE_NAME = 'LOI_Queue';
var LOI_QUEUE_HEADERS = [
    'ID', 'Source Sheet', 'Source Row', 'Email', 'Doc ID', 'Doc URL', 'Template ID', 'Mapping Version',
    'Status', 'Sent At', 'Attempts', 'Last Error', 'Created At'
];



// Define a type for the return object for better type safety
export type DocInfo = {
    id: string;
    name?: string; // Optional because it might not be found
    error?: string; // Optional for when an error occurs
};

/**
 * Gets the names of multiple Google Docs given an array of their file IDs.
 * This function handles errors individually for each ID.
 *
 * @param {string[]} docIds - An array of Google Document file IDs.
 * @returns {DocInfo[]} An array of objects, each containing the original ID
 *                      and either the document's name or an error message.
 */
export const getGoogleDocNamesByIds = (docIds: string[]): DocInfo[] => {
    // Validate that the input is a valid array
    if (!Array.isArray(docIds)) {
        // In a real-world scenario, throwing an error is often best here.
        console.error('Invalid input: docIds must be an array.');
        // However, returning a format consistent with an error might be better for the client
        return [{ id: 'INVALID_INPUT', error: 'Input was not an array.' }];
    }

    const results: DocInfo[] = docIds.map((id) => {
        // Skip any null, undefined, or empty string IDs
        if (!id) {
            return { id: id, error: 'Invalid ID provided (null or empty).' };
        }

        try {
            // Use DriveApp to get the file by its ID
            const file = DocumentApp.openById(id);

            // If successful, get the name and return the success object
            const docName = file.getName();
            return { id: id, name: docName };

        } catch (e) {
            // If getFileById fails (e.g., invalid ID, no permission), it throws an error.
            console.error(`Failed to access doc with ID: ${id}. Error: ${e.message}`);
            // Return an error object for this specific ID
            return { id: id, error: 'File not found or access denied.' };
        }
    });

    return results;
};

function makeContentKey(row, tokenCols, emailIndex, templateId, mapVersion) {
    var parts = ['v1', String(templateId || ''), String(mapVersion || '')];

    // normalize email
    var email = (row[emailIndex] || '').toString().trim().toLowerCase();
    parts.push(email);

    // include every placeholder value in a stable order
    var names = Object.keys(tokenCols).sort();
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var idx = tokenCols[name];
        var val = (row[idx] || '').toString().trim();
        // name=value keeps semantic clarity before hashing
        parts.push(name + '=' + val);
    }

    var raw = parts.join('\u241F'); // unit separator to avoid collisions
    var bytes = Utilities.newBlob(raw).getBytes();
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
    return 'k_' + Utilities.base64EncodeWebSafe(digest).slice(0, 22); // short, stable
}


export const getGoogleDocPlainText = (docId: string): string => {
    const file = DocumentApp.openById(docId);
    const content = file.getBody().getText();
    return content;
};

/**
 * Creates a new Google Doc with the given title.
 * @param {string} docTitle - The title for the new Google Document.
 * @returns {{url: string, id: string}} An object containing the URL and the ID of the new document.
 */
export const createGoogleDoc = (docTitle: string) => {
    try {
        // Create the document
        const doc = DocumentApp.create(docTitle);
        const body = doc.getBody();

        // Fill in the LOI template with provided data
        const content = `Sample Letter of Intent\n\nHi {{name}},\n\nI’m interested in purchasing the property at {{address}} and would like to make an offer of {{offer}}. I’d be ready to close around {{closing date}}, pending agreement on final terms.\n\nBest,\n{{buyer_name}}\n\n`;

        body.appendParagraph(content);

        // Get the URL and ID
        const url = doc.getUrl();
        const id = doc.getId();

        return { url, id };
    } catch (error) {
        console.error(`Error creating document: ${error.toString()}`);
        throw new Error('There was an error creating the Google Doc.');
    }
};


export const getPreviewRowValues = (payload) => {
    // payload = { columns: ["A","C","F"], sheetName: "Optional" }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = payload.sheetName
        ? ss.getSheetByName(payload.sheetName)
        : ss.getActiveSheet();

    const rowIndex = 1;
    const valuesByColumn = {};

    (payload.columns || []).forEach(function (col) {
        if (!col) return;
        const colIndex = colToNumber(col); // A->1, B->2, ...
        const val = sheet.getRange(rowIndex, colIndex).getDisplayValue();
        valuesByColumn[col] = val;
    });

    return valuesByColumn;
}

/** Preflight: count rows, validate emails, build a sample filename. */
/** Preflight: count rows, validate emails, build a sample filename.
 *  Uses ONLY the active (or specified) sheet; NO headers are assumed/required.
 *  All tracking/sending will be handled via LOI_Queue.
 */
export const preflightGenerateLOIs = (payload) => {
    const ss = SpreadsheetApp.getActive();
    const sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : ss.getActiveSheet();
    if (!sheet) throw new Error('Sheet not found');
    if (sheet.getName().startsWith('LOI_Queue')) throw new Error('LOI_Queue is not a raw data sheet.');
    const queueExistsFlag = queueExists();

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 1) {
        return { ok: false, totalRows: 0, eligibleRows: 0, invalidEmails: 0, missingValuesRows: 0, sampleFileName: '', queueExists: queueExistsFlag };
    }

    const width = Math.min(lastCol, 8); // A..H only
    const values = sheet.getRange(1, 1, lastRow, width).getDisplayValues();

    const mapping = payload.mapping || {};
    const emailColLetter = payload.emailColumn || mapping.__email;
    if (!emailColLetter) {
        return { ok: false, totalRows: values.length, eligibleRows: 0, invalidEmails: 0, missingValuesRows: 0, sampleFileName: '', queueExists: queueExistsFlag };
    }
    const emailIndex = colToNumber(emailColLetter) - 1;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Sample file name from first row of data
    const first = values[0] || [];
    let sampleName = payload.pattern || "LOI - {{address}}";
    Object.keys(mapping).forEach(ph => {
        if (ph === '__email') return;
        const idx = colToNumber(mapping[ph]) - 1;
        sampleName = sampleName.replace(
            new RegExp('{{\\s*' + escapeRegExp(ph) + '\\s*}}', 'g'),
            (first[idx] || '')
        );
    });

    let eligible = 0, invalid = 0, missingValsRows = 0;

    values.forEach(row => {
        const email = (row[emailIndex] || '').toString().trim();
        if (!email || !emailRegex.test(email)) { invalid++; return; }

        // Simple completeness: all mapped tokens present
        let missing = false;
        for (const ph in mapping) {
            if (ph === '__email') continue;
            const idx = colToNumber(mapping[ph]) - 1;
            if (!row[idx]) { missing = true; break; }
        }
        if (missing) missingValsRows++;
        eligible++;
    });

    const ok = eligible > 0;
    return {
        ok,
        totalRows: values.length,
        eligibleRows: eligible,
        invalidEmails: invalid,
        missingValuesRows: missingValsRows,
        sampleFileName: sampleName,
        queueExists: queueExistsFlag
    };
};

/** Find header -> index map for a sheet's first row. */
function headerIndexMap(sh) {
    var lastCol = sh.getLastColumn();
    if (lastCol === 0) return {};
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var map = {};
    for (var i = 0; i < headers.length; i++) map[headers[i]] = i;
    return map;
}

export const generateLOIsAndWriteSheet = (payload) => {
    try {
        const ss = SpreadsheetApp.getActive();
        const source = payload.sheetName ? ss.getSheetByName(payload.sheetName) : ss.getActiveSheet();
        if (!source) throw new Error('Sheet not found');
    
        const lastRow = source.getLastRow();
        const lastCol = source.getLastColumn();
        if (lastRow < 1) {
            return { created: 0, skippedInvalid: 0, failed: 0, statuses: [] };
        }
    
        // Ensure central queue exists (source of truth for sending)
        const qSheetRes = queueEnsureSheet();  
        const qSheet = qSheetRes.sh;
        const qHead = headerIndexMap(qSheet);
        const idColIdx = qHead['id']; // 0-based index of 'id' header
        const qLastRow = qSheet.getLastRow();
        const existingIds = new Set();
        if (qLastRow > 1 && idColIdx != null) {
            const idVals = qSheet.getRange(2, idColIdx + 1, qLastRow - 1, 1).getValues();
            for (var i = 0; i < idVals.length; i++) {
                var v = idVals[i][0];
                if (v) existingIds.add(String(v));
            }
        }

        const width = Math.min(lastCol, 8); // A..H only
        const data = source.getRange(1, 1, lastRow, width).getDisplayValues();
    
        const mapping = payload.mapping || {};
        // Build token -> column index map
        const tokenCols = {};
        Object.keys(mapping).forEach(ph => {
            if (ph === '__email') return;
            const letter = mapping[ph];
            if (!letter) return;
            const idx = colToNumber(letter) - 1;
            if (idx >= 0 && idx < width) tokenCols[ph] = idx;
        });
    
        // Email column index
        const emailColLetter = payload.emailColumn || mapping.__email;
        if (!emailColLetter) {
            return { created: 0, skippedInvalid: data.length, failed: 0, statuses: data.map((_, i) => ({ row: i + 1, status: 'skipped', message: 'No email column mapped' })) };
        }
        const eIdx = colToNumber(emailColLetter) - 1;
    
        const statuses = [];
        const queueBatch = [];
        let created = 0, skippedInvalid = 0, failed = 0;
    
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const sourceSheetName = source.getName();
        const mapVersion = mappingVersion(mapping);
        const templateId = payload.templateDocId;
    
        for (let r = 0; r < data.length; r++) {
            const row = data[r];
            const email = (row[eIdx] || '').toString().trim();

            // Build deterministic content key as the queue ID
            const id = makeContentKey(row, tokenCols, eIdx, templateId, mapVersion);

            // Skip duplicates already present in LOI_Queue
            if (existingIds.has(id)) {
                skippedInvalid++;
                statuses.push({ row: r + 1, status: 'skipped', message: 'Duplicate (already queued/sent with same content)' });
                continue;
            }

            // Validate email
            if (!email || !emailRegex.test(email)) {
                skippedInvalid++;
                statuses.push({ row: r + 1, status: 'skipped', message: 'Invalid or empty email' });
                continue;
            }
    
            try {
                // Build placeholder values from row
                const placeholders = {};
                for (const ph in tokenCols) placeholders[ph] = row[tokenCols[ph]] || '';
    
                // Compute Doc name from pattern
                const fileName = renderName(payload.pattern || "LOI", row, tokenCols);
    
                // Create a Doc from template and replace tokens
                const docInfo = generateLOIDocFromTemplate(templateId, {
                    fileName,
                    placeholders
                });
    
                // Queue row in LOI_Queue
                const now = new Date();
                queueBatch.push({
                    id: id,
                    sourceSheet: sourceSheetName,
                    sourceRow: r + 1,                // 1-based position in source sheet (no headers)
                    email: email,
                    docId: docInfo.fileId || '',
                    docUrl: docInfo.fileUrl || '',
                    templateId: templateId || '',
                    mappingVersion: mapVersion,
                    status: 'queued',
                    sentAt: '',
                    attempts: 0,
                    lastError: '',
                    createdAt: now,
                    updatedAt: now
                });

                // Mark key as now existing (to avoid collisions within same run)
                existingIds.add(id);

                created++;
                statuses.push({ row: r + 1, status: 'ok', docUrl: docInfo.fileUrl });
            } catch (e) {
                failed++;
                statuses.push({ row: r + 1, status: 'failed', message: String(e) });
            }
        }
    
        // Bulk append to LOI_Queue
        if (queueBatch.length) queueAppendItems(queueBatch);
    
        return {
            created,
            skippedInvalid,
            failed,
            statuses
        };        
    } catch (error) {
        console.error(`Error generating LOIs: ${error.toString()}`);
        throw new Error('There was an error generating LOIs.');
    }
}

function copyTextAttributes(sourceElement, targetElement) {
    const sourceText = sourceElement.editAsText();
    const targetText = targetElement.editAsText();

    const textLength = sourceText.getText().length;

    // Iterate through each character and copy attributes
    for (let i = 0; i < textLength; i++) {
        const attributes = sourceText.getAttributes(i);
        targetText.setAttributes(i, i, attributes);
    }
}

/**
* Make a copy of the template Doc, replace placeholders, and return its ID/URL.
* Supports both {{Token}} and <token> styles.
*
* @param {string} templateId
* @param {{
*   fileName: string,
*   placeholders: Record<string,string>
* }} opts
* @returns {{ fileId: string, fileUrl: string }}
*/
function generateLOIDocFromTemplate(templateId, opts) {
    // Open the template document
    const templateDoc = DocumentApp.openById(templateId);
    const templateBody = templateDoc.getBody();

    // Create a new temporary document
    const tempDoc = DocumentApp.create(opts.fileName || 'LOI');
    const tempBody = tempDoc.getBody();
    const tempDocId = tempDoc.getId();

    // Copy each element from the template to the temporary document
    const numElements = templateBody.getNumChildren();
    for (let i = 0; i < numElements; i++) {
        const element = templateBody.getChild(i).copy(); // Clone the element to preserve formatting

        // Append the copied element based on its type
        switch (element.getType()) {
            case DocumentApp.ElementType.PARAGRAPH:
                tempBody.appendParagraph(element.asParagraph());
                break;
            case DocumentApp.ElementType.LIST_ITEM:
                // tempBody.appendListItem(element.asListItem());
                const sourceListItem = element.asListItem();
                const listText = sourceListItem.getText();
                const glyphType = sourceListItem.getGlyphType();
                const nestingLevel = sourceListItem.getNestingLevel();

                // Append the list item with the same text
                const newListItem = tempBody.appendListItem(listText);

                // Set the glyph type and nesting level to match the source
                newListItem.setGlyphType(glyphType);
                newListItem.setNestingLevel(nestingLevel);

                // Copy text attributes from source to new list item
                copyTextAttributes(sourceListItem, newListItem);
                break;
            case DocumentApp.ElementType.TABLE:
                tempBody.appendTable(element.asTable());
                break;
            case DocumentApp.ElementType.TABLE_ROW:
                //@ts-ignore
                tempBody.appendTableRow(element.asTableRow());
                break;
            case DocumentApp.ElementType.TEXT:
                //@ts-ignore
                tempBody.appendParagraph(element.asText());
                break;
            default:
                // For unsupported elements, skip or log
                Logger.log(`Unsupported element type: ${element.getType()}`);
        }
    }

    // Replace placeholders with actual data
    var map = opts.placeholders || {};
    for (var key in map) {
        var value = String(map[key] ?? '');
        // {{ Token }}
        tempBody.replaceText('{{\\s*' + escapeRegExp(key) + '\\s*}}', value);
        // <token> (case-insensitive: try original + lowercased key)
        tempBody.replaceText('<\\s*' + escapeRegExp(key) + '\\s*>', value);
        tempBody.replaceText('<\\s*' + escapeRegExp(String(key).toLowerCase()) + '\\s*>', value);
    }

    tempDoc.saveAndClose();

    return { fileId: tempDocId, fileUrl: tempDoc.getUrl() };
}

// --- helpers ---

// Helper: convert 'A'..'Z'..'AA' -> number
const colToNumber = (col) => {
    var n = 0;
    for (var i = 0; i < col.length; i++) {
        n = n * 26 + (col.charCodeAt(i) - 64);
    }
    return n;
}

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace tokens inside the given pattern using values from row/index map */
function renderName(pattern, row, tokenCols) {
    var name = pattern;
    for (var ph in tokenCols) {
        var idx = tokenCols[ph];
        name = name.replace(new RegExp('{{\\s*' + escapeRegExp(ph) + '\\s*}}', 'g'), (row[idx] || ''));
    }
    // Clean up any leftover illegal filename chars
    return name.replace(/[/\\:*?"<>|]/g, ' ').trim() || 'LOI';
}
/** Ensure LOI_Queue exists with headers; returns sheet. */
export const queueEnsureSheet = () => {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(LOI_QUEUE_NAME);
    if (!sh) {
        sh = ss.insertSheet(LOI_QUEUE_NAME);
        sh.getRange(1, 1, 1, LOI_QUEUE_HEADERS.length).setValues([LOI_QUEUE_HEADERS]);
        sh.setFrozenRows(1);
        sh.autoResizeColumns(1, LOI_QUEUE_HEADERS.length);
    } else {
        // Make sure all columns exist (append any missing headers to the right)
        var lastCol = sh.getLastColumn();
        var head = sh.getRange(1, 1, 1, Math.max(lastCol, LOI_QUEUE_HEADERS.length)).getValues()[0];
        var missing = LOI_QUEUE_HEADERS.filter(function (h) { return head.indexOf(h) === -1; });
        if (missing.length) {
            sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
        }
    }
    PropertiesService.getDocumentProperties().setProperty('LOI_QUEUE_SCHEMA_VERSION', '1');
    return {
        name: LOI_QUEUE_NAME,
        headers: LOI_QUEUE_HEADERS,
        sh,
    };
}

/** Append multiple queue rows (array of plain objects keyed by LOI_QUEUE_HEADERS). */
export const queueAppendItems = (items) => {
    if (!items || !items.length) return 0;
    var { sh } = queueEnsureSheet();
    var headerRow = sh.getRange(1, 1, 1, LOI_QUEUE_HEADERS.length).getValues()[0];
    var rows = items.map(function (it) {
        return LOI_QUEUE_HEADERS.map(function (h) { return it[h] == null ? '' : it[h]; });
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, LOI_QUEUE_HEADERS.length).setValues(rows);
    return rows.length;
}

/** Small, stable hash of mapping for versioning (base64 web-safe). */
export const mappingVersion = (mapping) => {
    var json = JSON.stringify(mapping || {});
    var bytes = Utilities.newBlob(json).getBytes();
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
    return Utilities.base64EncodeWebSafe(digest).slice(0, 16); // short label
}

export const queueExists = () => {
    return !!SpreadsheetApp.getActive().getSheetByName(LOI_QUEUE_NAME);
}