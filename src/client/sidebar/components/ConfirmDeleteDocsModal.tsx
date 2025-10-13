import React, { useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";

export default function ConfirDeleteDocsModal({
    opts,
    onCancel,
    onConfirm,
    deleting,
    totalCleanupEligible,
}: {
    opts: any
    onCancel: () => void;
    onConfirm: (deleteDocs: boolean, statuses: string[], includeJobs: boolean, kind: 'archive' | 'trash' | 'delete') => void;
    deleting: boolean;
    totalCleanupEligible: number;
}) {
    const statuses = opts.includeFailed ? ["sent", "failed"] : ["sent"];
    const kind = opts.kind || 'trash';
    const buttonText = kind === 'archive' ? "Archive" : kind === 'trash' ? "Trash" : "Delete";

    let actionText = <>This will move <b>{totalCleanupEligible}</b> LOI Doc file{totalCleanupEligible !== 1 ? "s" : ""} to the trash in your Google Drive (recoverable for 30 days).</>
    if (kind === 'delete') {
        actionText = <>This will delete <b>{totalCleanupEligible}</b> LOI Doc file{totalCleanupEligible !== 1 ? "s" : ""} from your Google Drive. <b>This cannot be undone.</b></>;
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3" role="dialog" aria-modal="true">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            {/* dialog */}
            <div className="relative w-full max-w-sm rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-4">
                <div className="text-sm font-semibold text-gray-900">Clean up files</div>
                <p className="mt-2 text-xs text-gray-600">
                    {actionText}
                </p>

                <div className="mt-4 flex items-center justify-end gap-2">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (!deleting) onCancel(); }}
                        className="cursor-pointer select-none rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                        Cancel
                    </div>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onConfirm(true, statuses, opts?.includeJobs || false, opts?.kind || 'trash')}
                        className={`select-none flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium bg-red-600 text-white hover:bg-red-700 ${deleting ? "opacity-50 !cursor-not-allowed" : "cursor-pointer"}`}
                    >
                        {deleting ? <><InlineSpinner />Working…</> : buttonText}
                    </div>
                </div>
            </div>
        </div>
    );
}
