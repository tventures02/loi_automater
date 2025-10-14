import { QueueItem } from "../client/sidebar/components/Sidebar";
import CONSTANTS from "../client/utils/constants";
import {
    _commitCredits_,
    _reserveCredits_,
    getSendCreditsLeft
} from "./send_credits_management";

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
const ROOT_FOLDER_NAME = 'Bulk LOI Sender';
const TEMPLATES_FOLDER_NAME = 'LOI Templates';
const OUTPUT_FOLDER_NAME = 'LOIs';


// Dev functions--------------------------------
// Clears ONLY the LOI quota props for the current user
export function resetLoiUserPropsDev() {
    const up = PropertiesService.getUserProperties();
    ['loi.dateKey', 'loi.used', 'loi.reserved', 'loi.reservedTs'].forEach(k => up.deleteProperty(k));
}

// Returns current LOI quota props for client-side logging
export function getLoiUserPropsDev() {
    const up = PropertiesService.getUserProperties();
    const dateKey = up.getProperty('loi.dateKey') || '';
    const used = Number(up.getProperty('loi.used') || 0);
    const reserved = Number(up.getProperty('loi.reserved') || 0);
    const reservedTs = Number(up.getProperty('loi.reservedTs') || 0);
    return {
        dateKey,
        used,
        reserved,
        reservedTs,
        reservedAt: reservedTs ? JSON.stringify(new Date(reservedTs)) : null,
    };
}

// Sets the LOI dateKey to "yesterday" so daily credits will replenish on next run.
export function setLoiDateKeyToYesterdayDev() {
    const up = PropertiesService.getUserProperties();
    const tz = Session.getScriptTimeZone() || 'Etc/GMT';
    const d = new Date(Date.now());
    d.setDate(d.getDate() - 1); // exactly one day ago
    const dateKey = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    up.setProperty('loi.dateKey', dateKey);
    return { dateKey };
}

// Dev functions--------------------------------

/**
 * Gets the names of multiple Google Docs given an array of their file IDs.
 * This function handles errors individually for each ID.
 *
 * @param {string[]} docIds - An array of Google Document file IDs.
 * @returns {DocInfo[]} An array of objects, each containing the original ID
 *                      and either the document's name or an error message.
 */
export const getGoogleDocNamesByIds = (docIds: string[]): { results: DocInfo[], templatesFolderId: string } => {
    // Validate that the input is a valid array
    if (!Array.isArray(docIds)) {
        // In a real-world scenario, throwing an error is often best here.
        console.error('Invalid input: docIds must be an array.');
        // However, returning a format consistent with an error might be better for the client
        return { results: [{ id: 'INVALID_INPUT', error: 'Input was not an array.' }], templatesFolderId: null };
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

    const templatesFolderId = loiEnsureTemplatesFolder();

    return { results, templatesFolderId };
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
        const content = `Sample Letter\n\nHi {{agent_name}},\n\nI’m interested in purchasing the property at {{address}} and would like to make an offer of {{offer}}. I’d be ready to close within 30 days, pending agreement on final terms.\n\nBest,\nJohn Smith\n\n`;
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
    const {
        user,
        sheetName
    } = payload;

    const sheet = sheetName ? ss.getSheetByName(sheetName) : null;
    if (!sheet) throw new Error('Sheet not found');
    if (sheet.getName().startsWith('Sender Queue')) throw new Error('Sender Queue is not a raw data sheet.');
    const queueExistsFlag = queueExists();
    const outputFolderId = loiEnsureOutputFolder();
    const { sh } = queueEnsureSheet();
    const qLastRow = sh.getLastRow();

    const FREE_CAP = CONSTANTS.FREE_LOI_GEN_CAP_PER_SHEET || 100; // safety
    const isPremium = !!(user?.subscriptionStatusActive);
    const existingForSheet = countQueueForSheet(sheetName) || 0;
    const freeRemainingForSheet = isPremium ? Number.MAX_SAFE_INTEGER : Math.max(0, FREE_CAP - existingForSheet);
    const maxColCharNumber = isPremium ? CONSTANTS.MAX_COL_NUMBER : CONSTANTS.FREE_MAX_COL_NUMBER;

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
            freeRemainingForSheet,                       // how many more rows this sheet can still create on free
            sheetQueueCount: 0,
            qLastRow,
        };
    }

    const width = Math.min(lastCol, maxColCharNumber);
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
            freeRemainingForSheet,                       // how many more rows this sheet can still create on free
            sheetQueueCount: 0,
            qLastRow,
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
        freeRemainingForSheet,                       // how many more rows this sheet can still create on free
        sheetQueueCount: existingForSheet,
        qLastRow,
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


function countQueueForSheet(sheetName: string) {
    if (!sheetName) return 0;
    const { sh } = queueEnsureSheet();
    const head = headerIndexMap(sh);
    const colIdx = head['sourceSheet'];
    const last = sh.getLastRow();
    if (colIdx == null || last < 2) return 0;
    const vals = sh.getRange(2, colIdx + 1, last - 1, 1).getValues();
    let n = 0;
    for (let i = 0; i < vals.length; i++) {
        if (String(vals[i][0] || '') === String(sheetName || '')) n++;
    }
    return n;
}

function isDocsDailyQuotaError_(err) {
    const s = String(err && (err.message || err));
    // Common patterns seen from Apps Script when hitting daily quotas
    return /Service invoked too many times|Quota exceeded|User rate limit exceeded|Daily limit exceeded/i.test(s);
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
        limit,                       // batch size
        includeStatuses = false,     // optional: return per-row statuses (can be large)
        user,
        sheetName,
        maxColCharNumber,
        freeRemainingForSheet_ = undefined,
    } = payload || {};

    const isPremium = !!(user && user.subscriptionStatusActive);

    try {
        const ss = SpreadsheetApp.getActive();
        const source = sheetName ? ss.getSheetByName(sheetName) : null;
        if (!source) throw new Error('Sheet not found');

        const lastRow = source.getLastRow();
        const lastCol = source.getLastColumn();
        const outFolderId = attachPdf ? loiEnsureOutputFolder() : '';
        if (lastRow < 1) {
            return { created: 0, skippedInvalid: 0, failed: 0, duplicates: 0, nextOffset: offset, done: true, totalRows: 0, outputFolderId: outFolderId };
        }

        if (!isPremium) {
            const emailColLetter = payload.emailColumn || (payload.mapping || {}).__email;
            const blocked = columnsOverFree(payload.mapping || {}, emailColLetter);
            if (blocked.length) {
                throw new Error('PLAN_LIMIT|' + JSON.stringify({ blocked, allowedMaxLetter: CONSTANTS.FREE_MAX_LETTER }));
            }
        }

        const existingForSheet = !isPremium ? countQueueForSheet(sheetName) || 0 : 0;
        const freeRemainingForSheet = !isPremium ? freeRemainingForSheet_ ?? Math.max(0, CONSTANTS.FREE_LOI_GEN_CAP_PER_SHEET - existingForSheet) : Number.MAX_SAFE_INTEGER;
        const initialRemaining = freeRemainingForSheet; // keep original remaining for this run
        const hitHardStop = !isPremium && freeRemainingForSheet <= 0;

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

        const width = Math.min(lastCol, maxColCharNumber || (isPremium ? CONSTANTS.MAX_COL_NUMBER : CONSTANTS.FREE_MAX_COL_NUMBER));
        // console.log('width', width);

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
        const startRow = 1 + offset;
        const remaining = (lastRow - startRow + 1);
        let take = Math.max(0, Math.min(limit, remaining));
        // console.log('take', take);
        // console.log('startRow', startRow);
        // console.log('lastRow', lastRow);
        // console.log('remaining', remaining);

        // Early exit if free cap already hit
        if (hitHardStop) {
            return {
                created: 0, skippedInvalid: 0, failed: 0, duplicates: 0,
                nextOffset: offset, done: true, totalRows, outputFolderId: outFolderId,
                freeRemainingForSheet: 0,
                freeCapReached: true,
            };
        }

        let baseResult = {
            created: 0,
            skippedInvalid: 0,
            failed: 0,
            duplicates: 0,
            nextOffset: offset,
            done: true,
            totalRows,
            outputFolderId: outFolderId,
        };

        if (take <= 0) {
            return baseResult;
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

        let created = 0, skippedInvalid = 0, failed = 0, duplicates = 0, rowsProcessed = 0;
        let quotaConsumed = 0;
        const statuses = [];
        const queueBatch = [];

        for (let i = 0; i < data.length; i++) {
            if (!isPremium && quotaConsumed >= initialRemaining) break;
            const row = data[i];
            rowsProcessed++;
            const sourceRow = startRow + i;
            const email = (row[eIdx] || '').toString().trim();

            // Build deterministic content key as the queue ID
            const id = makeContentKey(row, tokenCols, eIdx, templateId, mapVersion, filenamePattern, emailSubjectTpl, attachPdf);

            // Skip duplicates already present in Sender Queue
            if (existingIds.has(id)) {
                duplicates++;
                if (!isPremium) quotaConsumed++;
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
                    try {
                        docInfo = generateLOIDocFromTemplate(templateId, {
                            fileName,
                            placeholders,
                            outFolderId,
                        });
                    } catch (err) {
                        // If we hit the daily quota, STOP the run cleanly and return structured metadata
                        const msg = String(err && err.message || '');
                        if (msg.startsWith('QUOTA_DOCS_CREATE_DAILY|')) {
                            return {
                                created, skippedInvalid, failed, duplicates,
                                nextOffset: startRow + i,            // stop at the row that failed
                                done: true,                          // pause this session
                                totalRows,
                                outputFolderId: outFolderId,
                                quotaDocsExceeded: true,
                                quota: { type: 'docsCreateDaily' },
                                ...(includeStatuses ? { statuses } : {})
                            };
                        }
                        // Non-quota error -> treat as per-row failure (your existing logic)
                        failed++;
                        if (includeStatuses) statuses.push({ row: sourceRow, status: "failed", message: String(err) });
                        continue; // move on to next row
                    }
                }

                // Compute SUBJECT and BODY now (so future sends don’t depend on changed templates)
                const subjectResolved = renderStringTpl_(emailSubjectTpl, row, tokenCols);

                let bodyResolved = '';
                if (useLOIAsBody) {
                    if (attachPdf && docInfo.fileId) {
                        // If we created a Doc, use its final text
                        try {
                            const body = DocumentApp.openById(docInfo.fileId).getBody().getText();
                            bodyResolved = body;
                        } catch (e) {
                            throw new Error(`Error getting body from doc: ${e.toString()}`);
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

                if (typeof eIdx === 'number' && eIdx >= 0) {
                    var emailVal = row[eIdx] || '';
                    bodyResolved = bodyResolved.replace(/{{\s*email\s*}}/gi, emailVal);
                    bodyResolved = bodyResolved.replace(/{{\s*__email\s*}}/gi, emailVal);
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
                    subject: subjectResolved,
                    body: bodyResolved,
                    useLOIAsBody: useLOIAsBody ? 'TRUE' : 'FALSE', // store as strings for Sheets
                    attachPdf: attachPdf ? 'TRUE' : 'FALSE'
                });

                // Mark key as now existing (to avoid collisions within same run)
                existingIds.add(id);

                created++;
                if (!isPremium) quotaConsumed++;
                if (includeStatuses) statuses.push({ row: sourceRow, status: "ok", docUrl: docInfo.fileUrl });
            } catch (e) {
                failed++;
                if (includeStatuses) statuses.push({ row: sourceRow, status: "failed", message: String(e) });
            }
        }

        // Bulk append to Sender Queue
        if (queueBatch.length) queueAppendItems(queueBatch);

        const nextOffset = offset + rowsProcessed;
        const capHitThisRun = !isPremium && quotaConsumed >= initialRemaining;
        const done = nextOffset >= totalRows || capHitThisRun;

        // console.log('quotaConsumed', quotaConsumed);

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
            freeRemainingForSheet: !isPremium ? Math.max(0, initialRemaining - quotaConsumed) : Number.MAX_SAFE_INTEGER,
            freeCapReached: capHitThisRun,
            totalRowsProcessed: rowsProcessed,
            ...(includeStatuses ? { statuses } : {}),
        };
    } catch (error) {
        const m = String(error && error.message || '');
        if (m.startsWith('QUOTA_DOCS_CREATE_DAILY|')) throw error; // let client see it
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

    // Dev errors
    // throw new Error('QUOTA_DOCS_CREATE_DAILY|' + `Resets tomorrow.`);
    // throw new Error(`Resets tomorrow.`);
    // End dev errors

    try {
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
    } catch (error) {
        if (isDocsDailyQuotaError_(error)) {
            throw new Error('QUOTA_DOCS_CREATE_DAILY|' + `Resets tomorrow.`);
        }
        throw error;
    }
}

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
    let missing = [];
    if (!sh) {
        sh = ss.insertSheet(LOI_QUEUE_NAME);
        sh.getRange(1, 1, 1, LOI_QUEUE_HEADERS.length).setValues([LOI_QUEUE_HEADERS]);
        sh.setFrozenRows(1);
        sh.autoResizeColumns(1, LOI_QUEUE_HEADERS.length);
        newlyCreated = true;
    } else {
        // Check if all columns exist
        var lastCol = sh.getLastColumn();
        var head = sh.getRange(1, 1, 1, Math.max(lastCol, LOI_QUEUE_HEADERS.length)).getValues()[0];
        missing = LOI_QUEUE_HEADERS.filter(function (h) { return head.indexOf(h) === -1; });
        // Actually append missing columns
        // if (missing.length) {
        //     sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
        // }
    }
    PropertiesService.getDocumentProperties().setProperty('LOI_QUEUE_SCHEMA_VERSION', '1');
    return {
        name: LOI_QUEUE_NAME,
        headers: LOI_QUEUE_HEADERS,
        sh,
        newlyCreated,
        missing,
    };
}

/** Append multiple queue rows (array of plain objects keyed by LOI_QUEUE_HEADERS). */
export const queueAppendItems = (items) => {
    if (!items || !items.length) return 0;
    var { sh } = queueEnsureSheet();
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
export const getSendSummary = (isPremium: boolean = false, freeDailyCap: number = 10) => {
    const qSheetRes = queueEnsureSheet();
    const sh = qSheetRes.sh;
    const head = headerIndexMap(sh);
    const lastRow = sh.getLastRow();

    let queued = 0, sent = 0, failed = 0;
    let queuedWithDoc = 0, sentWithDoc = 0, failedWithDoc = 0;
    if (lastRow > 1) {
        const vals = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
        const iStatus = head['status'];
        const iDocId = head['docid'] ?? head['docId'] ?? head['doc_id']; // 
        const hasDocIdCol = typeof iDocId === 'number' && iDocId >= 0;   // 

        for (let r = 0; r < vals.length; r++) {
            const row = vals[r];
            const status = String(row[iStatus] || '').toLowerCase();
            const docId = hasDocIdCol ? String(row[iDocId] || '').trim() : '';

            if (status === 'queued') {
                queued++;
                if (docId) queuedWithDoc++;
            }
            else if (status === 'sent') {
                sent++
                if (docId) sentWithDoc++;
            }
            else if (status === 'failed') {
                failed++
                if (docId) failedWithDoc++;
            }
        }
    }
    const creditsObj = getSendCreditsLeft({ isPremium, freeDailyCap });
    const remaining = creditsObj.creditsLeft;
    return {
        remaining,
        queued, sent, failed,
        queuedWithDoc, sentWithDoc, failedWithDoc,
        deletableDocsSent: sentWithDoc,
        deletableDocsSentAndFailed: sentWithDoc + failedWithDoc,
        userEmail: Session.getActiveUser().getEmail(),
        total: lastRow - 1,
        missing: qSheetRes.missing,
        gmailHardRemaining: MailApp.getRemainingDailyQuota(),
    };
};

export const getGmailRemaining = () => {
    return MailApp.getRemainingDailyQuota();
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
        const iBody = head[normHeader('body')];

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
                emailBody: row[iBody] || '',
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
    if (!payload?.count) {
        throw new Error('No number of emails to send provided.');
    }
    else if (!isFinite(payload.count)) {
        throw new Error('Invalid number of emails to send provided.');
    }

    const startFromRow = Number(payload?.startFromRow) || 2; // The cursor
    const isPremium = !!payload?.isPremium;         // from client
    const T_BUDGET_MS = Number(payload?.timeBudgetMs || 240_000); // 4 min
    const T_GUARD_MS = 15_000; // stop ~15s before budget to finalize safely
    const t0 = Date.now();
    const attachPDFBatchCap = payload?.attachPDFBatchCap || 25;
    const noAttachBatchCap = payload?.noAttachBatchCap || 100;

    const qSheetRes = queueEnsureSheet();
    const sh = qSheetRes.sh;
    const head = headerIndexMap(sh);
    const lastRow = sh.getLastRow();
    if (lastRow < startFromRow) return {
        sent: 0,
        failed: 0,
        attempted: 0,
        nextToken: null,
        creditsLeft: getSendCreditsLeft({ isPremium, freeDailyCap: payload?.freeDailyCap }).creditsLeft,
    };

    // Normalize controls
    const stopOnError = !!payload?.stopOnError;
    const testMode = !!payload?.testMode;          // test mode now consumes credits
    const previewTo = String(payload?.previewTo || Session.getActiveUser().getEmail() || "");
    const freeDailyCap = Number(payload?.freeDailyCap ?? 10);
    // Purposely get the remaining quota from MailApp to ensure it's updated
    const gmailHardRemaining = MailApp.getRemainingDailyQuota();

    // Check if we're out of quota
    if (gmailHardRemaining <= 0) {
        const creditsUi = getSendCreditsLeft({ isPremium, freeDailyCap: payload?.freeDailyCap }); // uses smoothed meter for UI
        return {
            sent: 0,
            failed: 0,
            attempted: 0,
            testMode: !!payload?.testMode,
            creditsLeft: creditsUi.creditsLeft,
            plan: creditsUi.plan,
            dailyCap: isPremium ? creditsUi.gmailRemaining : freeDailyCap,
            batchCap: payload?.attachPDFBatchCap || payload?.noAttachBatchCap, // optional
            nextToken: Number(payload?.startFromRow) || 2,
            quotaExhausted: true,
        };
    }
    // console.log('gmailHardRemaining', gmailHardRemaining);
    // console.log('isPremium', isPremium);
    // console.log('freeDailyCap', freeDailyCap);

    try {
        // Indices (0-based). Some may be undefined if columns don't exist.
        const iEmail = head[normHeader('email')];
        const iDocId = head[normHeader('docId')];
        const iDocUrl = head[normHeader('docUrl')];
        const iStatus = head[normHeader('status')];
        const iSentAt = head[normHeader('sentAt')];
        const iAttempts = head[normHeader('attempts')];
        const iLastError = head[normHeader('lastError')];
        const iSubject = head[normHeader('subject')];     // optional
        const iBody = head[normHeader('body')];        // optional (plain text)
        const iAttachPdf = head[normHeader('attachPdf')];  // optional (TRUE/FALSE)
        const iUseDocBody = coalesce(head[normHeader('useLOIAsBody')], head[normHeader('useDocBody')]); // legacy fallback if needed
        const postSendAction = ((): 'keep' | 'trash' | 'delete' => {
            const v = String(payload?.postSendAction || 'keep').toLowerCase();
            return (v === 'trash' || v === 'delete') ? v : 'keep';
        })();

        // Read all data rows
        const numRows = lastRow - startFromRow + 1;
        if (numRows <= 0) {
            return {
                sent: 0,
                failed: 0,
                attempted: 0,
                nextToken: null,
                creditsLeft: getSendCreditsLeft({ isPremium, freeDailyCap: payload?.freeDailyCap }).creditsLeft,
            };
        }
        const vals = sh.getRange(startFromRow, 1, numRows, sh.getLastColumn()).getValues();
        let queuedCount = 0, queuedAttachCount = 0;
        for (let r = 0; r < vals.length; r++) {
            if (String(safeAt(vals[r], iStatus) || '').toLowerCase() === 'queued') {
                queuedCount++;
                if (asBool(safeAt(vals[r], iAttachPdf) || false) ||
                    asBool(safeAt(vals[r], iUseDocBody) || false)) {
                    queuedAttachCount++;
                }
            }
        }

        // Determine requested/ask
        const requestedRaw = Number(payload.count);
        const requested = Math.max(1, Math.min(1000, requestedRaw));
        const attachHeavy = queuedAttachCount > 0;
        const serverBatchCap = attachHeavy ? attachPDFBatchCap : noAttachBatchCap;
        const ask = Math.min(requested, gmailHardRemaining, queuedCount, serverBatchCap);
        let sent = 0, failed = 0, attempted = 0, timeBudgetHit = false;
        let nextToken = null;

        // console.log('ask', ask);
        // console.log('requested', requested);
        // console.log('queuedCount', queuedCount);

        // Reserve credits (test mode included; we’ll commit after)
        const { plan, used, granted } = _reserveCredits_({ ask, isPremium, freeDailyCap });
        const dailyCap = isPremium ? gmailHardRemaining : freeDailyCap; // only used for client display

        // console.log('granted', granted);
        // console.log('dailyCap', dailyCap);
        // console.log('used', used);
        if (granted <= 0) {
            return {
                sent: 0,
                failed: 0,
                attempted: 0,
                testMode,
                creditsLeft: getSendCreditsLeft({ isPremium, freeDailyCap: payload?.freeDailyCap }).creditsLeft,
                plan,
                dailyCap,
                sentToday: used,
                timeBudgetHit: false,
                batchCap: serverBatchCap,
                nextToken: null,
            };
        }

        try {
            // ─────────────────────────────────────────────────────────────
            // DOCUMENT LOCK #1: pick and mark rows as 'processing'
            // ─────────────────────────────────────────────────────────────
            let batch = []; // { rowIndex, email, docId, docUrl, subject, body, attempts, attachPdf, useDocBody }
            (function selectAndMarkProcessing() {
                const dlock = LockService.getDocumentLock();
                if (!dlock.tryLock(10_000)) throw new Error('Another operation is in progress. Try again soon.');
                try {
                    const queuedRows = [];
                    for (let r = 0; r < vals.length; r++) {
                        const row = vals[r];

                        const status = String(safeAt(row, iStatus) || '').toLowerCase();
                        if (status !== 'queued') continue;

                        const rowEmail = String(safeAt(row, iEmail) || '');
                        if (!rowEmail) continue;

                        const rowIndex = r + startFromRow;
                        queuedRows.push({
                            rowIndex,
                            email: rowEmail,
                            docId: String(safeAt(row, iDocId) || ''),
                            docUrl: String(safeAt(row, iDocUrl) || ''),
                            subject: String(safeAt(row, iSubject) || ''),
                            body: String(safeAt(row, iBody) || ''),
                            attempts: Number(safeAt(row, iAttempts) || 0),
                            attachPdf: asBool(safeAt(row, iAttachPdf) || false),
                            useDocBody: asBool(safeAt(row, iUseDocBody) || false),
                        });
                        if (queuedRows.length >= granted) {
                            nextToken = rowIndex + 1;
                            if (nextToken > lastRow) nextToken = null;
                            break; // only need up to grant
                        }
                    }

                    batch = queuedRows;

                    // Batch mark as processing while revalidating to prevent stomping from potential process from 
                    // another tab and keeps the batch consistent.
                    if (!testMode && iStatus != null && batch.length) {
                        const col = iStatus + 1;
                        const rows = batch.map(b => b.rowIndex);
                        const minRow = Math.min(...rows), maxRow = Math.max(...rows);
                        const colA1 = _colLetter_(col);
                        const colVals = sh.getRange(minRow, col, maxRow - minRow + 1, 1).getValues(); // [[val],...]
                        const toMarkA1 = [];
                        for (const r of rows) {
                            const v = String(colVals[r - minRow][0] || '').toLowerCase();
                            if (v === 'queued') toMarkA1.push(`${colA1}${r}`);
                        }

                        // Batch mark as processing
                        if (toMarkA1.length) {
                            sh.getRangeList(toMarkA1).setValue('processing');
                            SpreadsheetApp.flush();
                        }

                        // shrink batch to only rows we actually marked
                        const markedSet = new Set(toMarkA1.map(a1 => Number(a1.replace(/^[A-Z]+/, ''))));
                        batch = batch.filter(b => markedSet.has(b.rowIndex));
                    }
                } catch (error) {
                    console.log('error', error);
                    throw error;
                } finally {
                    dlock.releaseLock();
                }
            })();

            if (batch.length === 0) {
                // No rows left by the time we tried to mark them
                const { used: usedNow } = _commitCredits_({ granted, sent: 0 });
                return {
                    sent: 0,
                    failed: 0,
                    attempted: 0,
                    testMode,
                    creditsLeft: getSendCreditsLeft({ isPremium, freeDailyCap: payload?.freeDailyCap }).creditsLeft,
                    plan,
                    dailyCap,
                    sentToday: usedNow,
                    timeBudgetHit: false,
                    batchCap: serverBatchCap,
                    nextToken,
                };
            }

            // Send loop (no locks held)

            // Fallbacks in case subject/body not present
            const defaultSubject = String(payload?.subject || 'Letter of Intent');
            const defaultBodyMaker = (docUrl) => String(payload?.bodyTemplate || `Hello,\n\nPlease review the Letter of Intent attached.\n\nBest regards`);
            const docBodyCache = Object.create(null); // Cache Doc body text to avoid re-open for same docId
            const activeUserEmail = Session.getActiveUser().getEmail();
            let hardLeft = gmailHardRemaining;
            let quotaExhaustedMidBatch = false;

            const resultsByRow = new Map(); // rowIndex -> { ok:boolean, error?:string, attempts:number, sentAt?:Date }
            for (let k = 0; k < batch.length; k++) {
                if (hardLeft <= 0) { quotaExhaustedMidBatch = true; break; }

                // Time budget guard (leave time to finalize)
                if ((Date.now() - t0) > (T_BUDGET_MS - T_GUARD_MS)) { timeBudgetHit = true; break; }

                const item = batch[k];
                const now = new Date();
                const newAttempts = (item.attempts || 0) + 1;

                try {
                    // Determine subject/body from row; fall back if missing
                    const rowSubject = item.subject && item.subject.trim().length ? item.subject.trim() : defaultSubject;
                    const finalSubject = testMode ? `[TEST] ${rowSubject}` : rowSubject;

                    // if (k === 2) {
                    //     throw new Error('test error');
                    // }

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
                    const to = testMode ? previewTo || activeUserEmail : item.email;

                    // ATTACHMENTS
                    const wantAttach = item.attachPdf;

                    let attachments = null;
                    if (wantAttach) {
                        const pdf = generateLOIPDF(item.docId); // TODO: add a name to the PDF
                        if (pdf) attachments = [pdf];
                    }

                    MailApp.sendEmail({ to, subject: finalSubject, body: rowBody, attachments });
                    hardLeft--;

                    resultsByRow.set(item.rowIndex, { ok: true, attempts: newAttempts, sentAt: now });
                    sent++;
                } catch (err) {
                    resultsByRow.set(item.rowIndex, { ok: false, attempts: newAttempts, error: String(err) });
                    failed++;

                    // Stop on first error if requested
                    if (stopOnError) {
                        attempted = k + 1; // processed this many (including the failure)
                        break
                    }
                }
                attempted++;
            }

            // ─────────────────────────────────────────────────────────────
            // DOCUMENT LOCK #2: finalize statuses for the rows we marked
            // ─────────────────────────────────────────────────────────────
            (function finalizeStatuses() {
                if (testMode || !batch.length) return;

                const dlock = LockService.getDocumentLock();
                if (!dlock.tryLock(10_000)) throw new Error('Another operation is in progress. Try again soon.');
                try {
                    // Identify which of the target columns actually exist
                    const presentCols = [
                        { key: 'status', idx: iStatus },
                        { key: 'sentAt', idx: iSentAt },
                        { key: 'attempts', idx: iAttempts },
                        { key: 'lastErr', idx: iLastError },
                    ].filter(c => c.idx != null);

                    if (!presentCols.length) return;

                    // Compute minimal rectangle [minRow..maxRow] x [minCol..maxCol]
                    const minRow = Math.min.apply(null, batch.map(it => it.rowIndex));
                    const maxRow = Math.max.apply(null, batch.map(it => it.rowIndex));
                    const height = maxRow - minRow + 1;

                    const minColIdx = Math.min.apply(null, presentCols.map(c => c.idx));
                    const maxColIdx = Math.max.apply(null, presentCols.map(c => c.idx));
                    const width = maxColIdx - minColIdx + 1;

                    // Read the block once
                    const range = sh.getRange(minRow, minColIdx + 1, height, width);
                    const grid = range.getValues(); // 2D array

                    // Quick offset helpers
                    const off = {
                        status: (iStatus != null) ? (iStatus - minColIdx) : null,
                        sentAt: (iSentAt != null) ? (iSentAt - minColIdx) : null,
                        attempts: (iAttempts != null) ? (iAttempts - minColIdx) : null,
                        lastErr: (iLastError != null) ? (iLastError - minColIdx) : null,
                    };

                    // Patch only the selected rows inside the in-memory grid
                    for (let k = 0; k < batch.length; k++) {
                        const rowIndex = batch[k].rowIndex;
                        const res = resultsByRow.get(rowIndex);
                        const r = rowIndex - minRow; // row offset in grid

                        if (res) {
                            if (off.status != null) grid[r][off.status] = res.ok ? 'sent' : 'failed';
                            if (off.sentAt != null) grid[r][off.sentAt] = res.ok ? (res.sentAt || new Date()) : '';
                            if (off.attempts != null) grid[r][off.attempts] = res.attempts;
                            if (off.lastErr != null) grid[r][off.lastErr] = res.ok ? '' : (res.error || 'Error');
                        }
                        else {
                            // not processed -> revert "processing" back to "queued"
                            if (off.status != null) grid[r][off.status] = 'queued';
                            if (off.sentAt != null) grid[r][off.sentAt] = '';
                        }
                    }

                    // Single batched write
                    range.setValues(grid);
                    SpreadsheetApp.flush();
                } catch (error) {
                    console.log('error', error);
                    throw error;
                } finally {
                    dlock.releaseLock();
                }
            })();

            // ─────────────────────────────────────────────────────────────
            // POST-SEND FILE DISPOSITION: 'keep' | 'trash' | 'delete'
            // Runs only for successfully sent items, after statuses are finalized
            // Requires Advanced Drive Service (Drive API) enabled.
            // ─────────────────────────────────────────────────────────────
            (function postSendFileDisposition() {
                if (testMode) return;                      // never mutate files in test mode
                if (postSendAction === 'keep') return;    // no-op
                if (iDocId == null) return;                // can't clear cells without docId column

                // Collect docIds/rows for items that actually sent OK
                const idsToDispose: string[] = [];
                const rowsToClear: number[] = [];

                for (const b of batch) {
                    const res = resultsByRow.get(b.rowIndex);
                    if (res?.ok && b.docId) {
                        idsToDispose.push(b.docId);
                        rowsToClear.push(b.rowIndex);
                    }
                }
                if (!idsToDispose.length) return;

                // 1) Drive operations (best effort, throttled)
                idsToDispose.forEach((id, idx) => {
                    try {
                        if (postSendAction === 'delete') {
                            // permanent delete
                            // @ts-ignore Advanced Drive Service
                            Drive.Files.remove(id);
                        } else {
                            // move to Trash
                            // @ts-ignore Advanced Drive Service
                            Drive.Files.trash(id);
                        }
                    } catch (e) {
                        // ignore (already deleted/trashed/permission issues)
                    }
                    // Gentle throttling
                    if ((idx + 1) % 50 === 0) Utilities.sleep(600); else Utilities.sleep(20);
                });

                // 2) Clear docId + docUrl cells for those rows (batched)
                if (!rowsToClear.length) return;

                // Sort & coalesce contiguous row ranges to minimize writes
                const sorted = Array.from(new Set(rowsToClear)).sort((a, b) => a - b);

                const clearBlock = (start: number, end: number) => {
                    const num = end - start + 1;
                    const isTrash = postSendAction === 'trash';

                    if (iDocUrl != null && iDocUrl === iDocId + 1) {
                        const vals = Array.from({ length: num }, () => isTrash ? [""] : ["", ""]);
                        sh.getRange(start, iDocId + 1, num, isTrash ? 1 : 2).setValues(vals);
                    }
                };

                let i = 0;
                while (i < sorted.length) {
                    let start = sorted[i];
                    let end = start;
                    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
                        end = sorted[i + 1];
                        i++;
                    }
                    clearBlock(start, end);
                    i++;
                }

                SpreadsheetApp.flush();
            })();


            // Commit usage (consume sent; release any unused portion of grant)
            const { used: usedNow } = _commitCredits_({ granted, sent });

            // Purposely get the remaining quota from MailApp to ensure it's updated
            const gmailLeft = MailApp.getRemainingDailyQuota();
            const planLeft = Math.max(0, (isPremium ? Number.MAX_SAFE_INTEGER : freeDailyCap) - usedNow);
            const creditsLeft = Math.min(gmailLeft, planLeft);

            // If we didn't process all rows, resume from the earliest unsent row
            if (timeBudgetHit || stopOnError) {
                const firstUnsent = Math.min.apply(null, batch.map(b => b.rowIndex).filter(idx => !resultsByRow.has(idx)));
                if (isFinite(firstUnsent)) nextToken = firstUnsent;
            }

            return {
                sent,
                failed,
                attempted,
                testMode,
                creditsLeft,
                plan,
                dailyCap,
                sentToday: usedNow,
                timeBudgetHit,
                batchCap: serverBatchCap,
                newQueuedCount: Math.max(0, queuedCount - resultsByRow.size),
                nextToken,
                quotaExhausted: quotaExhaustedMidBatch,
            };
        } catch (e) {
            _commitCredits_({ granted, sent });
            throw e;
        }
    }
    catch (error) {
        console.log('error', error)
        throw error;
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
export const queueClearAll = (statuses: string[] = []) => {
    const { sh } = queueEnsureSheet(); // existing helper
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) return { cleared: 0, remaining: 0 };

    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(10_000)) {
        throw new Error('Another operation is in progress. Try again soon.');
    }
    const removeSent = statuses.length === 1 && statuses.includes('sent');

    try {
        if (!removeSent) {
            // Original behavior: clear all rows below header (keep formatting/columns)
            const rows = lastRow - 1;
            sh.getRange(2, 1, rows, sh.getLastColumn()).clearContent();
            return { cleared: rows, remaining: 0 };
        }

        // Only remove rows with status === 'sent'
        const head = headerIndexMap(sh);
        const iStatus = head[normHeader('status')];
        if (iStatus == null) {
            throw new Error("Couldn't find a 'status' column. Please restore the header.");
        }

        const numRows = lastRow - 1;
        const statusVals = sh.getRange(2, iStatus + 1, numRows, 1).getValues(); // [[val], ...]
        const toDelete: number[] = [];
        for (let i = 0; i < statusVals.length; i++) {
            const v = String(statusVals[i][0] || '').trim().toLowerCase();
            if (v === 'sent') {
                toDelete.push(i + 2); // row index in sheet
            }
        }

        if (toDelete.length === 0) {
            return { cleared: 0, remaining: lastRow - 1 };
        }

        // Compress consecutive rows into ranges and delete bottom-up
        toDelete.sort((a, b) => a - b);
        const ranges: Array<{ start: number; count: number }> = [];
        let start = toDelete[0], count = 1;

        for (let i = 1; i < toDelete.length; i++) {
            if (toDelete[i] === toDelete[i - 1] + 1) {
                count++;
            } else {
                ranges.push({ start, count });
                start = toDelete[i];
                count = 1;
            }
        }
        ranges.push({ start, count });

        // Delete from bottom to top to avoid row index shifting
        ranges.sort((a, b) => b.start - a.start);
        for (const r of ranges) {
            sh.deleteRows(r.start, r.count);
        }

        const remaining = Math.max(0, sh.getLastRow() - 1);
        return { cleared: toDelete.length, remaining };
    } finally {
        lock.releaseLock();
    }
};

/**
 * Delete a specific block of rows in the Sender Queue by DATA row index,
 * and return the collected docIds from those rows (if a "docId" column exists).
 *
 * - Data row 1 corresponds to sheet row 2 (header is row 1).
 * - Never deletes the header row.
 *
 * @param startDataRow 1-based index into data rows (>=1)
 * @param count        number of rows to delete (>=1)
 * @return {{ cleared: number, remaining: number, docIds: string[] }}
 */
export const deleteJobsInQueueGivenRows = (startDataRow: number, count: number) => {
    const { sh } = queueEnsureSheet();
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) return { cleared: 0, remaining: 0, docIds: [] };

    // Validate inputs
    if (!Number.isFinite(startDataRow) || !Number.isFinite(count)) {
        throw new Error('Invalid range: startDataRow and count must be numbers.');
    }
    if (startDataRow < 1) throw new Error('Invalid range: startDataRow must be >= 1.');
    if (count < 1) throw new Error('Invalid range: count must be >= 1.');

    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(10_000)) {
        throw new Error('Another operation is in progress. Try again soon.');
    }

    try {
        const startSheetRow = 1 + startDataRow; // data row 1 => sheet row 2
        if (startSheetRow > lastRow) {
            return { cleared: 0, remaining: Math.max(0, lastRow - 1), docIds: [] };
        }

        // Clamp to existing rows (and never touch header)
        const maxDeletable = lastRow - startSheetRow + 1;
        const toDelete = Math.max(0, Math.min(count, maxDeletable));
        if (toDelete === 0) {
            return { cleared: 0, remaining: Math.max(0, lastRow - 1), docIds: [] };
        }

        // Collect docIds (best-effort: skip if header missing)
        let docIds: string[] = [];
        try {
            const head = headerIndexMap(sh);
            const iDoc = head[normHeader('docId')];
            if (iDoc != null) {
                const raw = sh.getRange(startSheetRow, iDoc + 1, toDelete, 1).getValues(); // [[val],...]
                const isProbablyDriveId = (s: string) => /^[A-Za-z0-9_-]{10,}$/.test(s);
                docIds = raw
                    .map(r => String(r[0] ?? '').trim())
                    .filter(v => v && isProbablyDriveId(v));
            }
        } catch (_e) {
            // ignore—return empty docIds if header lookup or read fails
            docIds = [];
        }

        // Delete the block
        sh.deleteRows(startSheetRow, toDelete);

        const remaining = Math.max(0, sh.getLastRow() - 1);
        return { cleared: toDelete, remaining, docIds };
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
        throw e;
    }
}


function generateLOIPDF(docId: string) {
    try {
        console.log('docId', docId);
        if (!docId) {
            throw new Error('Attaching PDF but no docId provided for Google Doc reference.');
        }
        // Open the template document
        const doc = DocumentApp.openById(docId);
        const docName = doc.getName();

        doc.saveAndClose();

        // Convert the document to a PDF blob
        const pdfBlob = doc.getAs('application/pdf').setName(`${docName || docId}.pdf`);
        return pdfBlob; // Return the PDF blob
    } catch (e) {
        console.error('Error generating LOI PDF', e);
        throw e;
    }
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
 * Delete Docs referenced in the "Sender Queue" sheet — progressively.
 * Designed for large sets: scans in chunks, respects a time budget,
 * returns a nextToken so the client can loop and show progress.
 *
 * Backward-compatible:
 * - removeSent=true -> restricts to rows with status === "sent"
 * - statuses -> optional explicit filter (ignored when removeSent=true)
 * - permanentDelete=false -> trash instead of permanent delete
 *
 * New UX helpers:
 * - startFromRow: row cursor to continue where you left off
 * - limit: max files to attempt per call (default 200)
 * - timeBudgetMs: stop early to avoid Apps Script timeout (default ~4.5 min)
 * - dryRun: collect candidates but DO NOT delete (for preview/confirm)
 * - sampleNames: attempt to include up to N file names (small number) for UI
 *
 * Returns progress fields: nextToken, candidatesFound, deleted/trashed/missing, timeBudgetHit, scannedRows, elapsedMs.
 */
export const queueDeleteDocsSimple = (opts?: {
    sheetName?: string;              // default: LOI_QUEUE_NAME
    statuses: string[] | null;      // optional explicit filter (ignored when removeSent=true)
    permanentDelete?: boolean;       // default: false (Trash instead of permanent)
    throttleEvery?: number;          // default: 50 (sleep every N deletes)
    sleepMs?: number;                // default: 600ms (to be gentle on quotas)

    // New progressive / UX options:
    startFromRow?: number;           // default: 2 (first data row)
    limit?: number;                  // max files to attempt per call; default 200
    timeBudgetMs?: number;           // default: 270_000 (~4.5 min)
    dryRun?: boolean;                // default: false (when true, don't delete; just preview counts)
    sampleNames?: number;            // default: 0 (try to return up to N file names for UI)
    kind?: 'archive' | 'trash' | 'delete';
}) => {
    const {
        sheetName = LOI_QUEUE_NAME,
        statuses = null,
        throttleEvery = 50,
        sleepMs = 600,

        startFromRow = 2,
        limit = 200,
        timeBudgetMs = 270_000, // ~4.5 min, leaving buffer for UI/network
        dryRun = false,
        sampleNames = 0,
        kind = 'trash',
    } = opts || {};
    const norm = (s: any) => String(s || "").trim().toLowerCase();

    const DOC_ID = "docId";
    const STATUS = "status";
    const perIterSleepMs = 20;
    const t0 = Date.now();
    const withinBudget = () => (Date.now() - t0) < timeBudgetMs;

    let { sh } = queueEnsureSheet();
    if (sh.getName() !== sheetName) {
        const target = SpreadsheetApp.getActive().getSheetByName(sheetName);
        if (!target) throw new Error(`Sheet "${sheetName}" not found`);
        sh = target;
    }

    const lock = LockService.getDocumentLock();
    if (!lock.tryLock(10_000)) throw new Error("Another operation is in progress. Try again soon.");

    try {
        const lastRow = sh.getLastRow();
        const lastCol = sh.getLastColumn();
        if (lastRow < 2 || startFromRow > lastRow) {
            return {
                deleted: 0, trashed: 0, missing: 0, candidates: 0,
                nextToken: null, timeBudgetHit: false, scannedRows: 0, elapsedMs: Date.now() - t0,
                previewNames: [] as string[],
                clearedDocIdCells: 0,
            };
        }

        const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || "").trim());
        const findIdx = (h: string) => headers.findIndex(x => x.toLowerCase() === h.toLowerCase());

        const docIdIdx = findIdx(DOC_ID);
        const statusIdx = findIdx(STATUS);
        if (docIdIdx < 0) throw new Error(`Header "${DOC_ID}" is required in ${sheetName}`);
        if ((statuses && statuses.length) && statusIdx < 0) {
            throw new Error(`Header "${STATUS}" is required to filter by status in ${sheetName}`);
        }

        // status set
        // statuses are like ["sent", "failed"] or ["sent"] or ["failed"] or ["sent", "failed", "queued", "paused"]
        const statusSet = statuses ? new Set(statuses.map(s => s.toLowerCase())) : null;
        if (statusSet && statusSet.has("all")) {
            statusSet.clear();
            statusSet.add("sent");
            statusSet.add("failed");
            statusSet.add("queued");
            statusSet.add("paused");
        }

        // Progressive scan: read the sheet in chunks, collect up to "limit" docIds
        const CHUNK_ROWS = 500;
        const ids: string[] = [];
        const seen = new Set<string>(); // dedupe within this call
        // Track all sheet row numbers (1-based) that reference each docId we process
        const idToRows = new Map<string, number[]>();

        let nextToken: number | null = null;
        let scannedRows = 0;
        let attachNames: string[] = [];
        let hitLimit = false

        for (let r = startFromRow; r <= lastRow && ids.length < limit && withinBudget(); r += CHUNK_ROWS) {
            const howMany = Math.min(CHUNK_ROWS, lastRow - r + 1);
            const data = sh.getRange(r, 1, howMany, lastCol).getValues();

            for (let i = 0; i < data.length && ids.length < limit; i++) {
                scannedRows++;
                const row = data[i];
                const rowNum = r + i;
                const docId = String(row[docIdIdx] || "").trim();
                if (!docId) continue;

                if (statusSet && statusIdx >= 0) {
                    const st = norm(row[statusIdx]);
                    if (!statusSet.has(st)) continue;
                }

                // Always record the row → docId mapping
                const list = idToRows.get(docId) || [];
                list.push(rowNum);
                idToRows.set(docId, list);

                if (!seen.has(docId)) {
                    seen.add(docId);
                    ids.push(docId);
                }

                if (ids.length >= limit) {
                    hitLimit = true;
                    nextToken = r + i + 1; // continue after the chunk we just read
                    if (nextToken > lastRow) nextToken = null;
                    break;
                }
            }

            if (hitLimit) break;

            // If we reached the end of this chunk and still under limit, keep scanning
            nextToken = r + howMany;
            if (nextToken > lastRow) nextToken = null;
            if (!withinBudget()) break;
        }

        // Optional small preview of file names for UI (keep N tiny to avoid quotas)
        if (sampleNames > 0 && ids.length > 0 && withinBudget()) {
            const maxNames = Math.min(sampleNames, ids.length, 5);
            const idsForNames = ids.slice(0, maxNames);
            try {
                // Prefer Advanced Drive (Drive.Files.get) if enabled; otherwise fallback is omitted
                idsForNames.forEach(id => {
                    try {
                        // @ts-ignore Advanced Drive Service v2
                        const file = Drive.Files.get(id);
                        if (file && file.title) attachNames.push(file.title);
                        Utilities.sleep(30); // be gentle
                    } catch (_) {
                        // ignore name fetch errors
                    }
                });
            } catch (_) {
                // ignore if Advanced Service not enabled
            }
        }

        if (dryRun || ids.length === 0 || !withinBudget()) {
            return {
                deleted: 0, trashed: 0, missing: 0,
                candidates: ids.length,
                nextToken,
                timeBudgetHit: !withinBudget(),
                scannedRows,
                elapsedMs: Date.now() - t0,
                previewNames: attachNames,
                clearedDocIdCells: 0,
            };
        }

        // Delete (Trash by default), throttled
        let trashed = 0, deleted = 0, missing = 0;
        const rowsToClear = new Set<number>();
        ids.forEach((id, i) => {
            if (!withinBudget()) return;
            Utilities.sleep(perIterSleepMs);
            let success = false;
            try {
                if (kind === 'delete') {
                    // Requires Advanced Service: Drive API enabled
                    // @ts-ignore
                    Drive.Files.remove(id);
                    deleted++;
                    success = true;
                } else if (kind === 'trash') {
                    Drive.Files.trash(id);
                    trashed++;
                    success = true;
                } else if (kind === 'archive') {
                    Drive.Files.trash(id);
                    // TODO: archived++;
                }
            } catch (e) {
                // Could be already deleted/trashed or permission issues
                // Treat truly missing as "clearable", permission-denied stays "missing"
                try {
                    const file = Drive.Files.get(id);
                    const alreadyTrashed = !!(file?.labels && file.labels.trashed === true);
                    if (alreadyTrashed) success = true; // consider clearable
                } catch (getErr) {
                    // If not found, also clear
                    const msg = String(getErr || "");
                    if (msg.includes("File not found") || msg.includes("404")) success = true;
                }
                if (!success) missing++;
            }

            if (success) {
                const rows = idToRows.get(id) || [];
                rows.forEach(n => rowsToClear.add(n));
            }

            if ((i + 1) % throttleEvery === 0) Utilities.sleep(sleepMs);
        });

        // Clear docId cells for the affected rows (batched by contiguous ranges)
        let clearedDocIdCells = 0;
        if (rowsToClear.size && withinBudget()) {
            const sorted = Array.from(rowsToClear.values()).sort((a, b) => a - b);
            let idx = 0;
            while (idx < sorted.length && withinBudget()) {
                const start = sorted[idx];
                let end = start;
                while (idx + 1 < sorted.length && sorted[idx + 1] === end + 1) {
                    idx++;
                    end++;
                }
                const num = end - start + 1;
                const cols = kind === 'trash' ? 1 : 2;
                const values = Array.from({ length: num }, () => kind === 'trash' ? [""] : ["", ""]); // two blanks per row
                sh.getRange(start, docIdIdx + 1, num, cols).setValues(values); // <- width 2 (docId + docUrl)                
                clearedDocIdCells += num;
                idx++;
            }
        }

        return {
            deleted,
            trashed,
            missing,
            candidates: ids.length,
            nextToken,
            timeBudgetHit: !withinBudget(),
            scannedRows,
            elapsedMs: Date.now() - t0,
            previewNames: attachNames,
            clearedDocIdCells,
        };
    } finally {
        lock.releaseLock();
    }
};


/**
 * Trash the provided Google Drive file IDs using Advanced Drive Service.
 * Requires: Resources → Advanced Google services… → Drive API (v2) = ON
 * Scopes: drive.file (works for files your app created/has access to) or drive
 *
 * @param {string[]} ids
 * @return {{ processed: number, trashed: number, errors: Array<{id: string, message: string}> }}
 */
export const queueDeleteDocsByIds = (ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { processed: 0, trashed: 0, errors: [] };
    }

    const isProbablyDriveId = (s: string) => /^[A-Za-z0-9_-]{10,}$/.test(String(s || '').trim());

    const errors: Array<{ id: string; message: string }> = [];
    let trashed = 0;

    const retry = <T>(fn: () => T, attempts = 3): T => {
        let lastErr: any;
        for (let i = 0; i < attempts; i++) {
            try {
                return fn();
            } catch (e) {
                lastErr = e;
                if (i < attempts - 1) Utilities.sleep(250 * (i + 1)); // backoff
            }
        }
        throw lastErr;
    };

    for (const raw of ids) {
        const id = String(raw || '').trim();
        if (!isProbablyDriveId(id)) {
            errors.push({ id, message: 'Invalid ID format' });
            continue;
        }

        try {
            // Advanced Drive Service (v2)
            retry(() => Drive.Files.trash(id));
            trashed++;
        } catch (e: any) {
            errors.push({ id, message: String(e && e.message ? e.message : e) });
        }
    }

    return { processed: ids.length, trashed, errors };
};


/**
 * Delete all "sent" rows in Sender Queue and compact so there are no gaps.
 * Keeps header row intact. Uses a document lock to avoid stomping with other ops.
 * Returns a small report.
 */
export function queuePurgeSentAndCompact() {
    const dlock = LockService.getDocumentLock();
    if (!dlock.tryLock(10_000)) {
        throw new Error('Another operation is in progress. Try again soon.');
    }

    try {
        const { sh } = queueEnsureSheet();
        const head = headerIndexMap(sh);
        const iStatus = head[normHeader('status')];
        if (iStatus == null) {
            throw new Error('Sender Queue: missing "status" column.');
        }

        const lastRow = sh.getLastRow();
        const lastCol = sh.getLastColumn();
        if (lastRow <= 1) {
            return { deleted: 0, kept: 0, total: 0, nowRows: 1 };
        }

        // Read all data rows (below header)
        const height = lastRow - 1;
        const data = sh.getRange(2, 1, height, lastCol).getValues();

        const kept = [];
        let deleted = 0;

        for (let r = 0; r < data.length; r++) {
            const row = data[r];
            // consider an entirely empty row as "gap" (drop it during compaction)
            const isEmpty = row.every(v => v === '' || v == null);
            if (isEmpty) continue;

            const status = String(row[iStatus] || '').trim().toLowerCase();
            if (status === 'sent') {
                deleted++;
                continue;
            }
            kept.push(row);
        }

        // Wipe old data area, then write back only the kept rows contiguously
        sh.getRange(2, 1, height, lastCol).clearContent();
        if (kept.length > 0) {
            sh.getRange(2, 1, kept.length, lastCol).setValues(kept);
        }

        // Optional: trim trailing sheet rows so there are literally no empty rows
        // below the data area. Comment out this block if you prefer to keep extra rows.
        const desiredRows = kept.length + 1; // header + data
        const maxRows = sh.getMaxRows();
        if (maxRows > desiredRows) {
            sh.deleteRows(desiredRows + 1, maxRows - desiredRows);
        }

        SpreadsheetApp.flush();
        return {
            deleted,
            kept: kept.length,
            total: data.length,
            nowRows: kept.length + 1, // includes header
        };
    } finally {
        dlock.releaseLock();
    }
}


function columnsOverFree(mapping, emailColumn) {
    const letters = []
        .concat(Object.values(mapping || {}))
        .concat(emailColumn || [])
        .filter(Boolean);
    const uniq = Array.from(new Set(letters.map(String)));
    return uniq.filter(L => colToNumber(L) > CONSTANTS.FREE_MAX_COL_NUMBER); // > D
}

function _colLetter_(n: number): string {
    let s = "";
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
}
