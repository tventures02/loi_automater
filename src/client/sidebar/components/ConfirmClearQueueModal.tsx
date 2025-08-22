import React from "react";

export default function ConfirmClearQueueModal({
    count,
    onCancel,
    onConfirm,
    clearing,
}: {
    count: number;
    onCancel: () => void;
    onConfirm: () => void;
    clearing: boolean;
}) {
    if (count === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3" role="dialog" aria-modal="true">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            {/* dialog */}
            <div className="relative w-full max-w-sm rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-4">
                <div className="text-sm font-semibold text-gray-900">Clear queue</div>
                <p className="mt-2 text-xs text-gray-600">
                    This will permanently remove <b>{count}</b> item{count !== 1 ? "s" : ""} from <span className="font-mono">Send Queue</span>.
                </p>

                <div className="mt-2 text-xs text-gray-600">
                    Your Google Docs are not deleted—only the queue rows.
                </div>

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
                        onClick={onConfirm}
                        className={`select-none rounded-md px-3 py-2 text-xs font-medium bg-red-600 text-white hover:bg-red-700 cursor-pointer ${clearing ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                        {clearing ? "Clearing…" : "Clear queue"}
                    </div>
                </div>
            </div>
        </div>
    );
}
