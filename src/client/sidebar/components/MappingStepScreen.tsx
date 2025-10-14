import React, { useCallback, useEffect, useMemo, useState } from "react";
import { serverFunctions } from '../../utils/serverFunctions';
import InlineSpinner from "../../utils/components/InlineSpinner";
import { Settings, User } from "../../utils/types";
import { colLabel } from "../../utils/misc";
import CtaCard from "./CtaCard";
import CONSTANTS from "../../utils/constants";
import { sendToAmplitude } from "../../utils/amplitude";
import Tooltip from "@mui/material/Tooltip";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

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

    settings: Settings;

    config: any;
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

const FREE_MAX_INDEX = CONSTANTS.FREE_MAX_COL_NUMBER - 1;
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
    settings,
    config,
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

    const COLUMN_OPTIONS = useMemo(() => Array.from({ length: settings.maxColCharNumber }, (_, i) => colLabel(i + 1)), [settings.maxColCharNumber]); // A..CV (100 cols)
    const isLockedCol = useCallback((col: string, subscriptionStatusActive: boolean) => !subscriptionStatusActive && COLUMN_OPTIONS.indexOf(col) > FREE_MAX_INDEX, [settings.maxColCharNumber, COLUMN_OPTIONS]);
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

                try {
                    sendToAmplitude(CONSTANTS.AMPLITUDE.ERROR, { error: err?.message || JSON.stringify(err), where: 'mappingStepScreen (getPreviewRowValues)' }, { email: user.email });
                } catch (error) {}
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
        try {
            sendToAmplitude(CONSTANTS.AMPLITUDE.MAPPED_PLACEHOLDER, { placeholder: ph, column: col }, { email: user.email });
        } catch (error) { }
        setMapping((prev) => {
            const next = { ...prev, [ph]: col };
            return next;
        });
    };

    const updateEmailColumn = (col: string) => {
        try {
            sendToAmplitude(CONSTANTS.AMPLITUDE.MAPPED_PLACEHOLDER, { placeholder: "__email", column: col }, { email: user.email });
        } catch (error) { }
        setEmailColumn(col);
    };

    const sheetNameShort = sheetName?.length > MAX_SHEET_NAME_LENGTH ? sheetName.slice(0, MAX_SHEET_NAME_LENGTH) + "…" : sheetName;
    const allMapped = placeholders.length > 0 && placeholders.every((ph) => !!mapping[ph]);
    const maxLetter = isPremium ? COLUMN_OPTIONS[COLUMN_OPTIONS.length - 1] : CONSTANTS.FREE_MAX_LETTER;
    const totalColsToMap = placeholders.length + (emailColumn ? 1 : 0);

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Map placeholders</h2>
            <p className="text-xs text-gray-600">
                Select columns (A–{maxLetter}) from {sheetName ? <b>{sheetNameShort}</b> : "your spreadsheet"} for placeholders in your LOI template.
            </p>

            {/* Delivery email column (separate card for clarity) */}
            <div className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs font-medium text-gray-900 flex items-center gap-1">Delivery email column {sheetName ? <>in {sheetNameShort}</> : null}
                            <Tooltip title="Select the email column in your source data sheet. These are the emails where LOIs will be sent.">
                                <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-gray-600" />
                            </Tooltip>
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

            {/* Empty-state if no placeholders */}
            {placeholders.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                    No placeholders detected. Add tokens like <span className="font-mono">{`{{address}}`}</span> to your template,
                    then refresh in the previous step.
                </div>
            ) : (
                <div className="rounded-xl border border-gray-200 p-3" id="mapping-parameters" onMouseEnter={() => setOnMapperHover(true)} onMouseLeave={() => setOnMapperHover(false)}>
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-900 mb-2 flex items-center gap-1">Other placeholders
                            <Tooltip title="Select the columns in your source data sheet for other placeholders in your LOI template. These are the data that will be inserted into the template using the {{ }} placeholder format.">
                                <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-gray-600" />
                            </Tooltip>
                        </div>
                    </div>
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
                </div>
            )}

            {!isPremium && totalColsToMap > CONSTANTS.FREE_MAX_COL_NUMBER && (
                <CtaCard message="Upgrade to unlock more columns!" user={user} config={config}/>
            )}

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
