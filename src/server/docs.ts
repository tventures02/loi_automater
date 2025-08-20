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

// Helper: convert 'A'..'Z'..'AA' -> number
const colToNumber = (col) => {
    var n = 0;
    for (var i = 0; i < col.length; i++) {
        n = n * 26 + (col.charCodeAt(i) - 64);
    }
    return n;
}

/** Preflight: count rows, validate emails, build a sample filename. */
export const preflightGenerateLOIs = (payload) => {
    const ss = SpreadsheetApp.getActive();
    const sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : ss.getActiveSheet();
    if (!sheet) throw new Error('Sheet not found');

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) {
        return { ok: false, totalRows: 0, eligibleRows: 0, invalidEmails: 0, missingValuesRows: 0, sampleFileName: '' };
    }

    const range = sheet.getRange(1, 1, lastRow, Math.min(lastCol, 8)); // A..H only
    const values = range.getDisplayValues();

    const emailColLetter = payload.emailColumn;
    if (!emailColLetter) {
        return { ok: false, totalRows: values.length, eligibleRows: 0, invalidEmails: 0, missingValuesRows: 0, sampleFileName: '' };
    }
    const emailIndex = colToNumber_(emailColLetter) - 1;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let eligible = 0, invalid = 0, missingValsRows = 0;

    // Sample file name from first row
    const mapping = payload.mapping || {};
    const first = values[0] || [];
    let sampleName = payload.pattern || "LOI - {{address}}";
    Object.keys(mapping).forEach(ph => {
        if (ph === '__email') return;
        const idx = colToNumber_(mapping[ph]) - 1;
        sampleName = sampleName.replace(new RegExp('{{\\s*' + escapeRegExp_(ph) + '\\s*}}', 'g'), (first[idx] || ''));
    });

    values.forEach(row => {
        const email = (row[emailIndex] || '').toString().trim();
        if (!email || !emailRegex.test(email)) { invalid++; return; }
        // Simple completeness check: ensure mapped token cols have any value
        let missing = false;
        for (const ph in mapping) {
            if (ph === '__email') continue;
            const idx = colToNumber_(mapping[ph]) - 1;
            if (!row[idx]) { missing = true; break; }
        }
        if (missing) { missingValsRows++; }
        eligible++;
    });

    const ok = eligible > 0;
    return {
        ok, totalRows: values.length, eligibleRows: eligible, invalidEmails: invalid,
        missingValuesRows: missingValsRows, sampleFileName: sampleName
    };
}

/**
 * Generate LOIs as Google Docs (no PDF) and write results to a new run sheet.
 * - Copies the source sheet (A..H) into a new tab.
 * - Adds columns: "Doc URL", "Sent" (default "No").
 * - For each eligible row: creates a Doc copy of the template, replaces tokens,
 *   and writes its URL into the run sheet.
 *
 * @param {{
*   mapping: Record<string,string>,     // e.g. { Address: 'A', AgentName: 'B', __email: 'H', ... }
*   emailColumn: string,                // e.g. 'H'
*   pattern: string,                    // filename pattern like "LOI - {{Address}} - {{AgentName}}"
*   templateDocId: string,              // Google Doc template ID
*   sheetName?: string | null           // optional: specific sheet to read from
* }} payload
* @return {{
*   created: number,
*   skippedInvalid: number,
*   failed: number,
*   runSheetName: string,
*   statuses: Array<{ row: number, status: "ok"|"skipped"|"failed", message?: string, docUrl?: string }>
* }}
*/
export const generateLOIsAndWriteSheet = (payload) => {
    const ss = SpreadsheetApp.getActive();
    const source = payload.sheetName ? ss.getSheetByName(payload.sheetName) : ss.getActiveSheet();
    if (!source) throw new Error('Sheet not found');

    const lastRow = source.getLastRow();
    const lastCol = source.getLastColumn();
    if (lastRow < 2) {
        return { created: 0, skippedInvalid: 0, failed: 0, runSheetName: "", statuses: [] };
    }

    // Build run sheet (copy A..H only)
    const runName = 'LOI Automater Run';
    const runSheet = ss.insertSheet(runName);
    var width = Math.min(lastCol, 8); // A..H only
    var data = source.getRange(1, 1, lastRow, width).getDisplayValues();

    // Build header names for A..H from mapping; fallback "Col A" etc.
    var headers = [];
    for (var c = 0; c < width; c++) {
        headers[c] = 'Col ' + String.fromCharCode(65 + c); // 'Col A', 'Col B', ...
    }

    var mapping = payload.mapping || {};
    // Placeholders to column indexes
    for (var ph in mapping) {
        if (ph === '__email') continue;
        var colLetter = mapping[ph];
        if (!colLetter) continue;
        var idx = colToNumber_(colLetter) - 1;
        if (idx >= 0 && idx < width) headers[idx] = ph;
    }
    // Email column label
    var emailColLetter = payload.emailColumn || mapping.__email;
    var eIdx = null;
    if (emailColLetter) {
        eIdx = colToNumber_(emailColLetter) - 1;
        if (eIdx >= 0 && eIdx < width) headers[eIdx] = 'Email';
    }

    // Write headers (row 1) + data (from row 2)
    runSheet.getRange(1, 1, 1, width).setValues([headers]);
    if (data.length) runSheet.getRange(2, 1, data.length, width).setValues(data);

    // Append "Doc URL" and "Sent"
    var docCol = width + 1;
    var sentCol = width + 2;
    runSheet.getRange(1, docCol).setValue('Doc URL');
    runSheet.getRange(1, sentCol).setValue('Sent');
    if (data.length) runSheet.getRange(2, sentCol, data.length, 1).setValue('No');

    // Build token -> column index map for rendering names / replacements
    var tokenCols = {};
    Object.keys(mapping).forEach(function (ph) {
        if (ph === '__email') return;
        var letter = mapping[ph];
        if (!letter) return;
        var idx = colToNumber_(letter) - 1;
        if (idx >= 0 && idx < width) tokenCols[ph] = idx;
    });

    var statuses = [];
    var created = 0, skippedInvalid = 0, failed = 0;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (var r = 0; r < data.length; r++) {
        const row = data[r];
        const email = (row[eIdx] || '').toString().trim();

        if (!email || !emailRegex.test(email)) {
            skippedInvalid++;
            statuses.push({ row: r + 2, status: 'skipped', message: 'Invalid or empty email' });
            continue;
        }

        try {
            // Build placeholder values for this row
            var placeholders = {};
            for (var ph in tokenCols) placeholders[ph] = row[tokenCols[ph]] || '';

            // Compute target Doc name from pattern
            var fileName = renderName_(payload.pattern || "LOI", row, tokenCols);

            // Create a Doc from template and replace tokens
            var docInfo = generateLOIDocFromTemplate(payload.templateDocId, {
                fileName: fileName,
                placeholders: placeholders
            });

            // Write Doc URL into run sheet
            runSheet.getRange(r + 2, docCol).setValue(docInfo.fileUrl);

            created++;
            statuses.push({ row: r + 2, status: 'ok', docUrl: docInfo.fileUrl });
        } catch (e) {
            console.error(`Error generating doc for row ${r + 2}: ${e.toString()}`);
            failed++;
            statuses.push({ row: r + 2, status: 'failed', message: String(e) });
        }
    }

    return {
        created,
        skippedInvalid,
        failed,
        runSheetName: runName,
        statuses,
    };
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
        tempBody.replaceText('{{\\s*' + escapeRegExp_(key) + '\\s*}}', value);
        // <token> (case-insensitive: try original + lowercased key)
        tempBody.replaceText('<\\s*' + escapeRegExp_(key) + '\\s*>', value);
        tempBody.replaceText('<\\s*' + escapeRegExp_(String(key).toLowerCase()) + '\\s*>', value);
    }

    tempDoc.saveAndClose();

    return { fileId: tempDocId, fileUrl: tempDoc.getUrl() };
}

// --- helpers ---

function colToNumber_(col) {
    var n = 0;
    for (var i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
    return n;
}

function escapeRegExp_(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace tokens inside the given pattern using values from row/index map */
function renderName_(pattern, row, tokenCols) {
    var name = pattern;
    for (var ph in tokenCols) {
        var idx = tokenCols[ph];
        name = name.replace(new RegExp('{{\\s*' + escapeRegExp_(ph) + '\\s*}}', 'g'), (row[idx] || ''));
    }
    // Clean up any leftover illegal filename chars
    return name.replace(/[/\\:*?"<>|]/g, ' ').trim() || 'LOI';
}


/**
 * Ensure the central queue sheet exists with headers; return metadata.
 * Name: _LOI_Queue
 * Schema v1 (minimal):
 * id • sourceSheet • sourceRow • email • docId • docUrl • templateId • mappingVersion
 * status • scheduledAt • sentAt • attempts • lastError • createdAt • updatedAt
 */
export const queueEnsureSheet = () => {
    var ss = SpreadsheetApp.getActive();
    var name = 'LOI_Queue';
    var HEADERS = [
        'id', 'sourceSheet', 'sourceRow', 'email', 'docId', 'docUrl', 'templateId', 'mappingVersion',
        'status', 'scheduledAt', 'sentAt', 'attempts', 'lastError', 'createdAt', 'updatedAt'
    ];

    var sh = ss.getSheetByName(name);
    if (!sh) {
        sh = ss.insertSheet(name);
    }

    // If empty or no headers, set them
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow === 0 || lastCol === 0) {
        sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
        sh.setFrozenRows(1);
        sh.autoResizeColumns(1, HEADERS.length);
    } else {
        // Light sanity: ensure all required headers exist (append missing to the right)
        var existing = sh.getRange(1, 1, 1, Math.max(lastCol, HEADERS.length)).getValues()[0];
        var missing = HEADERS.filter(function (h) { return existing.indexOf(h) === -1; });
        if (missing.length) {
            sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
        }
    }

    // mark schema version (for future migrations)
    PropertiesService.getDocumentProperties().setProperty('LOI_QUEUE_SCHEMA_VERSION', '1');

    return {
        name: name,
        sheetId: sh.getSheetId(),
        headers: HEADERS
    };
}

export const queueExists = () => {
    return !!SpreadsheetApp.getActive().getSheetByName('LOI_Queue');
}
