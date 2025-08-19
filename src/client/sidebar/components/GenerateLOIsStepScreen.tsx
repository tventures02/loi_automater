import React, { useEffect, useMemo, useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";
import { serverFunctions } from "../../utils/serverFunctions";

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
};

type PreflightResult = {
    ok: boolean;
    totalRows: number;
    eligibleRows: number;
    invalidEmails: number;
    missingValuesRows: number; // optional heuristic
    sampleFileName: string;
};

type GenerateSummary = {
    created: number;
    skippedInvalid: number;
    failed: number;
    runSheetName: string;
    statuses: Array<{ row: number; status: "ok" | "skipped" | "failed"; message?: string; pdfUrl?: string }>;
};

const DEFAULT_PATTERN = "LOI - {{address}}";

function extractPlaceholders(text: string): string[] {
    if (!text) return [];
    const re = /{{\s*([^{}]+?)\s*}}/g;
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) set.add((m[1] || "").trim());
    return Array.from(set);
}

export default function GenerateLOIsStepScreen({
    mapping,
    templateDocId,
    templateContent,
    sheetName,
    onValidChange,
}: Props) {
    const [pattern, setPattern] = useState<string>(DEFAULT_PATTERN);
    const [preflight, setPreflight] = useState<PreflightResult | null>(null);
    const [isPreflighting, setIsPreflighting] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progressText, setProgressText] = useState<string>("");
    const [summary, setSummary] = useState<GenerateSummary | null>(null);
    const [toast, setToast] = useState<string>("");
    const [checksOpen, setChecksOpen] = useState(false);

    const placeholders = useMemo(() => extractPlaceholders(templateContent), [templateContent]);
    const emailColumn = mapping?.__email || "";

    // Auto-preflight when pre-conditions are met
    useEffect(() => {
        const haveAllTokens =
            placeholders.length > 0 && placeholders.every((ph) => !!mapping?.[ph]);
        if (!templateDocId || !emailColumn || !haveAllTokens) {
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
                }
            } catch {
                if (!cancelled) {
                    setPreflight({
                        ok: false,
                        totalRows: 0,
                        eligibleRows: 0,
                        invalidEmails: 0,
                        missingValuesRows: 0,
                        sampleFileName: "",
                    });
                    onValidChange?.("lois", false);
                }
            } finally {
                if (!cancelled) setIsPreflighting(false);
            }
        })();

        return () => { cancelled = true; };
    }, [templateDocId, emailColumn, JSON.stringify(mapping), pattern, sheetName, placeholders, onValidChange]);

    const runGenerate = async () => {
        if (!preflight?.ok) return;
        setIsGenerating(true);
        setSummary(null);
        setProgressText("Preparing run sheet and files…");

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
            });
            clearInterval(t);
            setProgressText("Finalizing…");
            setSummary(result);
            setToast(`Created ${result.created}, skipped ${result.skippedInvalid}, failed ${result.failed}.`);
            onValidChange?.("lois", true);
        } catch (e) {
            clearInterval(t);
            setToast("Generation failed. Please try again.");
            onValidChange?.("lois", false);
        } finally {
            setIsGenerating(false);
            setProgressText("");
            setTimeout(() => setToast(""), 10000);
        }
    };

    const allTokensMapped =
        placeholders.length > 0 && placeholders.every((ph) => !!mapping?.[ph]);

    const templateOk = !!templateDocId;
    const tokensOk = allTokensMapped;
    const emailOk = !!mapping.__email;
    const eligibleOk = (preflight?.eligibleRows ?? 0) > 0;
    const checksOk = templateOk && tokensOk && emailOk && eligibleOk;

    const canGenerate = checksOk && !!preflight?.ok;

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Create the LOIs</h2>

            {/* File naming pattern */}
            <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="text-xs text-gray-500">File name pattern</div>
                <input
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                    placeholder={DEFAULT_PATTERN}
                />
                <div className="text-[11px] text-gray-500">
                    Available tokens from your template:{" "}
                    {placeholders.length ? placeholders.map((t, i) => (
                        <code key={t} className="rounded bg-gray-100 px-1 py-[1px]">{`{{${t}}}`}{i < placeholders.length - 1 ? "," : ""}</code>
                    )) : <span className="italic">none detected</span>}
                </div>
                {preflight?.sampleFileName && (
                    <div className="text-[11px] text-gray-600">Example: {preflight.sampleFileName}</div>
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
                                {tokensOk ? "✓" : `${placeholders.filter((p) => !mapping[p]).length} missing`}
                            </div>

                            <div className="text-gray-600">Email column mapped</div>
                            <div className="text-gray-900">{emailOk ? `✓ (${mapping.__email})` : "—"}</div>

                            <div className="text-gray-600">Eligible rows</div>
                            <div className="text-gray-900">
                                {isPreflighting ? (
                                    <span className="inline-flex items-center gap-1">
                                        <InlineSpinner /> checking…
                                    </span>
                                ) : preflight ? (
                                    `${preflight.eligibleRows} / ${preflight.totalRows}`
                                ) : (
                                    "—"
                                )}
                            </div>

                            <div className="text-gray-600">Invalid emails</div>
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
                                    } finally {
                                        setIsPreflighting(false);
                                    }
                                })();
                            }}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.currentTarget as any).click()}
                            className="mt-3 inline-block select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                        >
                            {isPreflighting ? "Checking…" : "Re-run preflight"}
                        </div>
                    </div>
                )}
            </div>

            {/* Generate action + progress */}
            <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="text-xs text-gray-600">
                    Generate the LOIs in your Drive.
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">
                        {preflight ? `Eligible rows: ${preflight.eligibleRows}` : "Eligible rows: —"}
                    </div>
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">
                        {preflight ? `Invalid emails: ${preflight.invalidEmails}` : "Invalid emails: —"}
                    </div>
                </div>

                <div
                    role="button"
                    tabIndex={0}
                    aria-disabled={!canGenerate || isGenerating}
                    onClick={canGenerate && !isGenerating ? runGenerate : undefined}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && canGenerate && !isGenerating && runGenerate()}
                    className={`inline-block select-none rounded-md px-3 py-2 text-xs font-medium cursor-pointer
            ${!canGenerate || isGenerating
                            ? "bg-gray-300 text-white cursor-not-allowed"
                            : "bg-gray-900 text-white hover:bg-gray-800"
                        }`}
                >
                    {isGenerating ? "Generating…" : `Generate LOIs${preflight?.eligibleRows ? ` (${preflight.eligibleRows})` : ""}`}
                </div>

                {/* Progress / results */}
                {isGenerating && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                        <InlineSpinner /> {progressText || "Working…"}
                    </div>
                )}

                {summary && (
                    <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
                        <div className="font-medium text-gray-900 mb-1">Run summary</div>
                        <div>Created: {summary.created}</div>
                        <div>Skipped (invalid email): {summary.skippedInvalid}</div>
                        <div>Failed: {summary.failed}</div>
                        <div className="mt-2">
                            New tab: <span className="font-mono">{summary.runSheetName}</span>
                        </div>
                        {/* Show up to 3 links to created PDFs */}
                        <div className="mt-2">
                            {summary.statuses.slice(0, 3).filter(s => s.status === "ok" && s.pdfUrl).length > 0 && (
                                <>
                                    <div className="text-gray-600 mb-1">Recent PDFs:</div>
                                    <ul className="list-disc pl-5 space-y-1">
                                        {summary.statuses
                                            .filter(s => s.status === "ok" && s.pdfUrl)
                                            .slice(0, 3)
                                            .map((s, i) => (
                                                <li key={i}><a className="underline underline-offset-2" href={s.pdfUrl!} target="_blank" rel="noopener noreferrer">{s.pdfUrl}</a></li>
                                            ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Tiny toast */}
            {toast && (
                <div className="fixed bottom-3 right-3 z-50 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow">
                    {toast}
                </div>
            )}
        </div>
    );
}
