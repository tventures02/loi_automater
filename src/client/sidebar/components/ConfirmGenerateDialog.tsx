// ConfirmGenerateDialog.tsx
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@mui/material";
import React, { useEffect, useRef } from "react";

type Props = {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    /** Optional context for user confidence */
    eligibleCount?: number;          // e.g. from preflight.eligibleRows
    sheetName?: string | null;
    templateDocId?: string;
    fileNamePattern?: string;        // e.g. "LOI - {{Address}} - {{AgentName}}"
    isSubmitting?: boolean;          // show spinner while server runs
};

export default function ConfirmGenerateDialog({
    open,
    onConfirm,
    onCancel,
    eligibleCount,
    sheetName,
    templateDocId,
    fileNamePattern,
    isSubmitting = false,
}: Props) {
    const confirmRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter") onConfirm();
        };
        window.addEventListener("keydown", onKey);
        // focus primary action on open
        setTimeout(() => confirmRef.current?.focus(), 0);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onCancel, onConfirm]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-3 !mb-0"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gen-title"
        >
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onCancel}
                aria-hidden="true"
            />

            {/* Panel */}
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                <div className="p-4">
                    <div className="flex items-start gap-3">

                        <div className="min-w-0">
                            <h3 id="gen-title" className="text-sm font-semibold text-gray-900">
                                Generate LOI documents?
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-gray-600">
                                This will create {eligibleCount ?? "—"} Google Doc{(eligibleCount ?? 0) === 1 ? "" : "s"} in your Drive and add them to the Sender queue.
                            </p>

                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-700 space-y-1">
                                {templateDocId ? (
                                    <div>
                                        <span className="text-gray-500 flex items-center gap-1">
                                            LOI template: <a
                                                href={`https://docs.google.com/document/d/${templateDocId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[11px] text-gray-600 hover:text-gray-900 underline underline-offset-2 ml-1"
                                            >
                                                <Tooltip title="Open in Docs">
                                                    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                                </Tooltip>
                                            </a>
                                        </span>
                                    </div>
                                ) : null}
                                {sheetName ? (
                                    <div>
                                        <span className="text-gray-500">Data source sheet: </span>
                                        <span className="font-medium text-gray-800 overflow-ellipsis">{sheetName}</span>
                                    </div>
                                ) : null}
                                {fileNamePattern ? (
                                    <div className="truncate">
                                        <span className="text-gray-500">File name pattern: </span>
                                        <code className="rounded bg-white px-1 py-[1px]">{fileNamePattern}</code>
                                    </div>
                                ) : null}
                            </div>

                            {/* <div className="mt-3 text-[11px] text-gray-500">
                                Tip: You can cancel now to review mappings or email settings.
                            </div> */}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex items-center justify-end gap-2">
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={onCancel}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onCancel()}
                            className="select-none cursor-pointer rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                        >
                            Cancel
                        </div>

                        <div
                            role="button"
                            tabIndex={0}
                            ref={confirmRef}
                            aria-disabled={isSubmitting}
                            onClick={!isSubmitting ? onConfirm : undefined}
                            onKeyDown={(e) =>
                                (e.key === "Enter" || e.key === " ") && !isSubmitting && onConfirm()
                            }
                            className={`select-none rounded-md px-3 py-2 text-xs font-medium text-white ${isSubmitting
                                    ? "bg-gray-300 cursor-not-allowed"
                                    : "bg-gray-900 hover:bg-gray-800 cursor-pointer"
                                } focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900`}
                        >
                            <div className="flex items-center gap-2">
                                {isSubmitting ? (
                                    <span
                                        className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                                        aria-hidden="true"
                                    />
                                ) : null}
                                <span>{isSubmitting ? "Generating…" : "Yes, generate"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
