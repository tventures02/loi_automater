import { QueueItem } from "../client/sidebar/components/Sidebar";

var LOI_QUEUE_NAME = 'Sender Queue';
var LOI_QUEUE_HEADERS = [
    'id', 'sourceSheet', 'sourceRow', 'email', 'docId', 'docUrl', 'templateId', 'mappingVersion',
    'status', 'sentAt', 'attempts', 'lastError', 'createdAt', 'subject', 'body', 'useLOIAsBody', 'attachPdf'
];
export type DocInfo = {
    id: string;
    name?: string; // Optional because it might not be found
    error?: string; // Optional for when an error occurs
};
const QUEUE_DISPLAY_LIMIT = 500;

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


/** Normalize any cell value to a stable string for hashing */
function normValForKey(v) {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString();
    return String(v).replace(/\r\n?/g, '\n').trim(); // normalize newlines + trim
}

function makeContentKey(row, tokenCols, emailIndex, templateId, mapVersion) {
    var parts = ['v1', String(templateId || ''), String(mapVersion || '')];

    // normalize email
    const email = normValForKey(row[emailIndex]).toLowerCase();
    parts.push(email);

    // include every placeholder value in a stable order
    var names = Object.keys(tokenCols).sort();
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var idx = tokenCols[name];
        const val = normValForKey(row[idx]);
        // name=value keeps semantic clarity before hashing
        parts.push(name + '=' + val);
    }

    // console.log('KEY_RAW:', JSON.stringify(parts));

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
        const content = `Sample Letter\n\nHi {{agent_name}},\n\nI’m interested in purchasing the property at {{address}} and would like to make an offer of {{offer}}. I’d be ready to close around {{closing date}}, pending agreement on final terms.\n\nBest,\n{{buyer_name}}\n\n`;

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
 *  All tracking/sending will be handled via Sender Queue.
 */
export const preflightGenerateLOIs = (payload) => {
    const ss = SpreadsheetApp.getActive();
    const sheet = payload.sheetName ? ss.getSheetByName(payload.sheetName) : ss.getActiveSheet();
    if (!sheet) throw new Error('Sheet not found');
    if (sheet.getName().startsWith('Sender Queue')) throw new Error('Sender Queue is not a raw data sheet.');
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

function normHeader(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Find header -> index map for a sheet's first row. */
function headerIndexMap(sh) {
    var lastCol = sh.getLastColumn();
    if (!lastCol) return {};
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var map = {};
    headers.forEach((h, i) => { map[normHeader(h)] = i; });
    return map;
}

function renderStringTpl_(tpl, row, tokenCols) {
    if (!tpl) return '';
    var out = String(tpl);
    var names = Object.keys(tokenCols);
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var idx = tokenCols[name];
        var val = (row[idx] || '').toString();
        var re = new RegExp('{{\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*}}', 'g');
        out = out.replace(re, val);
    }
    return out;
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

        // Seed existing IDs
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

        // Email settings
        const emailSubjectTpl = payload.emailSubjectTpl || 'Letter of Intent';
        const emailBodyTpl = payload.emailBodyTpl || '';
        const useLOIAsBody = !!payload.useLOIAsBody;
        const attachPdf = !!payload.attachPdf; // stored for later send step

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

            // Skip duplicates already present in Sender Queue
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

                // Compute SUBJECT and BODY now (so future sends don’t depend on changed templates)
                const subjectResolved = renderStringTpl_(emailSubjectTpl, row, tokenCols);

                let bodyResolved = '';
                if (useLOIAsBody) {
                    // Use the final generated Doc text (already token-replaced)
                    try {
                        const body = DocumentApp.openById(docInfo.fileId).getBody().getText() || '';
                        bodyResolved = body;
                    } catch (e) {
                        // Fallback: render from placeholders (plain text)
                        bodyResolved = renderStringTpl_(emailBodyTpl, row, tokenCols);
                    }
                } else {
                    // Use the plain text template the user provided
                    bodyResolved = renderStringTpl_(emailBodyTpl, row, tokenCols);
                }

                // Queue row in Sender Queue
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

                    // NEW email fields
                    subject: subjectResolved,
                    body: bodyResolved,
                    useLOIAsBody: useLOIAsBody ? 'TRUE' : 'FALSE', // store as strings for Sheets
                    attachPdf: attachPdf ? 'TRUE' : 'FALSE'
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

        // Bulk append to Sender Queue
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
/** Ensure Sender Queue exists with headers; returns sheet. */
export const queueEnsureSheet = () => {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(LOI_QUEUE_NAME);
    let newlyCreated = false;
    if (!sh) {
        sh = ss.insertSheet(LOI_QUEUE_NAME);
        sh.getRange(1, 1, 1, LOI_QUEUE_HEADERS.length).setValues([LOI_QUEUE_HEADERS]);
        sh.setFrozenRows(1);
        sh.autoResizeColumns(1, LOI_QUEUE_HEADERS.length);
        newlyCreated = true;
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
        newlyCreated,
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

/** Stable, short fingerprint of the mapping (incl. __email) */
function mappingVersion(mapping) {
    const parts = [];
    const keys = Object.keys(mapping).sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = String(mapping[k] || '').trim().toUpperCase(); // normalize letter
        parts.push(k + '=' + v);
    }
    const raw = parts.join('|');
    const bytes = Utilities.newBlob(raw, 'text/plain').getBytes(); // lock encoding
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
    return Utilities.base64EncodeWebSafe(digest).slice(0, 10); // short & stable
}


export const queueExists = () => {
    return !!SpreadsheetApp.getActive().getSheetByName(LOI_QUEUE_NAME);
}

export const queueStatus = () => {
    const exists = queueExists();
    return {
        exists,
        empty: exists ? SpreadsheetApp.getActive().getSheetByName(LOI_QUEUE_NAME)?.getLastRow() <= 1 : true,
    }
}

/** Return basic counters for Sender from Sender Queue. */
export const getSendSummary = () => {
    const qSheetRes = queueEnsureSheet();
    const sh = qSheetRes.sh;
    const head = headerIndexMap(sh);
    const lastRow = sh.getLastRow();

    let queued = 0, sent = 0, failed = 0;
    if (lastRow > 1) {
        const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
        const iStatus = head['status'];

        for (let r = 0; r < vals.length; r++) {
            const row = vals[r];
            const status = String(row[iStatus] || '').toLowerCase();
            if (status === 'queued') queued++;
            else if (status === 'sent') {
                sent++
            }
            else if (status === 'failed') {
                failed++
            }
        }
    }

    const remaining = MailApp.getRemainingDailyQuota();
    return { remaining, queued, sent, failed, userEmail: Session.getActiveUser().getEmail(), total: lastRow - 1 };
};

export const queueList = (payload) => {
    try {
        const statusFilter = String(payload?.status || 'all').toLowerCase();
        const limit = Math.max(1, Math.min(QUEUE_DISPLAY_LIMIT, Number(payload?.limit || 50)));

        const qSheetRes = queueEnsureSheet();
        const sh = qSheetRes.sh;
        const head = headerIndexMap(sh);
        const lastRow = sh.getLastRow();

        if (lastRow <= 1) return { items: [] };

        const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
        const iId = head['id'];
        const iEmail = head['email'];
        const iDocUrl = head[normHeader('docUrl')];
        const iStatus = head['status'];
        const iLastError = head[normHeader('lastError')];
        const iCreatedAt = head[normHeader('createdAt')];
        const iSubject = head[normHeader('subject')];
        const iSourceRow = head[normHeader('sourceRow')];
        const iAttachPdf = head[normHeader('attachPdf')];

        // Build objects; sort by createdAt desc, then id
        const items = vals.map((row, index) => {
            const queueItem: QueueItem = {
                id: String(row[iId] || ''),
                recipient: String(row[iEmail] || ''),
                address: '', // optional if you later add a column
                docUrl: String(row[iDocUrl] || ''),
                status: String(row[iStatus] || '').toLowerCase() as "queued" | "sent" | "failed",
                lastError: row[iLastError] || '',
                createdAt: row[iCreatedAt] ? new Date(row[iCreatedAt]) : new Date(0),
                subject: row[iSubject] || '',
                sourceRow: row[iSourceRow] || '',
                attachPdf: String(row[iAttachPdf] || '')?.toLowerCase() === 'true' || false,
                queueTabRow: index + 2,
            }
            return queueItem;
        })
        //@ts-ignore
        //.sort((a, b) => (b.createdAt - a.createdAt));

        const filtered = statusFilter === 'all' ? items : items.filter(it => it.status === statusFilter);

        return { items: filtered.slice(0, limit).map(({ createdAt, ...rest }) => rest) };
    } catch (error) {
        console.log('error', error)
        throw error;
    }
};


export const sendNextBatch = (payload) => {
    const qSheetRes = queueEnsureSheet();
    const sh = qSheetRes.sh;
    const head = headerIndexMap(sh);
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) return { sent: 0, failed: 0, attempted: 0 };

    // Normalize controls
    const attachPolicy = String(payload?.attachPolicy || 'respect').toLowerCase(); // 'respect' | 'forceon' | 'forceoff'
    const stopOnError = !!payload?.stopOnError;

    const lock = LockService.getDocumentLock();    
    try {
        if (!lock.tryLock(10 * 1000)) throw new Error('Another send is in progress, try again soon.');

        const remaining = MailApp.getRemainingDailyQuota();
        const requestedRaw = Number(payload?.count ?? 100);
        const requested = Math.max(1, Math.min(1000, isFinite(requestedRaw) ? requestedRaw : 100));
        const testMode = !!payload?.testMode;
        const previewTo = String(payload?.previewTo || Session.getActiveUser().getEmail() || "");
        // Cap by remaining quota in both modes (avoid quota errors)
        const effectiveMax = Math.min(requested, remaining);
        if (effectiveMax <= 0) return { sent: 0, failed: 0, attempted: 0, testMode };

        // Indices (0-based). Some may be undefined if columns don't exist.
        const iId = head[normHeader('id')];
        const iEmail = head[normHeader('email')];
        const iDocId = head[normHeader('docId')];
        const iDocUrl = head[normHeader('docUrl')];
        const iStatus = head[normHeader('status')];
        const iSentAt = head[normHeader('sentAt')];
        const iAttempts = head[normHeader('attempts')];
        const iLastError = head[normHeader('lastError')];
        const iCreatedAt = head[normHeader('createdAt')];

        // New email-related columns (rendered at generate time)
        const iSubject = head[normHeader('subject')];     // optional
        const iBody = head[normHeader('body')];        // optional (plain text)
        const iAttachPdf = head[normHeader('attachPdf')];  // optional (TRUE/FALSE)
        const iUseDocBody = coalesce(
            head[normHeader('useLOIAsBody')],
            head[normHeader('useDocBody')] // legacy fallback if needed
        );

        // Read all data rows
        const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

        // Build list of queued rows (oldest first)
        const queued = [];
        for (let r = 0; r < vals.length; r++) {
            const row = vals[r];
            const status = String(safeAt(row, iStatus) || '').toLowerCase();
            if (status !== 'queued') continue;

            queued.push({
                r,
                rowIndex: r + 2,
                email: String(safeAt(row, iEmail) || ''),
                docId: String(safeAt(row, iDocId) || ''),
                docUrl: String(safeAt(row, iDocUrl) || ''),
                subject: String(safeAt(row, iSubject) || ''), // may be empty
                body: String(safeAt(row, iBody) || ''),       // may be empty
                attempts: Number(safeAt(row, iAttempts) || 0),
                createdAt: safeAt(row, iCreatedAt) ? new Date(safeAt(row, iCreatedAt)) : new Date(0),
                attachPdf: asBool(safeAt(row, iAttachPdf) || false),
                useDocBody: asBool(safeAt(row, iUseDocBody) || false),
                lastError: String(safeAt(row, iLastError) || '')
            });
        }
        // queued.sort((a, b) => (a.createdAt - b.createdAt) || (a.rowIndex - b.rowIndex));

        const batch = queued.slice(0, effectiveMax);

        // Fallbacks in case subject/body not present
        const defaultSubject = String(payload?.subject || 'Letter of Intent');
        const defaultBodyMaker = (docUrl) =>
            String(payload?.bodyTemplate ||
                `Hello,\n\nPlease review the Letter of Intent attached.\n\nBest regards`);

        // Cache Doc body text to avoid re-open for same docId
        const docBodyCache = Object.create(null);

        let sent = 0, failed = 0, attempted = 0;
        for (let k = 0; k < batch.length; k++) {
            const item = batch[k];
            const now = new Date();
            const newAttempts = (item.attempts || 0) + 1;

            try {
                // Determine subject/body from row; fall back if missing
                const rowSubject = item.subject && item.subject.trim().length ? item.subject.trim() : defaultSubject;
                const finalSubject = testMode ? `[TEST] ${rowSubject}` : rowSubject;

                // BODY
                let rowBody = (item.body && item.body.trim()) ? item.body : "";
                if (!rowBody && item.useDocBody && item.docId) {
                    if (!docBodyCache[item.docId]) {
                        docBodyCache[item.docId] = buildPlainTextFromDoc(item.docId);
                    }
                    rowBody = docBodyCache[item.docId] || "";
                }
                if (!rowBody) rowBody = defaultBodyMaker(item.docUrl || "");

                // Test mode: send previews to the user; Real mode: send to recipient
                const to = testMode ? previewTo : item.email;

                // ATTACHMENTS with attachPolicy
                // - 'respect': use per-row attachPdf flag
                // - 'forceon': always attach if docId present
                // - 'forceoff': never attach
                const policy = attachPolicy;
                const wantAttach =
                    policy === 'forceoff' ? false :
                        policy === 'forceon' ? !!item.docId :
                            (item.attachPdf && !!item.docId);

                let attachments = null;
                if (wantAttach) {
                    try {
                        const pdf = generateLOIPDF(item.docId, item.docId);
                        if (pdf) attachments = [pdf];
                    } catch (_) {
                        // fail soft: skip attachment if PDF generation fails
                    }
                }

                MailApp.sendEmail({ to, subject: finalSubject, body: rowBody, attachments });

                if (!testMode) {
                    // Update status -> sent; attempts +1; clear lastError; set sentAt
                    if (iStatus != null) sh.getRange(item.rowIndex, iStatus + 1).setValue('sent');
                    if (iSentAt != null) sh.getRange(item.rowIndex, iSentAt + 1).setValue(now);
                    if (iAttempts != null) sh.getRange(item.rowIndex, iAttempts + 1).setValue(newAttempts);
                    if (iLastError != null) sh.getRange(item.rowIndex, iLastError + 1).setValue('');
                }
                sent++;
            } catch (err) {
                if (!testMode) {
                    if (iStatus != null) sh.getRange(item.rowIndex, iStatus + 1).setValue('failed');
                    if (iSentAt != null) sh.getRange(item.rowIndex, iSentAt + 1).setValue(''); // not sent
                    if (iAttempts != null) sh.getRange(item.rowIndex, iAttempts + 1).setValue(newAttempts);
                    if (iLastError != null) sh.getRange(item.rowIndex, iLastError + 1).setValue(String(err));
                }
                failed++;

                // Stop on first error if requested
                if (stopOnError) {
                    attempted = k + 1; // processed this many (including the failure)
                    return { sent, failed, attempted, testMode, stoppedEarly: true, creditsLeft: MailApp.getRemainingDailyQuota() };
                }
            }
        }

        return { sent, failed, attempted: batch.length, testMode, creditsLeft: MailApp.getRemainingDailyQuota() };
    }
    catch (error) {
        console.log('error', error)
        lock.releaseLock();
        throw error;
    }
    finally {
        lock.releaseLock();
    }

    // Helpers
    function safeAt(arr, i) {
        return (i == null || i < 0 || i >= arr.length) ? undefined : arr[i];
    }
    function asBool(v) {
        if (v === true || v === false) return v;
        const s = String(v || '').trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'y';
    }
    function coalesce(...xs) {
        for (let i = 0; i < xs.length; i++) if (xs[i] != null) return xs[i];
        return null;
    }
};

// Update one queue row’s status by ID.
// Allowed statuses: queued | paused | sent | failed
export const queueUpdateStatus = (payload) => {
    const id = String(payload?.id || '').trim();
    const newStatus = String(payload?.status || '').trim().toLowerCase();
    const allowed = new Set(['queued', 'paused', 'sent', 'failed']);
    if (!id) throw new Error('Missing id');
    if (!allowed.has(newStatus)) throw new Error('Invalid status');

    const { sh } = queueEnsureSheet();
    const head = headerIndexMap(sh);
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) throw new Error('Queue is empty');

    const iId = head[normHeader('id')];
    const iStatus = head[normHeader('status')];
    const iSentAt = head[normHeader('sentAt')];
    const iLastErr = head[normHeader('lastError')];
    const iAttempts = head[normHeader('attempts')];

    // Read IDs once
    const ids = sh.getRange(2, iId + 1, lastRow - 1, 1).getValues().map(r => String(r[0] || ''));
    const idx = ids.findIndex(v => v === id);
    if (idx === -1) throw new Error('ID not found');

    const rowIndex = idx + 2; // convert to sheet row
    const now = new Date();

    // Write status
    sh.getRange(rowIndex, iStatus + 1).setValue(newStatus);

    // Minimal hygiene on related columns
    if (newStatus === 'queued') {
        if (iLastErr != null) sh.getRange(rowIndex, iLastErr + 1).setValue('');
        // keep sentAt as-is (blank or past)
    } else if (newStatus === 'sent') {
        if (iSentAt != null) sh.getRange(rowIndex, iSentAt + 1).setValue(now);
    } else if (newStatus === 'failed') {
        // no-op
    } else if (newStatus === 'paused') {
        // ensure it won't be picked up by sender; no further changes needed
    }

    return { id, status: newStatus, rowIndex };
};


/** Remove ALL rows from Sender Queue except the header row. */
export const queueClearAll = () => {
    const { sh } = queueEnsureSheet(); // your existing helper
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) return { cleared: 0, remaining: 0 };

    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(10_000)) {
        throw new Error('Another operation is in progress. Try again soon.');
    }
    try {
        const rows = lastRow - 1; // everything below the header
        sh.getRange(2, 1, rows, sh.getLastColumn()).clearContent(); // keep header, formatting
        return { cleared: rows, remaining: 0 };
    } finally {
        lock.releaseLock();
    }
};

/**
   * Build a plain-text email body from a Google Doc, preserving paragraph breaks,
   * list bullets (•) and basic table structure with tabs.
   */
function buildPlainTextFromDoc(docId: string) {
    try {
        const doc = DocumentApp.openById(docId);
        const body = doc.getBody();
        if (!body) return "";

        const parts = [];
        const n = body.getNumChildren();

        for (let i = 0; i < n; i++) {
            const el = body.getChild(i);
            const t = el.getType();

            if (t === DocumentApp.ElementType.PARAGRAPH) {
                const p = el.asParagraph();
                const txt = p.getText() || "";
                // Headings just become paragraphs in plain text
                parts.push(txt);
            }
            else if (t === DocumentApp.ElementType.LIST_ITEM) {
                const li = el.asListItem();
                const depth = Math.max(0, li.getNestingLevel() || 0);
                const indent = depth > 0 ? Array(depth + 1).join("  ") : "";
                const bullet = "• ";
                parts.push(indent + bullet + (li.getText() || ""));
            }
            else if (t === DocumentApp.ElementType.TABLE) {
                const table = el.asTable();
                for (let r = 0; r < table.getNumRows(); r++) {
                    const row = table.getRow(r);
                    const cells = [];
                    for (let c = 0; c < row.getNumCells(); c++) {
                        cells.push(row.getCell(c).getText() || "");
                    }
                    // tab-separated row; add a line per row
                    parts.push(cells.join("\t"));
                }
            }
            else if (t === DocumentApp.ElementType.TABLE_ROW) {
                // Rarely encountered directly; treat as a single row
                const tr = el.asTableRow();
                const cells = [];
                for (let c = 0; c < tr.getNumCells(); c++) {
                    cells.push(tr.getCell(c).getText() || "");
                }
                parts.push(cells.join("\t"));
            }
            else if (t === DocumentApp.ElementType.TEXT) {
                parts.push(el.asText().getText() || "");
            }
            // Ignore images, page breaks, drawings, etc. for plain text
        }

        // Join with newlines, compact excessive blank lines a bit
        let out = parts.join("\n");
        out = out.replace(/\n{3,}/g, "\n\n").trim();
        return out;
    } catch (e) {
        // Fail soft: caller will use fallback body
        return "";
    }
}


function generateLOIPDF(docId: string, pdfName: string) {
    // Open the template document
    const doc = DocumentApp.openById(docId);

    doc.saveAndClose();

    // Convert the document to a PDF blob
    const pdfBlob = doc.getAs('application/pdf').setName(`${pdfName}.pdf`);
    return pdfBlob; // Return the PDF blob
}


export const getSheetNames = () => {
    const ss = SpreadsheetApp.getActive();
    return ss.getSheets().map(s => s.getName()).filter(s => s !== LOI_QUEUE_NAME);
};

export const getActiveSheetName = () => {
    return SpreadsheetApp.getActive().getActiveSheet().getName();
};

/**
 * Show (unhide) the "Send Queue" tab and make it active.
 * Creates the sheet if it doesn't exist.
 */
export const showSendQueueTab = () => {
    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName(LOI_QUEUE_NAME);
    if (sh) {
        // Unhide if hidden, then activate
        sh.showSheet();
        ss.setActiveSheet(sh);
    }
}

export const highlightQueueRow = (rowNumber: number) => {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(LOI_QUEUE_NAME);
    if (sh) {        
        const rangeToInsertRow = sh.getRange(rowNumber, 1,1, sh.getLastColumn());
        sh.setActiveRange(rangeToInsertRow); // highlight row in sheet
    }
}