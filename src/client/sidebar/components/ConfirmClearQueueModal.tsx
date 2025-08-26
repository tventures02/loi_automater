import React, { useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";

export default function ConfirmClearQueueModal({
    count,
    onCancel,
    onConfirm,
    clearing,
}: {
    count: number;
    onCancel: () => void;
    onConfirm: (deleteDocs: boolean) => void;
    clearing: boolean;
}) {
    const [deleteDocs, setDeleteDocs] = useState(false);

    if (count === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3" role="dialog" aria-modal="true">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            {/* dialog */}
            <div className="relative w-full max-w-sm rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-4">
                <div className="text-sm font-semibold text-gray-900">Clear queue</div>
                <p className="mt-2 text-xs text-gray-600">
                    This will permanently remove <b>{count}</b> item{count !== 1 ? "s" : ""} from <span className="font-mono">Sender Queue</span>.
                </p>

                <div className="mt-2 text-xs text-gray-600">
                    {deleteDocs ? "Your associated LOI Google Docs are deleted along with the queue jobs." : ""}
                    {deleteDocs && clearing && <div className="text-red-500 mt-2 text-[11px]">Deleting docs. This may take a while depending on the number of docs...</div>}
                </div>

                {!clearing && (
                    <div className={`relative flex items-center gap-1 justify-end mt-2`}>
                        <span className="text-[11px] text-gray-700 select-none">Delete associated LOI Docs:</span>
                        <span
                            role="switch"
                            aria-checked={deleteDocs}
                            onClick={() => setDeleteDocs(!deleteDocs)}
                            className={`ml-0 inline-flex h-5 w-9 items-center rounded-full ${deleteDocs ? "bg-gray-900" : "bg-gray-300"} cursor-pointer`}
                        >
                            <span className={`ml-1 h-4 w-4 rounded-full bg-white transition ${deleteDocs ? "translate-x-3.5" : ""}`} />
                        </span>
                    </div>
                )}

                <div className="mt-4 flex items-center justify-end gap-2">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={onCancel}
                        className="cursor-pointer select-none rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </div>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onConfirm(deleteDocs)}
                        className={`select-none flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium bg-red-600 text-white hover:bg-red-700 ${clearing ? "opacity-50 !cursor-not-allowed" : "cursor-pointer"}`}
                    >
                        {clearing ? <><InlineSpinner />Clearing…</> : "Clear queue"}
                    </div>
                </div>
            </div>
        </div>
    );
}
