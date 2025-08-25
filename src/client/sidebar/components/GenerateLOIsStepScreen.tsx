import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";
import { serverFunctions } from "../../utils/serverFunctions";
import { QueueStatus } from "./Sidebar";
import { MAX_SHEET_NAME_LENGTH } from "./MappingStepScreen";
import ConfirmGenerateDialog from "./ConfirmGenerateDialog";
import { DocumentIcon, EnvelopeIcon, QuestionMarkCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@mui/material";

const isDev = process.env.REACT_APP_NODE_ENV.includes('dev');
type Props = {
    /** Placeholder -> column letter map. Must include __email for recipient column */
    mapping: Record<string, string>; // e.g., { Address: "A", AgentName: "B", Offer: "C", __email: "H" }
    /** Selected LOI template Google Doc ID */
    templateDocId: string;
    /** Raw template content (used for token hint) */
    templateContent: string;
    /** Optional: active sheet name; defaults to active sheet */
    sheetName?: string | null;
    /** Signal parent whether this step is valid/complete */
    onValidChange?: (key: string, ok: boolean) => void;
    /** Signal parent whether this step is valid/complete */
    setCanContinue: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
    /** Current canContinue state */
    canContinue: { [key: string]: boolean };
    /** Signal parent whether the queue exists */
    setQueueStatus: React.Dispatch<React.SetStateAction<QueueStatus>>;
    /** Current queue status */
    queueStatus: QueueStatus;

    refreshSendData: (force?: boolean) => void;
};

type PreflightResult = {
    ok: boolean;
    totalRows: number;
    eligibleRows: number;
    invalidEmails: number;
    missingValuesRows: number; // optional heuristic
    sampleFileName: string;
    queueExists: boolean;   // true if Sender Queue exists
    outputFolderId: string;
};

type GenerateSummary = {
    created: number;
    skippedInvalid: number;
    failed: number;
    statuses: Array<{ row: number; status: "ok" | "skipped" | "failed"; message?: string; docUrl?: string }>;
    duplicates: number;
  };

const DEFAULT_PATTERN = "LOI - {{email}}";

/* ---------- helpers ---------- */
function extractPlaceholders(text: string, mapping?: Record<string, string>): string[] {
    if (!text) return [];
    const re = /{{\s*([^{}]+?)\s*}}/g;
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) set.add((m[1] || "").trim());
    return Array.from(set);
}
function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function renderPreviewTemplate(
    tmpl: string,
    mapping: Record<string, string>,
    valuesByColumn: Record<string, any>
) {
    let out = tmpl || "";
    for (const [ph, col] of Object.entries(mapping)) {
        if (!ph || ph === "__email" || !col) continue;
        const val = valuesByColumn?.[col] ?? "";
        const re = new RegExp(`{{\\s*${escapeRegExp(ph)}\\s*}}`, "g");
        out = out.replace(re, String(val));

        if (mapping.__email) {
            const emailVal = valuesByColumn?.[mapping.__email] ?? "";
            out = out
                .replace(/{{\s*email\s*}}/gi, String(emailVal))
                .replace(/{{\s*__email\s*}}/gi, String(emailVal));
        }
    }
    return out;
}
/* ---------- /helpers ---------- */

export default function GenerateLOIsStepScreen({
    mapping,
    templateDocId,
    templateContent,
    sheetName,
    onValidChange,
    setCanContinue,
    canContinue,
    setQueueStatus,
    queueStatus,
    refreshSendData,
}: Props) {
    const [pattern, setPattern] = useState<string>(DEFAULT_PATTERN);
    const [preflight, setPreflight] = useState<PreflightResult | null>(null);
    const [isPreflighting, setIsPreflighting] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progressText, setProgressText] = useState<string>("");
    const [summary, setSummary] = useState<GenerateSummary | null>(null);
    const [toast, setToast] = useState<string>("");
    const [checksOpen, setChecksOpen] = useState(false);
    const [emailSettingsHovered, setEmailSettingsHovered] = useState<boolean>(false);
    const placeholders = useMemo(() => extractPlaceholders(templateContent, mapping), [templateContent, mapping]);
    const [previewValues, setPreviewValues] = useState<Record<string, any> | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const emailColumn = mapping?.__email || "";
    const outputFolderId = preflight?.outputFolderId || "";
    const containerRef = useRef<HTMLDivElement>(null);

    /* -------- Email settings state -------- */
    const [emailSubjectTpl, setEmailSubjectTpl] = useState<string>("Letter of Intent – {{address}}");
    const [emailBodyTpl, setEmailBodyTpl] = useState<string>("Hi {{agent_name}},\n\nPlease find attached our Letter of Intent for {{address}}.\n\nBest regards,\n{{buyer_name}}");
    const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string } | null>(null);
    const [attachPdf, setAttachPdf] = useState<boolean>(true);
    const [useLOIAsBody, setUseLOIAsBody] = useState<boolean>(false);
    const [showEmailPreview, setShowEmailPreview] = useState<boolean>(false);
    /* -------- /Email settings state -------- */

    useEffect(() => {
        const getPreviewValues = async () => {
            const colsRequested = Array.from(
                new Set(
                    Object.entries(mapping)
                        .filter(([k, v]) => k !== "__email" && !!v)
                        .map(([_, v]) => v as string)
                )
            );
            if (emailColumn) colsRequested.push(emailColumn);
            const valuesByColumn: Record<string, any> = await serverFunctions.getPreviewRowValues({
                columns: colsRequested, sheetName: sheetName || null
            });
            setPreviewValues(valuesByColumn);
        }
        getPreviewValues();
    }, []);

    // Auto-preflight when pre-conditions are met
    useEffect(() => {
        const hasAtLeastOneMapped = placeholders.some((ph) => !!mapping[ph]);
        if (!templateDocId || !emailColumn || !hasAtLeastOneMapped) {
            setPreflight(null);
            onValidChange?.("lois", false);
            return;
        }

        let cancelled = false;
        (async () => {
            setIsPreflighting(true);
            try {
                const res: PreflightResult = await serverFunctions.preflightGenerateLOIs({
                    mapping,
                    emailColumn,
                    pattern,
                    sheetName: sheetName || null,
                });
                if (!cancelled) {
                    setPreflight(res);
                    onValidChange?.("lois", !!res.ok);
                    setCanContinue({ ...canContinue, lois: res.queueExists });
                    const status = await serverFunctions.queueStatus();
                    setQueueStatus(status);
                }
            } catch(error: any) {
                console.log('error', error)
                if (!cancelled) {
                    setPreflight({
                        ok: false,
                        totalRows: 0,
                        eligibleRows: 0,
                        invalidEmails: 0,
                        missingValuesRows: 0,
                        sampleFileName: "",
                        queueExists: false,
                        outputFolderId: "",
                    });
                    onValidChange?.("lois", false);
                }
            } finally {
                if (!cancelled) setIsPreflighting(false);
            }
        })();

        return () => { cancelled = true; };
    }, [templateDocId, emailColumn, JSON.stringify(mapping), sheetName, placeholders, onValidChange]);

    useEffect(() => {
        if (!preflight) return;
        const raw = renderPreviewTemplate(pattern, mapping, previewValues);
        const sample = raw.replace(/[\/\\:*?"<>|]/g, " ").trim(); // mimic server sanitization
        setPreflight(prev => prev ? { ...prev, sampleFileName: sample } : prev);
        setSummary(null)
    }, [pattern]);

    /* Build email preview from first row values (same approach as LOI preview) */
    useEffect(() => {
        const hasAtLeastOneMapped = placeholders.some((ph) => !!mapping[ph]);
        if (!hasAtLeastOneMapped) { setEmailPreview(null); return; }

        let cancelled = false;
        (async () => {
            try {
                if (cancelled || !previewValues) return;
                const subject = renderPreviewTemplate(emailSubjectTpl, mapping, previewValues);
                const body = renderPreviewTemplate(emailBodyTpl, mapping, previewValues);
                setEmailPreview({ subject, body });
            } catch {
                if (!cancelled) setEmailPreview(null);
            }
        })();
        setSummary(null);

        return () => { cancelled = true; };
    }, [JSON.stringify(mapping), emailSubjectTpl, emailBodyTpl, emailColumn, sheetName, placeholders, previewValues]);

    useEffect(() => {
        setSummary(null);
    }, [attachPdf]);

    const runGenerate = async () => {
        if (!preflight?.ok) return;
        setIsGenerating(true);
        setSummary(null);
        setProgressText("Preparing run sheet and files…");

        const container = containerRef.current;
        if (container) {
            container.scrollIntoView({ behavior: "smooth", block: "end" });
        }

        // lightweight progress while server runs
        let pct = 5;
        const t = setInterval(() => {
            pct = Math.min(95, pct + 3);
            setProgressText(`Generating LOIs… ${pct}%`);
        }, 500);

        try {
            const result: GenerateSummary = await serverFunctions.generateLOIsAndWriteSheet({
                mapping,
                emailColumn,
                pattern,
                templateDocId,
                sheetName: sheetName || null,

                emailSubjectTpl,
                emailBodyTpl,
                useLOIAsBody,
                attachPdf,
            });
            if (isDev) console.log('result', result)
            clearInterval(t);
            setProgressText("Finalizing…");
            setSummary(result);
            onValidChange?.("lois", true);

            setCanContinue({ ...canContinue, lois: true });
            setQueueStatus({ exists: true, empty: false });
        } catch (e) {
            clearInterval(t);
            setToast("Generation failed. Please try again.");
            onValidChange?.("lois", false);
        } finally {
            setIsGenerating(false);
            setProgressText("");
            setTimeout(() => setToast(""), 8000);
            refreshSendData(true);
        }
    };

    useLayoutEffect(() => {
        if (!summary) return;
        const container = containerRef.current;
        if (container) {
            container.scrollIntoView({ behavior: "smooth", block: "end" });
        }
    }, [summary]);

    const allTokensMapped = placeholders.length > 0 && placeholders.every((ph) => !!mapping?.[ph]);
    const hasAtLeastOneMapped = placeholders.some((ph) => !!mapping[ph]);
    const templateOk = !!templateDocId;
    const tokensOk = allTokensMapped || hasAtLeastOneMapped;
    const emailOk = !!mapping.__email;
    const eligibleOk = (preflight?.eligibleRows ?? 0) > 0;
    const checksOk = templateOk && tokensOk && emailOk && eligibleOk;

    const canGenerate = checksOk && !!preflight?.ok;
    const sheetNameShort = sheetName?.length > MAX_SHEET_NAME_LENGTH ? sheetName.slice(0, MAX_SHEET_NAME_LENGTH) + "…" : sheetName;
    const placeholdersWithEmail = [...placeholders, "email"];

    return (
        <div className="space-y-3 pb-[40px]" id="generate-lois-step" ref={containerRef}>
            <ConfirmGenerateDialog
                open={confirmOpen}
                onCancel={() => setConfirmOpen(false)}
                onConfirm={async () => { setConfirmOpen(false); await runGenerate(); }}
                eligibleCount={preflight?.eligibleRows}
                sheetName={sheetName}
                templateDocId={templateDocId}
                fileNamePattern={pattern}
                isSubmitting={isGenerating}
                attachPdf={attachPdf}
                useLOIAsBody={useLOIAsBody}
            />

            <h2 className="text-sm font-semibold text-gray-900">Create LOIs{sheetName ? <> from {sheetNameShort}</> : ""}</h2>

            <div className="mt-0 text-[11px] text-gray-500">
                Placeholders you can use:{" "}
                {placeholdersWithEmail.length
                    ? placeholdersWithEmail.map((t, i) => (
                        <code key={t} className="rounded bg-gray-100 px-1 py-[1px]">{`{{${t}}}`}{i < placeholdersWithEmail.length - 1 ? "," : ""}</code>
                    ))
                    : <span className="italic">none</span>}
            </div>

            {/* File naming pattern */}
            <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="text-xs font-medium text-gray-900"><DocumentIcon className="w-4 h-4 inline-block mr-0 text-indigo-600" /> File name pattern</div>
                <input
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    className="w-full rounded-md !bg-gray-50 border border-gray-200 px-2 py-1 text-xs text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 !mb-0"
                    placeholder={DEFAULT_PATTERN}
                />
                {preflight?.sampleFileName && (
                    <div className="text-[11px] mt-1 text-gray-600">Example: {preflight.sampleFileName}</div>
                )}
            </div>


            {/* Email settings */}
            <div className="rounded-xl border border-gray-200 p-3 space-y-2" onMouseEnter={() => setEmailSettingsHovered(true)} onMouseLeave={() => setEmailSettingsHovered(false)}>
                <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-900"><EnvelopeIcon className="w-4 h-4 inline-block mr-0 text-indigo-600" /> Email settings</div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center justify-between mb-1">
                        <div className="text-[11px] text-gray-600">Attach LOI as PDF</div>
                        {/* <Switch color="primary" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} size="small" /> */}
                        <span
                            role="switch"
                            aria-checked={attachPdf}
                            onClick={() => setAttachPdf(!attachPdf)}
                            className={`ml-3 inline-flex h-5 w-9 items-center rounded-full ${attachPdf ? "bg-gray-900" : "bg-gray-300"} cursor-pointer`}
                        >
                            <span className={`ml-1 h-4 w-4 rounded-full bg-white transition ${attachPdf ? "translate-x-3.5" : ""}`} />
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                    <div>
                        <div className="text-[11px] text-gray-600 mb-1">Subject</div>
                        <input
                            value={emailSubjectTpl}
                            onChange={(e) => setEmailSubjectTpl(e.target.value)}
                            className="w-full !bg-gray-50 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                            placeholder="Letter of Intent – {{Address}}"
                        />
                    </div>
                    {/* Body label + toggle (right-aligned) */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[11px] text-gray-600">Body (plain text)</div>

                            {/* Toggle */}
                            <div className={`relative inline-flex items-center gap-1`}>
                            <span className="text-[11px] text-gray-700 select-none">Use LOI as body:</span>
                                <span
                                    role="switch"
                                    aria-checked={useLOIAsBody}
                                    onClick={() => setUseLOIAsBody(!useLOIAsBody)}
                                    className={`ml-0 inline-flex h-5 w-9 items-center rounded-full ${useLOIAsBody ? "bg-gray-900" : "bg-gray-300"} cursor-pointer`}
                                >
                                    <span className={`ml-1 h-4 w-4 rounded-full bg-white transition ${useLOIAsBody ? "translate-x-3.5" : ""}`} />
                                </span>
                            </div>
                        </div>

                        {!useLOIAsBody ? (
                            <>
                                <textarea
                                    value={emailBodyTpl}
                                    onChange={(e) => setEmailBodyTpl(e.target.value)}
                                    className="w-full h-28 rounded-md !bg-gray-50 border border-gray-200 px-2 py-1 text-xs text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 whitespace-pre-wrap"
                                    placeholder="Hi {{AgentName}}, …"
                                />
                            </>
                        ) : (
                            <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-[11px] text-gray-700">
                                Using your LOI document text as the email body.
                            </div>
                        )}
                    </div>
                </div>

                {/* Email preview */}
                {emailPreview && showEmailPreview ? (
                    <>
                        <div className="mt-2 rounded-lg bg-gray-50 p-3">
                            <div className="text-[11px] font-semibold text-gray-500 mb-1 underline">👀 Email preview 👀</div>
                            <div className="text-xs text-gray-900 mt-3">
                                <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed"><b>Subject:</b> {emailPreview.subject}</div>
                            </div>
                            <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed mt-3 bg-gray-50"><b>Body:</b></div>
                            {useLOIAsBody ? (
                                <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{`{{LOI document text}}`}</div>
                            ) : <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                                <div>{emailPreview.body}</div>
                            </div>}
                        </div>
                        <div className={`text-[11px] ${emailSettingsHovered ? 'text-gray-800' : 'text-white'} hover:underline cursor-pointer flex justify-end`}onClick={() => setShowEmailPreview(false)}>Hide email preview</div>
                    </>
                ) : (
                    <>
                        {checksOk && <span className={`text-[11px] ${emailSettingsHovered ? 'text-gray-800' : 'text-white'} hover:underline cursor-pointer flex justify-end`} onClick={() => setShowEmailPreview(true)}>Show email preview</span>}
                    </>
                )}
            </div>

            {/* Preflight (summary row + collapsible details) */}
            <div className="rounded-xl border border-gray-200">
                {/* Summary row */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setChecksOpen((v) => !v)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setChecksOpen((v) => !v)}
                    className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-900">Checks</span>
                        {isPreflighting ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                <InlineSpinner /> checking…
                            </span>
                        ) : checksOk ? (
                            <span className="inline-flex items-center text-[11px] text-green-600">
                                ✓ all good
                            </span>
                        ) : (
                            <span className="inline-flex items-center text-[11px] text-amber-600">
                                ⚠ needs attention
                            </span>
                        )}
                    </div>

                    {/* simple chevron */}
                    <svg
                        className={`h-4 w-4 text-gray-500 transition-transform ${checksOpen ? "rotate-180" : ""}`}
                        viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                    >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 111.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.25 8.27a.75.75 0 01-.02-1.06z" clipRule="evenodd" />
                    </svg>
                </div>

                {/* Details (collapsible) */}
                {checksOpen && (
                    <div className="px-3 pb-3">
                        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                            <div className="text-gray-600">Template selected</div>
                            <div className="text-gray-900">{templateOk ? "✓" : "—"}</div>

                            <div className="text-gray-600">Placeholders mapped</div>
                            <div className="text-gray-900">
                                {allTokensMapped ? "✓ all mapped" : hasAtLeastOneMapped ? `⚠ ${placeholders.filter((p) => !!mapping[p]).length} mapped` : <span className="text-amber-600">⚠ none mapped
                                    <Tooltip title="Please map all placeholders to a valid column.">
                                        <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-amber-600" />
                                    </Tooltip>
                                    </span>}
                            </div>

                            <div className="text-gray-600">Email column mapped {sheetName ? <>({sheetNameShort})</> : ""}</div>
                            <div className="text-gray-900">{emailOk ? `✓ (${mapping.__email})` : 
                                <span className="text-amber-600">
                                    ⚠ email column not mapped
                                    <Tooltip title="Please map the email column to valid email addresses in the source data sheet.">
                                        <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-amber-600" />
                                    </Tooltip>
                                </span>}</div>

                            <div className="text-gray-600">Eligible rows {sheetName ? <>({sheetNameShort})</> : ""}</div>
                            <div className="text-gray-900">
                                {isPreflighting ? (
                                    <span className="inline-flex items-center gap-1">
                                        <InlineSpinner /> checking…
                                    </span>
                                ) : preflight ? (
                                    `${preflight.eligibleRows} / ${preflight.totalRows}`
                                ) : (
                                    <span className="text-amber-600">⚠ no eligible rows
                                        <Tooltip title="No eligible rows found. Please check your mapping and data.">
                                            <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-amber-600" />
                                        </Tooltip>
                                    </span>
                                )}
                            </div>

                            <div className="text-gray-600">Invalid emails {sheetName ? <>({sheetNameShort})</> : ""}</div>
                            <div className="text-gray-900">
                                {isPreflighting ? "…" : preflight ? preflight.invalidEmails : "—"}
                            </div>
                        </div>

                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                                if (!templateDocId) return;
                                setPreflight(null);
                                (async () => {
                                    setIsPreflighting(true);
                                    try {
                                        const res: PreflightResult = await serverFunctions.preflightGenerateLOIs({
                                            mapping,
                                            emailColumn: mapping.__email,
                                            pattern,
                                            sheetName: sheetName || null,
                                        });
                                        setPreflight(res);
                                        onValidChange?.("lois", !!res.ok);
                                        setCanContinue({ ...canContinue, lois: res.queueExists });
                                        setQueueStatus({ ...queueStatus, exists: res.queueExists });
                                    } finally {
                                        setIsPreflighting(false);
                                    }
                                })();
                            }}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.currentTarget as any).click()}
                            className="mt-3 inline-block select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 cursor-pointer"
                        >
                            {isPreflighting ? "Checking…" : "Re-run checks"}
                        </div>
                    </div>
                )}
            </div>

            {/* Generate action + progress */}
            <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="text-xs text-gray-600">
                    <SparklesIcon className="w-4 h-4 inline-block mr-1 text-indigo-600" />Create LOIs Docs {sheetName ? <>from <b>{sheetNameShort}</b></> : ""}.
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">
                        {preflight ? `Eligible rows: ${preflight.eligibleRows}` : "Eligible rows: —"}
                    </div>
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">
                        {preflight ? `Invalid emails: ${preflight.invalidEmails}` : "Invalid emails: —"}
                    </div>
                </div>

                <Tooltip title={!checksOk ? "Please check your mapping and data (steps 1 and 2)." : !canGenerate ? "Create LOIs in your Drive" : !isGenerating ? "" : ""}>
                    <div
                        role="button"
                        tabIndex={0}
                        aria-disabled={!canGenerate || isGenerating}
                        onClick={canGenerate && !isGenerating ? () => setConfirmOpen(true) : undefined}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && canGenerate && !isGenerating && setConfirmOpen(true)}
                        className={`inline-block select-none rounded-md px-3 py-2 text-xs font-medium cursor-pointer
            ${!canGenerate || isGenerating
                                ? "bg-gray-300 text-white cursor-not-allowed"
                                : "bg-gray-900 text-white hover:bg-gray-800"
                            }`}
                    >
                        {isGenerating ? "Generating…" : `Generate LOIs${preflight?.eligibleRows ? ` (${preflight.eligibleRows})` : ""}`}
                    </div>
                </Tooltip>

                {/* Progress / results */}
                {isGenerating && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                        <InlineSpinner /> {progressText || "Working…"}
                    </div>
                )}

                {summary && (
                    <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
                        <div className="font-medium text-gray-900 mb-1">Generation summary</div>
                        <div>Created: {summary.created}</div>
                        <div>Skipped (invalid): {summary.skippedInvalid}</div>
                        <div>Skipped (duplicates): {summary.duplicates}</div>
                        <div>Failed: {summary.failed}</div>
                        <div><a href={`https://drive.google.com/drive/u/0/folders/${outputFolderId}`}
                            target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-600 hover:underline">Open Docs in Drive</a></div>
                    </div>
                )}
            </div>

            {/* Tiny toast */}
            {toast && (
                <div className="fixed bottom-3 right-3 z-50 rounded-md bg-blue-500 px-3 py-2 text-xs text-white shadow">
                    {toast}
                </div>
            )}
        </div>
    );
}
