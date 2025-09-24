import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";
import { serverFunctions } from "../../utils/serverFunctions";
import { QueueStatus } from "./Sidebar";
import { MAX_SHEET_NAME_LENGTH } from "./MappingStepScreen";
import ConfirmGenerateDialog from "./ConfirmGenerateDialog";
import { ArrowTopRightOnSquareIcon, DocumentIcon, EnvelopeIcon, PaperClipIcon, PencilIcon, QuestionMarkCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Alert, Snackbar, Tooltip } from "@mui/material";
import { Settings, User } from "../../utils/types";
import CONSTANTS from "../../utils/constants";
import { sendToAmplitude } from "../../utils/amplitude";
import CtaCard from "./CtaCard";

const isDev = process.env.REACT_APP_NODE_ENV.includes('dev');

// Helpers
const FREE_MAX_LETTER = CONSTANTS.FREE_MAX_LETTER;
const colToNum = (L?: string) => L ? L.trim().toUpperCase().charCodeAt(0) - 64 : 0;
const overFree = (L?: string) => colToNum(L) > colToNum(FREE_MAX_LETTER);

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
    /** Signal parent whether to disable primary button */
    setDisablePrimary: React.Dispatch<React.SetStateAction<boolean>>;

    user: User;

    settings: Settings;

    onUpgradeClick: () => void;

    attachPdf: boolean;
    setAttachPdf: React.Dispatch<React.SetStateAction<boolean>>;
    useLOIAsBody: boolean;
    setUseLOIAsBody: React.Dispatch<React.SetStateAction<boolean>>; 
    setCurrentStep: React.Dispatch<React.SetStateAction<string>>;
};

export type PreflightResult = {
    ok: boolean;
    totalRows: number;
    eligibleRows: number;
    invalidEmails: number;
    missingValuesRows: number; // optional heuristic
    sampleFileName: string;
    queueExists: boolean;   // true if Sender Queue exists
    outputFolderId: string;
    freeRemainingForSheet: number;
    sheetQueueCount: number;
};

export type GenerateSummary = {
    created: number;
    skippedInvalid: number;
    failed: number;
    duplicates: number;
    nextOffset: number;
    done: boolean;
    outputFolderId: string;
    totalRowsProcessed: number;
    statuses?: Array<{ row: number; status: "ok" | "skipped" | "failed"; message?: string; docUrl?: string }>;
};

const DEFAULT_PATTERN = "LOI - {{email}}";
const DEFAULT_BATCH_SIZE_WITH_DOC_CREATION = 50;
const DEFAULT_BATCH_SIZE = 100;

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
    setDisablePrimary,
    user,
    settings,
    onUpgradeClick,
    attachPdf,
    setAttachPdf,
    useLOIAsBody,
    setUseLOIAsBody,
    setCurrentStep,
}: Props) {
    const [pattern, setPattern] = useState<string>(DEFAULT_PATTERN);
    const [preflight, setPreflight] = useState<PreflightResult | null>(null);
    const [isPreflighting, setIsPreflighting] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progressText, setProgressText] = useState<string>("");
    const [summary, setSummary] = useState<GenerateSummary | null>(null);
    const [checksOpen, setChecksOpen] = useState(false);
    const [emailSettingsHovered, setEmailSettingsHovered] = useState<boolean>(false);
    const placeholders = useMemo(() => extractPlaceholders(templateContent, mapping), [templateContent, mapping]);
    const [showPlaceholders, setShowPlaceholders] = useState<boolean>(false);
    const [previewValues, setPreviewValues] = useState<Record<string, any> | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [autoContinue, setAutoContinue] = useState(true);
    const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
    const [failStopThreshold, setFailStopThreshold] = useState<number>(5); // 0 = ignore
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string, severity: "success" | "error" }>({ open: false, message: "", severity: "success" });
    const [innerPct, setInnerPct] = useState(0);

    const isPremium = user.subscriptionStatusActive;
    const emailColumn = mapping?.__email || "";
    const outputFolderId = preflight?.outputFolderId || "";

    const containerRef = useRef<HTMLDivElement>(null);
    const innerTimerRef = useRef<number | null>(null);
    const autoContinueRef = useRef(autoContinue);
    const failStopThresholdRef = useRef(failStopThreshold);

    /* -------- Email settings state -------- */
    const [emailSubjectTpl, setEmailSubjectTpl] = useState<string>("Letter of Intent – {{address}}");
    const [emailBodyTpl, setEmailBodyTpl] = useState<string>("Hi {{agent_name}},\n\nPlease find attached our Letter of Intent for {{address}}.\n\nBest regards,\nJohn Smith");
    const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string } | null>(null);
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

    function startFakeInnerProgress(cap = 92, currentBatchSize: number, fastProgress: boolean = false) {
        stopFakeInnerProgress();              // ensure no leaked timers
        setInnerPct(0);

        const gain = fastProgress ? .035 : 2.5;
        const bs = Math.min(100, Math.max(1, currentBatchSize)); // clamp 1..100
        // Target ≈80s when batchSize = 100; scale linearly with batch size
        const durationSec = gain * bs; //0.8 was 100 batch size

        const intervalMs = 100;
        const steps = Math.max(1, Math.round((durationSec * 1000) / intervalMs));
        const inc = cap / steps;

        innerTimerRef.current = window.setInterval(() => {
            setInnerPct(p => {
                const next = p + inc;
                if (next >= cap) {
                    window.clearInterval(innerTimerRef.current!);
                    innerTimerRef.current = null;
                    return cap;
                }
                return next;
            });
        }, intervalMs);
    }

    function stopFakeInnerProgress(complete = true) {
        if (innerTimerRef.current != null) {
            clearInterval(innerTimerRef.current);
            innerTimerRef.current = null;
        }
        if (complete) {
            setInnerPct(100);
            // brief victory fill, then reset ready for next batch
            setTimeout(() => setInnerPct(0), 300);
        } else {
            setInnerPct(0);
        }
    }

    // safety: clear if component unmounts mid-batch
    useEffect(() => () => stopFakeInnerProgress(false), []);

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
                    user,
                });
                if (!cancelled) {
                    setPreflight(res);
                    onValidChange?.("lois", !!res.ok);
                    setCanContinue({ ...canContinue, lois: res.queueExists });
                    const status = await serverFunctions.queueStatus();
                    setQueueStatus(status);
                }
            } catch (error: any) {
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
                        freeRemainingForSheet: 0,
                        sheetQueueCount: 0,
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

    useEffect(() => { autoContinueRef.current = autoContinue; }, [autoContinue]);
    useEffect(() => { failStopThresholdRef.current = failStopThreshold; }, [failStopThreshold]);

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
        if (!attachPdf) setBatchSize(DEFAULT_BATCH_SIZE);
        else setBatchSize(DEFAULT_BATCH_SIZE_WITH_DOC_CREATION);
        setSummary(null);
    }, [attachPdf]);

    useEffect(() => {
        if (isGenerating) {
            const container = containerRef.current;
            if (container) {
                container.scrollIntoView({ behavior: "smooth", block: "end" });
            }
        }
        setDisablePrimary(isGenerating);
    }, [isGenerating]);

    const runGenerate = async (resume = false) => {
        if (!preflight?.ok) return;
        try {
            sendToAmplitude(CONSTANTS.AMPLITUDE.CREATING_LOIS, { preflight }, { email: user.email });
        } catch (error) {}
        setIsGenerating(true);
        setSummary(null);
        setProgressText("Preparing…");
        let finalSummary = summary ? { ...summary } : {};

        let offset = resume && summary ? summary.nextOffset || 0 : 0;
        let totals = resume && summary
            ? { created: summary.created, skippedInvalid: summary.skippedInvalid, failed: summary.failed, duplicates: summary.duplicates, totalRowsProcessed: 0 }
            : { created: 0, skippedInvalid: 0, failed: 0, duplicates: 0, totalRowsProcessed: 0 };
        let totalEligible = preflight?.eligibleRows ?? 0;
        let done = false;

        const runInBatches = preflight?.totalRows && preflight.totalRows > batchSize;

        const container = containerRef.current;
        if (container) {
            container.scrollIntoView({ behavior: "smooth", block: "end" });
        }

        let batch = resume && summary ? Math.floor(summary.nextOffset / batchSize) + 1 : 1;
        if (isDev) {
            console.clear();
            console.log('resume', resume)
            console.log('summary.nextOffset', summary?.nextOffset)
            console.log('batch', batch)
            console.log('batchSize', batchSize)
        }
        let created = 0;
        try {
            let res;
            let freeRemainingForSheet;

            let generateArgs = {
                mapping,
                emailColumn,
                pattern,
                templateDocId,
                sheetName: sheetName || null,
                emailSubjectTpl,
                emailBodyTpl,
                useLOIAsBody,
                attachPdf,
                offset,
                limit: batchSize,
                user,
                maxColCharNumber: isPremium ? settings.maxColCharNumber : Math.min(settings.maxColCharNumber, CONSTANTS.FREE_MAX_COL_NUMBER),
            };
            const maxEligible = isPremium ? totalEligible : Math.min(totalEligible, CONSTANTS.FREE_LOI_GEN_CAP_PER_SHEET);

            do {
                // Calculate fake progress bar params
                const percentageCap = Math.floor(Math.random() * 10) + 95; // 95-100%
                startFakeInnerProgress(percentageCap, batchSize, !attachPdf);
                const progressBarText = runInBatches ? `Creating LOIs… ${Math.min(99, Math.round((offset / Math.max(1, maxEligible)) * 100))}% (batch ${batch})` : "Creating LOIs…";
                setProgressText(progressBarText);

                if (!isPremium) {
                    //@ts-ignore
                    generateArgs.freeRemainingForSheet_ = freeRemainingForSheet;
                }
                
                // Generate LOIs
                res = await serverFunctions.generateLOIChunk(generateArgs).finally(() => {
                    stopFakeInnerProgress(true);                 // snap to 100% and reset
                });

                totals.created += res.created;
                totals.skippedInvalid += res.skippedInvalid;
                totals.failed += res.failed;
                totals.duplicates += res.duplicates;
                totals.totalRowsProcessed += res.totalRowsProcessed;

                offset = res.nextOffset;
                generateArgs.offset = offset;
                done = !!res.done;
                batch++;

                if (!isPremium) {
                    freeRemainingForSheet = res.freeRemainingForSheet;
                }

                // Update on-screen partial summary if you like:
                setSummary({
                    created: totals.created,
                    skippedInvalid: totals.skippedInvalid,
                    failed: totals.failed,
                    duplicates: totals.duplicates,
                    nextOffset: offset,
                    done: done,
                    outputFolderId: outputFolderId,
                    statuses: [],
                    totalRowsProcessed: totals.totalRowsProcessed,
                });

                // stop if too many failures in the last batch
                if (failStopThresholdRef.current > 0 && res.failed >= failStopThresholdRef.current) {
                    setAutoContinue(false);
                    setSnackbar({ open: true, message: `Paused: ${res.failed} failures in last batch (threshold ${failStopThresholdRef.current}).`, severity: "error" });
                    break;
                }

                // Pause after one batch if auto-continue is off
                if (!autoContinueRef.current) break;
            } while (!done);

            setProgressText("Finalizing…");
            // final snapshot
            finalSummary = {
                ...summary,
                created: totals.created,
                skippedInvalid: totals.skippedInvalid,
                failed: totals.failed,
                duplicates: totals.duplicates,
                nextOffset: offset,
                totalRowsProcessed: totals.totalRowsProcessed,
                done,
            };
            setSummary((prev) => prev ? { ...prev, ...finalSummary } : null);

            created = totals.created;

            onValidChange?.("lois", true);
            setCanContinue({ ...canContinue, lois: true });
            setQueueStatus({ exists: true, empty: false });
            setSnackbar({ open: true, message: `${created ? `${created} ` : '0 '}LOIs created successfully. ${!isPremium && created === 0 ? `Upgrade to create unlimited LOIs. ` : ''}Continue to send.`, severity: "success" });
            try {
                sendToAmplitude(CONSTANTS.AMPLITUDE.CREATED_LOIS, { 
                    summary: finalSummary,
                    batchSize,
                    attachPdf,
                    useLOIAsBody,
                }, { email: user.email });
            } catch (error) {}
        } catch (e) {
            console.log('error', e)
            setSnackbar({ open: true, message: "Creation failed. Please try again.", severity: "error" });
            onValidChange?.("lois", false);
        } finally {
            setIsGenerating(false);
            setProgressText("");
            refreshSendData(true);
            setTimeout(() => setSnackbar({ open: false, message: "", severity: "success" }), CONSTANTS.SNACKBAR_AUTO_HIDE_DURATION);
            setAutoContinue(true);
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
    const dataSourceOk = !!sheetName;
    const checksOk = templateOk && tokensOk && emailOk && eligibleOk && dataSourceOk;

    const canGenerate = checksOk && !!preflight?.ok;
    const sheetNameShort = sheetName?.length > MAX_SHEET_NAME_LENGTH ? sheetName.slice(0, MAX_SHEET_NAME_LENGTH) + "…" : sheetName;
    const placeholdersWithEmail = [...placeholders, "email"];
    const generateLOIsSectionTitle = attachPdf ? "Create LOI Docs" : "Create LOI Jobs";

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
                emailPreview={emailPreview}
                isPremium={isPremium}
                onUpgradeClick={onUpgradeClick}
            />

            <h2 className="text-sm font-semibold text-gray-900">Create LOIs{sheetName ? <> from {sheetNameShort}</> : ""}</h2>

            <div className="mt-0 text-[11px] text-gray-500">
                Placeholders you can use:{showPlaceholders ?
                    <code className="text-gray-800 hover:underline cursor-pointer ml-1 text-[10px]" onClick={() => setShowPlaceholders(false)}>Hide placeholders</code> :
                    <code className="text-gray-800 hover:underline cursor-pointer ml-1 text-[10px]" onClick={() => setShowPlaceholders(true)}>Show placeholders</code>}
                {showPlaceholders && <div className="mt-1">
                    {placeholdersWithEmail.length
                        ? placeholdersWithEmail.map((t, i) => (
                            <code key={t} className="rounded bg-gray-100 px-1 py-[1px]">{`{{${t}}}`}{i < placeholdersWithEmail.length - 1 ? "," : ""}</code>
                        ))
                        : <span className="italic">none</span>}
                </div>}
            </div>

            {/* Email settings */}
            <div className="rounded-xl border border-gray-200 p-3 space-y-2" onMouseEnter={() => setEmailSettingsHovered(true)} onMouseLeave={() => setEmailSettingsHovered(false)}>
                <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-900"><EnvelopeIcon className="w-4 h-4 inline-block mr-0 text-indigo-600" /> Email settings</div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center justify-between mb-1">
                        <div className="text-[11px] text-gray-600 flex items-center gap-1">Attach LOI as PDF
                            <Tooltip title="This uses the LOI Google Docs created from this step as the PDFs for email attachments.">
                                <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-gray-600" />
                            </Tooltip>
                        </div>
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
                    <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[11px] text-gray-600">Body (plain text)</div>

                            {/* Toggle */}
                            <div className={`relative inline-flex items-center gap-1`}>
                                <span className="text-[11px] text-gray-700 select-none">Use LOI as body</span>
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
                            <div>
                                {useLOIAsBody ? (
                                    <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{`{{LOI document text}} `}
                                        <ArrowTopRightOnSquareIcon className="w-3 h-3 inline-block cursor-pointer ml-1" onClick={() => window.open(`https://docs.google.com/document/d/${templateDocId}/edit`, '_blank')} />
                                    </div>
                                ) : <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                                    <div>{emailPreview.body}</div>
                                </div>}
                                {attachPdf && <div className="flex items-center gap-1 mt-3 text-xs text-gray-800 whitespace-pre-wrap"><PaperClipIcon className="w-3 h-3 inline-block" />LOI PDF Attached</div>}
                            </div>
                        </div>
                        <div className={`text-[11px] ${emailSettingsHovered ? 'text-gray-800' : 'text-white'} hover:underline cursor-pointer flex justify-end`} onClick={() => setShowEmailPreview(false)}>Hide email preview</div>
                    </>
                ) : (
                    <>
                        {checksOk && <span className={`text-[11px] ${emailSettingsHovered ? 'text-gray-800' : 'text-white'} hover:underline cursor-pointer flex justify-end`} onClick={() => setShowEmailPreview(true)}>Show email preview</span>}
                    </>
                )}
            </div>

            {/* File naming pattern */}
            {
                attachPdf && (
                    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                        <div className="text-xs font-medium text-gray-900 flex items-center gap-1"><DocumentIcon className="w-4 h-4 inline-block mr-0 text-indigo-600" /> Filename pattern
                            <Tooltip title="The filename pattern for the LOI Google Doc. This is only needed if you have enabled 'Attach LOI as PDF' and want to customize the filename.">
                                <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-gray-600" />
                            </Tooltip>
                        </div>
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
                )
            }


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

                            <div className="text-gray-600">Email column mapped</div>
                            <div className="text-gray-900">{emailOk ? `✓ (${mapping.__email})` :
                                <span className="text-amber-600">
                                    ⚠ email column not mapped
                                    <Tooltip title="Please map the email column to valid email addresses in the source data sheet.">
                                        <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-amber-600" />
                                    </Tooltip>
                                </span>}</div>

                            <div className="text-gray-600">Eligible rows</div>
                            <div className="text-gray-900">
                                {isPreflighting ? (
                                    <span className="inline-flex items-center gap-1">
                                        <InlineSpinner /> checking…
                                    </span>
                                ) : preflight?.eligibleRows === 0 ? (
                                    <span className="text-amber-600">⚠ no eligible rows
                                        <Tooltip title="No eligible rows found. Please check your mapping (ensure email column is correctly mapped) and data.">
                                            <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-amber-600" />
                                        </Tooltip>
                                    </span>
                                ) : preflight ? (
                                    `${preflight.eligibleRows} / ${preflight.totalRows}`
                                ) : (
                                    <span className="text-amber-600">⚠ no eligible rows
                                        <Tooltip title="No eligible rows found. Please check your mapping (ensure email column is correctly mapped) and data.">
                                            <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-amber-600" />
                                        </Tooltip>
                                    </span>
                                )}
                            </div>

                            <div className="text-gray-600">Invalid emails</div>
                            <div className="text-gray-900">
                                {isPreflighting ? "…" : preflight ? preflight.invalidEmails : "—"}
                            </div>
                            <div className="text-gray-600">Data source</div>
                            <div className="text-gray-900 flex items-center gap-1">
                                {sheetName ? <>{sheetNameShort}<PencilIcon className="w-3 h-3 inline-block cursor-pointer text-gray-900" 
                                onClick={() => setCurrentStep('template')} /></> : <span className="text-amber-600">⚠ no data source
                                    <Tooltip title="No data source found. Please select a data source or refresh the data source dropdown in step 1.">
                                        <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-amber-600" />
                                    </Tooltip>
                                </span>}
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
                                        setSummary(null);
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
                    <SparklesIcon className="w-4 h-4 inline-block mr-1 text-indigo-600" />{generateLOIsSectionTitle} {sheetName ? <>from <b>{sheetNameShort}</b></> : ""}.
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">
                        {preflight ? `Eligible rows: ${preflight.eligibleRows}` : "Eligible rows: —"}
                    </div>
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">
                        {preflight ? `Invalid emails: ${preflight.invalidEmails}` : "Invalid emails: —"}
                    </div>
                </div>

                {/* Long-running generation notice & controls */}
                {attachPdf && preflight?.eligibleRows > batchSize && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 w-fit">
                        <div className="font-medium flex items-center gap-1">Creates Docs in batches of {batchSize}
                            <Tooltip title={<><div className="mb-1">Creating LOI Docs for PDF attachments may take some time. To avoid timeouts, we'll create them in batches of {batchSize}.</div>
                                <div className="mb-1">You can pause after any batch and resume later; existing Docs will be skipped.</div>
                                <div className="mb-1">Toggle "Attach LOI as PDF" to turn this off.</div></>}>
                                <QuestionMarkCircleIcon className="w-4 h-4 inline-block cursor-pointer text-amber-800" />
                            </Tooltip>
                        </div>
                    </div>
                )}

                {summary && !summary.done && !isGenerating ? (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => runGenerate(true)}
                        className={`inline-block select-none rounded-md px-3 py-2 text-xs font-medium cursor-pointer mr-1
                            ${!canGenerate || isGenerating
                                ? "bg-gray-300 text-white !cursor-not-allowed"
                                : "bg-gray-900 text-white hover:bg-gray-800"
                            }`}
                    >
                        Continue next {batchSize}
                    </div>
                ) : (
                    <Tooltip title={!checksOk ? "Please check your mapping and data (steps 1 and 2)." : ""}>
                        <div
                            role="button"
                            tabIndex={0}
                            aria-disabled={!canGenerate || isGenerating}
                            onClick={canGenerate && !isGenerating ? () => setConfirmOpen(true) : undefined}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && canGenerate && !isGenerating && setConfirmOpen(true)}
                            className={`select-none rounded-md px-3 py-2 text-xs font-medium cursor-pointer flex items-center !justify-center w-full
            ${!canGenerate || isGenerating || isPreflighting
                                    ? "bg-gray-300 text-white !cursor-not-allowed"
                                    : "bg-gray-900 text-white hover:bg-gray-800"
                                }`}
                        >
                            {isGenerating ? "Creating..." : `Create LOIs & Add to Queue`}
                        </div>
                    </Tooltip>
                )}



                {/* Progress / results */}
                {isGenerating && (
                    <div className="flex text-xs text-gray-600 rounded-md flex-col border border-gray-200 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-gray-600 min-w-[150px]">
                            <InlineSpinner /> {progressText || "Working…"}
                        </div>
                        <div className="h-1.5 w-full bg-gray-200 rounded">
                            <div
                                className="h-1.5 bg-indigo-500 rounded transition-[width] duration-200"
                                style={{ width: `${innerPct}%` }}
                            />
                        </div>
                        <div className="text-[10px] text-gray-500">{Math.min(99, Math.round(innerPct))}% of current batch</div>

                        <div className="mt-2 text-[10px] text-red-400">
                            Don't close this window or sidebar while creating.
                        </div>

                        {autoContinue ? (
                            <div className="flex items-center justify-end w-full mt-3">
                                <button
                                    type="button"
                                    onClick={() => setAutoContinue(false)}
                                    className="rounded-md px-3 py-1.5 text-[11px] text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 cursor-pointer"
                                >
                                    Stop after this batch
                                </button>
                            </div>

                        ) : <div className="flex items-center justify-end w-full mt-3">
                            <button
                                type="button"
                                disabled
                                className="rounded-md px-3 py-1.5 text-[11px] text-gray-500 ring-1 ring-gray-200 bg-gray-50 cursor-not-allowed"
                            >
                                Will stop after this batch…
                            </button>
                        </div>}
                    </div>
                )}

                {summary && (
                    <div className="text-[11px] text-gray-600">
                        Processed {summary.totalRowsProcessed ?? 0} / {preflight?.totalRows ?? 0} rows in <b>{sheetNameShort}</b>
                    </div>
                )}

                {summary && (
                    <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
                        <div className="text-gray-900 mb-1 !font-bold">Creation Summary</div>
                        <div>Created: {summary.created}</div>
                        <div>Skipped (invalid): {summary.skippedInvalid}</div>
                        <div>Skipped (duplicates): {summary.duplicates}</div>
                        <div>Failed: {summary.failed}</div>
                        
                        {
                            attachPdf && outputFolderId && <div><a href={`https://drive.google.com/drive/u/0/folders/${outputFolderId}`}
                                target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-600 hover:underline">Open Docs in Drive</a></div>
                        }
                    </div>
                )}
            </div>

            {!isPremium && !isPreflighting && preflight?.eligibleRows > CONSTANTS.FREE_LOI_GEN_CAP_PER_SHEET && (
                <CtaCard onUpgradeClick={onUpgradeClick} message="Upgrade to create unlimited LOIs!" />
            )}

            {/* Snackbar */}
            {snackbar.open && (
                <Snackbar open={snackbar.open} autoHideDuration={CONSTANTS.SNACKBAR_AUTO_HIDE_DURATION} onClose={() => setSnackbar({ open: false, message: "", severity: "success" })}>
                    <Alert severity={snackbar.severity}><span className="text-xs">{snackbar.message}</span></Alert>
                </Snackbar>
            )}
        </div>
    );
}
