import React, { useEffect, useMemo, useState } from "react";

type Props = {
    /** Full text of the selected template (from TemplateStepScreen) */
    templateContent: string;

    /** Optional initial mapping from parent (e.g., persisted state) */
    initialMapping?: Record<string, string>;

    /** Called whenever the mapping changes (one-to-one Placeholder -> Column letter) */
    onMappingChange?: (mapping: Record<string, string>) => void;

    /** Let parent know if all placeholders are mapped (to enable Next) */
    onValidChange?: (key: string, ok: boolean) => void;
};

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

const COLUMN_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export default function MappingStepScreen({
    templateContent,
    initialMapping,
    onMappingChange,
    onValidChange,
}: Props) {
    const placeholders = useMemo(() => extractPlaceholders(templateContent), [templateContent]);

    // Mapping state: { "Address": "A", "AgentName": "B", ... }
    const [mapping, setMapping] = useState<Record<string, string>>({});

    useEffect(() => {
        setMapping({});
        onMappingChange?.({});
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

    // Report changes upward + validity
    useEffect(() => {
        onMappingChange?.(mapping);
        const allMapped = placeholders.length > 0 && placeholders.every((ph) => !!mapping[ph]);
        onValidChange?.("map", allMapped);
    }, [mapping, placeholders]);

    // Columns that are already taken by some other placeholder
    const taken = useMemo(() => {
        const s = new Set<string>();
        for (const [ph, col] of Object.entries(mapping)) {
            if (col) s.add(col);
        }
        return s;
    }, [mapping]);

    const updateMapping = (ph: string, col: string) => {
        setMapping((prev) => {
            const next = { ...prev, [ph]: col };
            return next;
        });
    };

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Map placeholders</h2>
            <p className="text-xs text-gray-600">
                Select a unique sheet column (A–H) for each template placeholder found in your LOI.
            </p>

            {/* Empty-state if no placeholders */}
            {placeholders.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                    No placeholders detected. Add tokens like <span className="font-mono">{`{{Address}}`}</span> to your template,
                    then refresh in the previous step.
                </div>
            ) : (
                <div className="rounded-xl border border-gray-200 p-3">
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
                                            <option value="">{`— Select (A–H) —`}</option>
                                            {COLUMN_OPTIONS.map((col) => {
                                                const isTakenElsewhere = taken.has(col) && mapping[ph] !== col;
                                                return (
                                                    <option key={col} value={col} disabled={isTakenElsewhere}>
                                                        {`Column ${col}`}{isTakenElsewhere ? " (in use)" : ""}
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
                        <div className="text-[11px] text-gray-500">
                            Each column can be used once.
                        </div>
                    </div>
                </div>
            )}

            {/* Preview line (optional) */}
            {placeholders.length > 0 && (
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                    Preview will pull values from the selected columns for each placeholder.
                </div>
            )}
        </div>
    );
}
