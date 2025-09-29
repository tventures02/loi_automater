import React, { useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";
import { GenerateSummary } from "./GenerateLOIsStepScreen";

export default function ConfirmClearQueueModal({
    summary,
    onCancel,
    onConfirm,
    clearing,
    attachPdf,
}: {
    summary: GenerateSummary;
    onCancel: () => void;
    onConfirm: () => void;
    clearing: boolean;
    attachPdf: boolean;
}) {
    const { created } = summary || {};
    const deleteDocs = !!attachPdf;
    if (created === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3" role="dialog" aria-modal="true">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            {/* dialog */}
            <div className="relative w-full max-w-sm rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-4">
                <div className="text-sm font-semibold text-gray-900">Delete recent LOI jobs</div>
                <p className="mt-2 text-xs text-gray-600">
                    This will delete the recently created LOI <b>{created}</b> job{created !== 1 ? "s" : ""} from the <span className="font-mono">Sender Queue</span>{attachPdf ? " including any associated LOI Docs" : ""}.
                </p>

                <div className="mt-2 text-xs text-gray-600">
                    {deleteDocs && clearing && <div className="text-red-500 mt-2 text-[11px]">Deleting Docs. This may take a while depending on the number of Docs...</div>}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (!clearing) onCancel(); }}
                        className="cursor-pointer select-none rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </div>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onConfirm()}
                        className={`select-none flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium bg-red-600 text-white hover:bg-red-700 ${clearing ? "opacity-50 !cursor-not-allowed" : "cursor-pointer"}`}
                    >
                        {clearing ? <><InlineSpinner />Deleting...</> : "Delete LOIs"}
                    </div>
                </div>
            </div>
        </div>
    );
}
