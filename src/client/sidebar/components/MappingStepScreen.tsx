import React, { useEffect, useMemo, useState } from "react";
import { serverFunctions } from '../../utils/serverFunctions';
import InlineSpinner from "../../utils/components/InlineSpinner";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { User } from "../../utils/types";

type Props = {
    /** Full text of the selected template (from TemplateStepScreen) */
    templateContent: string;

    /** Optional initial mapping from parent (e.g., persisted state) */
    initialMapping?: Record<string, string>;

    /** Called whenever the mapping changes (one-to-one Placeholder -> Column letter) */
    onMappingChange?: (mapping: Record<string, string>) => void;

    /** Let parent know if all placeholders are mapped (to enable Next) */
    onValidChange?: (key: string, ok: boolean) => void;

    /** Sheet name to use for preview */
    sheetName?: string;

    /** Set current step */
    setCurrentStep: React.Dispatch<React.SetStateAction<string>>;

    user: User;

    onUpgradeClick: () => void;
};

function normalizeNewlines(s: string) {
    if (!s) return s;
    // CRLF/CR -> LF
    let out = s.replace(/\r\n?/g, "\n");
    // Literal "\n" -> LF (in case the string was double-escaped)
    out = out.replace(/\\n/g, "\n");
    // Unicode separators from Docs just in case
    out = out.replace(/\u2028|\u2029/g, "\n");
    return out;
}

/** Extract {{ Placeholder }} names; trims whitespace; returns unique, sorted */
function extractPlaceholders(text: string): string[] {
    if (!text) return [];
    const re = /{{\s*([^{}]+?)\s*}}/g; // captures inside of {{ ... }}
    const set = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const name = (m[1] || "").trim();
        if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

const FREE_MAX_INDEX = 3;
const isLockedCol = (col: string, subscriptionStatusActive: boolean) => !subscriptionStatusActive && COLUMN_OPTIONS.indexOf(col) > FREE_MAX_INDEX;
const colLabel = (n:number) => { let s=''; while(n){ n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n/26);} return s; };
const COLUMN_OPTIONS = Array.from({ length: 26 }, (_, i) => colLabel(i + 1)); // A..CV (100 cols)
export const MAX_SHEET_NAME_LENGTH = 20;

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderPreview(
    tmpl: string,
    mapping: Record<string, string>,
    valuesByColumn: Record<string, any>
) {
    let out = tmpl;
    for (const [ph, col] of Object.entries(mapping)) {
        const val = valuesByColumn?.[col] ?? "";
        const re = new RegExp(`{{\\s*${escapeRegExp(ph)}\\s*}}`, "g");
        out = out.replace(re, String(val));
    }
    return out;
}

export default function MappingStepScreen({
    templateContent,
    initialMapping,
    onMappingChange,
    onValidChange,
    sheetName,
    setCurrentStep,
    user,
    onUpgradeClick,
}: Props) {
    const placeholders = useMemo(() => extractPlaceholders(templateContent), [templateContent]);

    // Mapping state: { "Address": "A", "AgentName": "B", ... }
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [emailColumn, setEmailColumn] = useState<string>(initialMapping?.__email || "");
    const [previewText, setPreviewText] = useState<string>("");
    const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [firstRowEmail, setFirstRowEmail] = useState<string | null>(null);
    const [onMapperHover, setOnMapperHover] = useState<boolean>(false);
    const [showPreview, setShowPreview] = useState<boolean>(false);
    const isPremium = user.subscriptionStatusActive;

    useEffect(() => {
        setMapping({});
        setEmailColumn(initialMapping?.__email || "");
        onMappingChange?.({ __email: initialMapping?.__email || "" });
    }, [templateContent]);

    // Initialize / reconcile mapping whenever placeholders list changes
    useEffect(() => {
        setMapping((prev) => {
            const next: Record<string, string> = {};
            // Preserve existing choices where placeholder still exists
            for (const ph of placeholders) {
                next[ph] = prev[ph] || initialMapping?.[ph] || "";
            }
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placeholders.join("|")]);

    // Enforce free-tier limit client-side: reset any locked selections
    useEffect(() => {
        if (isPremium) return;
        setMapping((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const [ph, col] of Object.entries(prev)) {
                if (col && isLockedCol(col, false)) {
                    next[ph] = "";
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
        setEmailColumn((prev) => (prev && isLockedCol(prev, false) ? "" : prev));
    }, [isPremium]);

    // Report changes upward + validity
    useEffect(() => {
        onMappingChange?.({ ...mapping, __email: emailColumn });

        const hasAtLeastOneMapped = placeholders.some((ph) => !!mapping[ph]);
        const valid = hasAtLeastOneMapped && !!emailColumn;

        onValidChange?.("map", valid);

        if (!hasAtLeastOneMapped || !templateContent) {
            setPreviewState("idle");
            setPreviewText("");
            setPreviewError(null);
            setFirstRowEmail(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                setPreviewState("loading");
                setPreviewError(null);

                // Ask Apps Script for first data row values (by column)
                // Expected return shape: { A: "123 Main St", B: "Jane Lee", ... }
                const colsRequested = Array.from(
                    new Set([
                        ...placeholders.map((ph) => mapping[ph]),
                        ...(emailColumn ? [emailColumn] : []),
                    ].filter(Boolean))
                );
                const valuesByColumn: Record<string, any> =
                    await serverFunctions.getPreviewRowValues({
                        columns: colsRequested,
                        sheetName: sheetName || null,
                    });

                if (cancelled) return;

                const rendered = renderPreview(templateContent, mapping, valuesByColumn);
                setPreviewText(normalizeNewlines(rendered));
                setFirstRowEmail(emailColumn ? (valuesByColumn[emailColumn] ?? null) : null);
                setPreviewState("ready");
                setFirstRowEmail(null);
            } catch (err: any) {
                if (cancelled) return;
                setPreviewError(err?.message || "Failed to build preview.");
                setPreviewState("error");
            }
        })();

        return () => {
            cancelled = true;
        };

    }, [mapping, placeholders, templateContent, emailColumn, sheetName]);

    // Columns that are already taken by some other placeholder
    const taken = useMemo(() => {
        const s = new Set<string>();
        for (const [ph, col] of Object.entries(mapping)) {
            if (col) s.add(col);
        }
        if (emailColumn) s.add(emailColumn);
        return s;
    }, [mapping, emailColumn]);

    const updateMapping = (ph: string, col: string) => {
        setMapping((prev) => {
            const next = { ...prev, [ph]: col };
            return next;
        });
    };

    const updateEmailColumn = (col: string) => {
        setEmailColumn(col);
    };

    const sheetNameShort = sheetName?.length > MAX_SHEET_NAME_LENGTH ? sheetName.slice(0, MAX_SHEET_NAME_LENGTH) + "…" : sheetName;
    const allMapped = placeholders.length > 0 && placeholders.every((ph) => !!mapping[ph]);
    const maxLetter = isPremium ? COLUMN_OPTIONS[COLUMN_OPTIONS.length - 1] : "D";

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Map placeholders</h2>
            <p className="text-xs text-gray-600">
                Select columns (A–{maxLetter}) from {sheetName ? <b>{sheetNameShort}</b> : "your spreadsheet"} for placeholders in your LOI template.
            </p>

            {/* Empty-state if no placeholders */}
            {placeholders.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                    No placeholders detected. Add tokens like <span className="font-mono">{`{{address}}`}</span> to your template,
                    then refresh in the previous step.
                </div>
            ) : (
                <div className="rounded-xl border border-gray-200 p-3" id="mapping-parameters" onMouseEnter={() => setOnMapperHover(true)} onMouseLeave={() => setOnMapperHover(false)}>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-gray-500">Placeholder</div>
                        <div className="text-gray-500">Mapped column</div>

                        {placeholders.map((ph) => {
                            const selected = mapping[ph] || "";
                            return (
                                <React.Fragment key={ph}>
                                    <div className="font-medium text-gray-800 break-words">
                                        {`{{${ph}}}`}
                                    </div>
                                    <div>
                                        <select
                                            value={selected}
                                            onChange={(e) => updateMapping(ph, e.target.value)}
                                            className={`
                        w-full rounded-md border px-2 py-1
                        ${selected ? "border-gray-200" : "border-amber-300"}
                        bg-white text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900
                      `}
                                        >
                                            <option value="">{`— Select (A–${maxLetter}) —`}</option>
                                            {COLUMN_OPTIONS.map((col, idx) => {
                                                const locked = isLockedCol(col, isPremium);
                                                const isTakenElsewhere = taken.has(col) && mapping[ph] !== col;
                                                const disabled = locked || isTakenElsewhere;
                                                const label =
                                                    `Column ${col}` +
                                                    (isTakenElsewhere ? " (in use)" : "") +
                                                    (locked ? "  🔒 Pro" : "");
                                                return (
                                                    <option key={col} value={locked ? "" : col} disabled={disabled} title={locked ? "Upgrade to map columns beyond D" : ""}>
                                                        {label}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Small helper footer */}
                    <div className="mt-3 flex items-center justify-between">
                        <div className="text-[11px] text-gray-600">
                            {Object.values(mapping).filter(Boolean).length} of {placeholders.length} mapped
                        </div>
                        {
                            onMapperHover && (
                                <div className="text-[11px] text-gray-600 flex items-center justify-end gap-1">
                                    <span onClick={() => setCurrentStep("template")} className="cursor-pointer hover:underline">Change template</span>
                                </div>
                            )
                        }
                    </div>


                        <>
                            {!isPremium && (
                                <div className="mt-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2 py-2">
                                    <div className="text-[11px] text-amber-800">
                                        Free plan: columns <b>A–D</b> available. Columns <b>E+</b> are locked.
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onUpgradeClick}
                                        className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white hover:bg-gray-800"
                                    >
                                        <LockClosedIcon className="h-3.5 w-3.5" />
                                        Upgrade
                                    </button>
                                </div>
                            )}
                        </>
                </div>
            )}

            {/* Delivery email column (separate card for clarity) */}
            <div className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs font-medium text-gray-900">Delivery email column {sheetName ? <>in {sheetNameShort}</> : null}</div>
                        <div className="mt-0.5 text-[11px] text-gray-600">
                            Select email column (where LOIs will be sent)
                        </div>
                    </div>
                    {firstRowEmail ? (
                        <div className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">
                            First row: {firstRowEmail}
                        </div>
                    ) : null}
                </div>

                <div className="mt-2">
                    <select
                        value={emailColumn}
                        onChange={(e) => updateEmailColumn(e.target.value)}
                        className={`
              w-full rounded-md border px-2 py-1 bg-white text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900
              ${emailColumn ? "border-gray-200" : "border-amber-300"}
            `}
                    >
                        <option value="">{`— Select (A–${maxLetter}) —`}</option>
                        {COLUMN_OPTIONS.map((col) => {
                            const locked = isLockedCol(col, isPremium);
                            const inUse = taken.has(col) && emailColumn !== col;
                            const disabled = locked || inUse;
                            const label =
                                `Column ${col}` +
                                (inUse ? " (in use)" : "") +
                                (locked ? "  🔒 Pro" : "");
                            return (
                                <option key={col} value={locked ? "" : col} disabled={disabled} title={locked ? "Upgrade to unlock email column beyond D" : ""}>
                                    {label}
                                </option>
                            );
                        })}
                    </select>
                </div>
            </div>

            {/* Preview */}
            {allMapped && showPreview ? (
                <>
                    <div className={`text-[11px] text-gray-600 hover:underline cursor-pointer flex justify-end`} onClick={() => setShowPreview(false)}>Hide LOI preview</div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50">
                        {previewState === "loading" && (
                            <div className="p-3 text-xs text-gray-500 flex items-center gap-2">
                                <InlineSpinner /> Building preview…
                            </div>
                        )}
                        {previewState === "error" && (
                            <div className="p-3 text-xs text-red-600">
                                {previewError || "Preview failed."}
                            </div>
                        )}
                        {previewState === "ready" && (
                            <>
                                <div className="p-3 pb-1 text-xs font-semibold text-gray-500 underline">
                                    👀 LOI Preview 👀
                                </div>
                                <div className="p-3 text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                                    {previewText}
                                </div>
                            </>
                        )}
                    </div>
                </>

            ) : (
                <>
                    {
                        allMapped && (
                            <div className={`text-[11px] text-gray-600  hover:underline cursor-pointer flex justify-end`} onClick={() => setShowPreview(true)}>👀 Show LOI preview</div>
                        )
                    }
                </>
            )}
        </div>
    );
}
