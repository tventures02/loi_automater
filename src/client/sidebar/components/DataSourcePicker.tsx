// src/client/components/DataSourcePicker.tsx
import React from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";

type Props = {
    sheets: string[];
    value: string | null;
    onChange: (name: string) => void;
    onRefresh?: () => void;
    compact?: boolean; // use smaller density if true
    isLoading?: boolean;
};

export default function DataSourcePicker({
    sheets,
    value,
    onChange,
    onRefresh,
    compact,
    isLoading,
}: Props) {
    const dense = compact ? "px-2 py-1 text-[11px]" : "px-2 py-1 text-xs";

    return (

        <div className="space-y-2 mt-4 border-t border-gray-200 pt-2">
            <h2 className="text-sm font-semibold text-gray-900">Select Data Source</h2>
            <p className="text-xs text-gray-600 mb-[6px]">
                Select the data source for your LOIs.
            </p>

            <div className="flex items-center justify-between gap-2">
                {
                    isLoading ? (
                        <div className="flex items-center gap-2 p-3 text-xs text-gray-500">
                            <InlineSpinner /> Loading sheets…
                        </div>
                    ) : (
                        <select
                            value={value || ""}
                            onChange={(e) => onChange(e.target.value)}
                            className={`w-full rounded-md border bg-white text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 ${dense} ${value ? "border-gray-200" : "border-amber-300"}`}
                        >
                            <option value="">Select a sheet…</option>
                            {sheets.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    )
                }
                {onRefresh ? (
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={onRefresh}
                        className={`select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 cursor-pointer ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                        Refresh
                    </div>
                ) : null}
            </div>
        </div>
    );
}
