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
const ROOT_FOLDER_NAME = 'LOI Mailer';
const TEMPLATES_FOLDER_NAME = 'LOI Templates';
const OUTPUT_FOLDER_NAME = 'LOIs';

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

function makeContentKey(
    row,
    tokenCols,
    emailIndex,
    templateId,
    mapVersion,
    filenamePattern = '',
    emailSubjectTpl = '',
    attachPdf = false,
) {
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
    if (filenamePattern) {
        parts.push(filenamePattern);
    }
    if (emailSubjectTpl) {
        parts.push(emailSubjectTpl);
    }
    if (attachPdf) {
        parts.push(attachPdf ? 'true' : 'false');
    }

    // Uncomment to check the raw key
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
 * Creates a new Google Doc in the LOI Templates folder (or a provided folder).
 * Requires Advanced Drive API (v2) enabled and the drive.file scope.
 *
 * @param {string} docTitle - The title for the new Google Document.
 * @param {string=} templatesFolderId - Optional folder id to create the doc in. If omitted, we ensure/find the "LOI Templates" folder.
 * @returns {{url: string, id: string, parentId: string}} An object containing the URL, ID, and parent folder ID.
 */
export const createGoogleDoc = (docTitle: string, templatesFolderId?: string) => {
    try {
        // 1) Resolve target folder
        const folderId = templatesFolderId || loiEnsureTemplatesFolder(); // <- your ensure function

        // 2) Create the Doc directly inside the folder via Drive v2
        const title = (docTitle && docTitle.trim()) || 'New LOI Template';
        const file = Drive.Files.insert({
            title,
            mimeType: 'application/vnd.google-apps.document',
            parents: [{ id: folderId }]
        });

        // 3) Prime body with sample template content (optional)
        const doc = DocumentApp.openById(file.id);
        const body = doc.getBody();
        body.clear(); // ensure empty body
        const content = `Sample Letter (Edit me)\n\nHi {{agent_name}},\n\nI’m interested in purchasing the property at {{address}} and would like to make an offer of {{offer}}. I’d be ready to close around {{closing_date}}, pending agreement on final terms.\n\nBest,\n{{buyer_name}}\n\n`;
        body.appendParagraph(content);
        doc.saveAndClose();

        return {
            url: 'https://docs.google.com/document/d/' + file.id + '/edit',
            id: file.id,
            parentId: folderId,
        };
    } catch (error: any) {
        console.error(`Error creating document: ${error && error.message ? error.message : error}`);
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
    const outputFolderId = loiEnsureOutputFolder();
    const {
        user
    } = payload;
    

    const blocked = user.subscriptionStatusActive ? [] : columnsOverFree(payload.mapping || {}, payload.emailColumn || (payload.mapping||{}).__email);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 1) {
        return {
            ok: false,
            totalRows: 0,
            eligibleRows: 0,
            invalidEmails: 0,
            missingValuesRows: 0,
            sampleFileName: '',
            queueExists: queueExistsFlag,
            outputFolderId,
            blocked,
            limitedByPlan: blocked.length > 0,
        };
    }

    const width = Math.min(lastCol, 8); // A..H only
    const values = sheet.getRange(1, 1, lastRow, width).getDisplayValues();

    const mapping = payload.mapping || {};
    const emailColLetter = payload.emailColumn || mapping.__email;
    if (!emailColLetter) {
        return {
            ok: false,
            totalRows: values.length,
            eligibleRows: 0,
            invalidEmails: 0,
            missingValuesRows: 0,
            sampleFileName: '',
            queueExists: queueExistsFlag,
            outputFolderId,
            blocked,
            limitedByPlan: blocked.length > 0,
        };
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

    if (mapping.__email) {
        sampleName = sampleName.replace(/{{\s*email\s*}}/gi, String(first[emailIndex] || ''));
    }

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
        queueExists: queueExistsFlag,
        outputFolderId,
        blocked,
        limitedByPlan: blocked.length > 0,
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


export const generateLOIChunk = (payload) => {

    const {
        mapping = {},
        pattern = "LOI",
        templateDocId,
        emailSubjectTpl = "Letter of Intent",
        emailBodyTpl = "",
        useLOIAsBody = false,
        attachPdf = true,
        offset = 0,                  // 0-based data offset (row 2 == offset 0)
        limit = 100,                 // batch size
        includeStatuses = false,     // optional: return per-row statuses (can be large)
        user,
    } = payload || {};

    try {
        const ss = SpreadsheetApp.getActive();
        const source = payload.sheetName ? ss.getSheetByName(payload.sheetName) : ss.getActiveSheet();
        if (!source) throw new Error('Sheet not found');

        const lastRow = source.getLastRow();
        const lastCol = source.getLastColumn();
        const outFolderId = attachPdf ? loiEnsureOutputFolder() : '';
        if (lastRow < 2) {
            return { created: 0, skippedInvalid: 0, failed: 0, duplicates: 0, nextOffset: offset, done: true, totalRows: 0, outputFolderId: outFolderId };
        }

        if (!user.subscriptionStatusActive) {
            const emailColLetter = payload.emailColumn || (payload.mapping || {}).__email;
            const blocked = columnsOverFree(payload.mapping || {}, emailColLetter);
            if (blocked.length) {
                throw new Error('PLAN_LIMIT|' + JSON.stringify({ blocked, allowedMaxLetter: 'D' }));
            }
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
            return {
                created: 0, skippedInvalid: 0, failed: 0, duplicates: 0,
                nextOffset: offset, done: true, totalRows: 0, outputFolderId: outFolderId
            };
        }
        const eIdx = colToNumber(emailColLetter) - 1;

        // Row math for the chunk
        const totalRows = lastRow;
        const startRow = 1 + offset;                          // 1-based row in sheet
        const remaining = (lastRow - startRow + 1);
        const take = Math.max(0, Math.min(limit, remaining));
        if (take <= 0) {
            return { created: 0, skippedInvalid: 0, failed: 0, duplicates: 0, nextOffset: offset, done: true, totalRows, outputFolderId: outFolderId };
        }

        // const data = source.getRange(1, 1, lastRow, width).getDisplayValues(); //old
        const data = source.getRange(startRow, 1, take, width).getDisplayValues();

        // Email settings, template, folder
        const sourceSheetName = source.getName();
        const mapVersion = mappingVersion(mapping);
        const templateId = templateDocId;
        const filenamePattern = pattern;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // If we need to use the LOI text as the email body *without* creating a Doc,
        // cache the template doc's body text once and do token replacement per row.
        const templateBodyPlain =
            (useLOIAsBody && !attachPdf && templateId)
                ? (DocumentApp.openById(templateId).getBody().getText() || '')
                : '';

        let created = 0, skippedInvalid = 0, failed = 0, duplicates = 0;
        const statuses = [];
        const queueBatch = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const sourceRow = startRow + i;
            const email = (row[eIdx] || '').toString().trim();

            // Build deterministic content key as the queue ID
            const id = makeContentKey(row, tokenCols, eIdx, templateId, mapVersion, filenamePattern, emailSubjectTpl, attachPdf);

            // Skip duplicates already present in Sender Queue
            if (existingIds.has(id)) {
                duplicates++;
                if (includeStatuses) statuses.push({ row: sourceRow, status: "skipped", message: "Duplicate (already queued/sent with same content)" });
                continue;
            }

            // Validate email
            if (!email || !emailRegex.test(email)) {
                skippedInvalid++;
                if (includeStatuses) statuses.push({ row: sourceRow, status: "skipped", message: "Invalid or empty email" });
                continue;
            }

            try {
                // Build placeholder values from row
                const placeholders = {};
                for (const ph in tokenCols) placeholders[ph] = row[tokenCols[ph]] || '';

                // Only create a Doc if we're going to attach a PDF
                let docInfo = { fileId: '', fileUrl: '' };
                if (attachPdf) {
                    const fileName = renderName(filenamePattern, row, tokenCols, eIdx);
                    docInfo = generateLOIDocFromTemplate(templateId, {
                        fileName,
                        placeholders,
                        outFolderId,
                    });
                }

                // Compute SUBJECT and BODY now (so future sends don’t depend on changed templates)
                const subjectResolved = renderStringTpl_(emailSubjectTpl, row, tokenCols);

                let bodyResolved = '';
                if (useLOIAsBody) {
                    if (attachPdf && docInfo.fileId) {
                        // If we created a Doc, use its final text
                        try {
                            const body = DocumentApp.openById(docInfo.fileId).getBody().getText() || '';
                            bodyResolved = body;
                        } catch (e) {
                            // Fallback to string template
                            bodyResolved = renderStringTpl_(emailBodyTpl, row, tokenCols);
                        }
                    } else {
                        // No Doc created: render from the *template* Doc body directly
                        // by running token replacement on the template's plain text
                        bodyResolved = templateBodyPlain
                            ? renderStringTpl_(templateBodyPlain, row, tokenCols)
                            : renderStringTpl_(emailBodyTpl, row, tokenCols);
                    }
                } else {
                    // Use the plain text template the user provided
                    bodyResolved = renderStringTpl_(emailBodyTpl, row, tokenCols);
                }

                // Queue row in Sender Queue
                const now = new Date();
                queueBatch.push({
                    id,
                    sourceSheet: sourceSheetName,
                    sourceRow,
                    email,
                    docId: attachPdf ? (docInfo.fileId || '') : '',
                    docUrl: attachPdf ? (docInfo.fileUrl || '') : '',
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
                if (includeStatuses) statuses.push({ row: sourceRow, status: "ok", docUrl: docInfo.fileUrl });
            } catch (e) {
                failed++;
                if (includeStatuses) statuses.push({ row: sourceRow, status: "failed", message: String(e) });
            }
        }

        // Bulk append to Sender Queue
        if (queueBatch.length) queueAppendItems(queueBatch);

        const nextOffset = offset + data.length;
        const done = nextOffset >= totalRows;

        return {
            created,
            skippedInvalid,
            failed,
            statuses,
            duplicates,
            nextOffset,
            done,
            totalRows,
            outputFolderId: outFolderId,
            ...(includeStatuses ? { statuses } : {}),
        };
    } catch (error) {
        console.error(`Error generating LOIs: ${error.toString()}`);
        throw new Error('There was an error generating LOIs.');
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

    const fileName = opts.fileName;
    const outFolderId = opts.outFolderId; // REQUIRED to save in the right place

    if (!outFolderId || !fileName) {
        throw new Error('generateLOIDocFromTemplate: outFolderId and fileName are required.');
    }

    const copy = Drive.Files.copy(
        {
            title: fileName,
            parents: [{ id: outFolderId }],
        },
        templateId
    );

    const newDocId = copy.id;
    const newDoc = DocumentApp.openById(newDocId);
    const body = newDoc.getBody();

    // Replace placeholders with actual data
    const map = opts.placeholders || {};
    for (var key in map) {
        var value = String(map[key] ?? '');
        body.replaceText('{{\\s*' + escapeRegExp(key) + '\\s*}}', value);
        body.replaceText('<\\s*' + escapeRegExp(key) + '\\s*>', value);
        body.replaceText('<\\s*' + escapeRegExp(String(key).toLowerCase()) + '\\s*>', value);
    }

    newDoc.saveAndClose();

    return { fileId: newDocId, fileUrl: newDoc.getUrl() };

    function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
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
function renderName(pattern, row, tokenCols, emailColIdx) {
    var name = pattern;
    for (var ph in tokenCols) {
        var idx = tokenCols[ph];
        name = name.replace(new RegExp('{{\\s*' + escapeRegExp(ph) + '\\s*}}', 'g'), (row[idx] || ''));
    }

    if (typeof emailColIdx === 'number' && emailColIdx >= 0) {
        var emailVal = row[emailColIdx] || '';
        name = name.replace(/{{\s*email\s*}}/gi, emailVal);
        name = name.replace(/{{\s*__email\s*}}/gi, emailVal);
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

                // ATTACHMENTS
                const wantAttach = item.attachPdf && !!item.docId;

                let attachments = null;
                if (wantAttach) {
                    try {
                        const pdf = generateLOIPDF(item.docId, item.docId); // TODO: add a name to the PDF
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
        const rangeToInsertRow = sh.getRange(rowNumber, 1, 1, sh.getLastColumn());
        sh.setActiveRange(rangeToInsertRow); // highlight row in sheet
    }
}

/**************
 * FOLDERS
 **************/

// server: add this next to your other exports
export function loiEnsureFolders() {
    return {
        rootId: loiEnsureRootFolder(),
        templatesFolderId: loiEnsureTemplatesFolder(),
    };
}

function props() {
    return PropertiesService.getDocumentProperties();
}

/** Safely read a cached folder id; clears cache if missing/trashed. */
function getCachedFolderId(key: string): string | null {
    const id = props().getProperty(key);
    if (!id) return null;
    try {
        const f = Drive.Files.get(id);
        if (f && !f.labels?.trashed) return id;
    } catch (_) { /* fall through */ }
    props().deleteProperty(key);
    return null;
}

function escapeForQ(s: string) {
    // basic quote escape for Drive v2 Q
    return String(s).replace(/'/g, "\\'");
}

function findOrCreateFolderUnder(parentId: string, name: string): string {
    const q =
        "mimeType='application/vnd.google-apps.folder' and trashed=false" +
        " and title='" + escapeForQ(name) + "'" +
        " and '" + parentId + "' in parents";
    const res = Drive.Files.list({ q, maxResults: 1 });
    if (res.items && res.items.length) return res.items[0].id;

    const created = Drive.Files.insert({
        title: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [{ id: parentId }]
    });
    return created.id;
}

/** Ensure the single app root folder exists under My Drive. */
export const loiEnsureRootFolder = (): string => {
    let id = getCachedFolderId('loiRootFolderId');
    if (id) return id;

    const q =
        "mimeType='application/vnd.google-apps.folder' and trashed=false" +
        " and title='" + escapeForQ(ROOT_FOLDER_NAME) + "'" +
        " and 'root' in parents";
    const res = Drive.Files.list({ q, maxResults: 1 });

    id = (res.items && res.items.length)
        ? res.items[0].id
        : Drive.Files.insert({
            title: ROOT_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [{ id: 'root' }]
        }).id;

    props().setProperty('loiRootFolderId', id);
    return id;
}

/** Ensure /LOI Templates exists inside the app root. */
export const loiEnsureTemplatesFolder = (): string => {
    const cacheKey = 'loiTemplatesFolderId';
    let id = getCachedFolderId(cacheKey);
    const rootId = loiEnsureRootFolder();
    if (!id) {
        id = findOrCreateFolderUnder(rootId, TEMPLATES_FOLDER_NAME);
        props().setProperty(cacheKey, id);
    }
    return id;
}

/** Ensure /LOIs exists inside the app root. */
export const loiEnsureOutputFolder = (): string => {
    const cacheKey = 'loiOutputFolderId';
    let id = getCachedFolderId(cacheKey);
    const rootId = loiEnsureRootFolder();
    if (!id) {
        id = findOrCreateFolderUnder(rootId, OUTPUT_FOLDER_NAME);
        props().setProperty(cacheKey, id);
    }
    return id;
}


/**
 * Collect all docIds from the "Sender Queue" sheet and delete the Docs.
 * - Default behavior: move files to Trash (safer, reversible).
 * - Optionally: permanently delete (requires Advanced Service: Drive API enabled).
 * - Dedupe docIds so the same Doc gets deleted only once.
 */
export const queueDeleteDocsSimple = (opts?: {
    sheetName?: string;              // default: LOI_QUEUE_NAME
    statuses?: string[] | null;      // e.g. ["queued","failed"]; default = null (no filter)
    permanentDelete?: boolean;       // default: false (Trash instead of permanent)
    throttleEvery?: number;          // default: 10 (sleep every N deletes)
    sleepMs?: number;                // default: 600ms (to be gentle on quotas)
}) => {
    const {
        sheetName = LOI_QUEUE_NAME,
        statuses = null,
        permanentDelete = false,
        throttleEvery = 50,
        sleepMs = 600,
    } = opts || {};

    const DOC_ID = "docId";
    const STATUS = "status";
    const perIterSleepMs = 20;

    const { sh } = queueEnsureSheet(); // your existing helper; ensure it returns { sh }
    if (sh.getName() !== sheetName) {
        const target = SpreadsheetApp.getActive().getSheetByName(sheetName);
        if (!target) throw new Error(`Sheet "${sheetName}" not found`);
    }

    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(10_000)) throw new Error("Another operation is in progress. Try again soon.");

    try {
        const lastRow = sh.getLastRow();
        const lastCol = sh.getLastColumn();
        if (lastRow < 2) return { deleted: 0, trashed: 0, candidates: 0, missing: 0 };

        const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || "").trim());
        const idxOf = (h: string) => {
            const i = headers.indexOf(h);
            return i >= 0 ? i : null;
        };

        const docIdIdx = idxOf(DOC_ID);
        const statusIdx = idxOf(STATUS);
        if (docIdIdx == null) throw new Error(`Header "${DOC_ID}" is required in ${sheetName}`);

        const rows = lastRow - 1;
        const data = sh.getRange(2, 1, rows, lastCol).getValues(); // raw values
        const ids: string[] = [];
        const idToRows = new Map<string, number[]>();

        // Collect candidates (optionally filter by status)
        for (let r = 0; r < data.length; r++) {
            const docId = String(data[r][docIdIdx] || "").trim();
            if (!docId) continue;

            if (statuses && statusIdx != null) {
                const st = String(data[r][statusIdx] || "").trim().toLowerCase();
                if (!statuses.map(s => s.toLowerCase()).includes(st)) continue;
            }

            if (!idToRows.has(docId)) {
                idToRows.set(docId, [r + 2]); // sheet row
                ids.push(docId);
            } else {
                idToRows.get(docId)!.push(r + 2);
            }
        }

        // Delete (Trash by default)
        let trashed = 0, deleted = 0, missing = 0;  
        ids.forEach((id, i) => {
            Utilities.sleep(perIterSleepMs);
            try {
                if (permanentDelete) {
                    // Requires Advanced Service: Drive enabled in Apps Script project
                    // @ts-ignore
                    Drive.Files.remove(id);
                    deleted++;
                } else {
                    Drive.Files.trash(id);
                    trashed++;
                }
            } catch (e) {
                // File might be gone, in another user's drive, or permission denied
                missing++;
            }

            // Gentle throttling to avoid hitting short-term quotas
            if ((i + 1) % throttleEvery === 0) Utilities.sleep(sleepMs);
        });

        return { deleted, trashed, missing, candidates: ids.length };
    } finally {
        lock.releaseLock();
    }
};

function columnsOverFree(mapping, emailColumn) {
    const letters = []
        .concat(Object.values(mapping || {}))
        .concat(emailColumn || [])
        .filter(Boolean);
    const uniq = Array.from(new Set(letters.map(String)));
    return uniq.filter(L => colToNumber(L) > 4); // > D
}