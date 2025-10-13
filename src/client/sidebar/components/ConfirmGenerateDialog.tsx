// ConfirmGenerateDialog.tsx
import { ArrowTopRightOnSquareIcon, PaperClipIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import CONSTANTS from "../../utils/constants";


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
    attachPdf: boolean;
    useLOIAsBody: boolean;
    emailPreview: { subject: string; body: string } | null;
    isPremium: boolean;
    onUpgradeClick: () => void;
};

export default function ConfirmGenerateDialog({
    open,
    onConfirm,
    onCancel,
    eligibleCount,
    sheetName,
    templateDocId,
    fileNamePattern,
    attachPdf,
    useLOIAsBody,
    isSubmitting = false,
    emailPreview,
    isPremium,
    onUpgradeClick,
}: Props) {
    const [showEmailPreview, setShowEmailPreview] = useState<boolean>(false);
    const [showCreationSummary, setShowCreationSummary] = useState<boolean>(false);
    const confirmRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            setShowEmailPreview(false);
            setShowCreationSummary(false);
            return;
        }
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

    const sheetNameShort = sheetName?.length > 20 ? sheetName.slice(0, 20) + "..." : sheetName;
    const count = isPremium ? eligibleCount ?? 0 : Math.min(eligibleCount ?? 0, CONSTANTS.FREE_LOI_GEN_CAP_PER_SHEET);
    const willCreateDocs = !!attachPdf; // with new server behavior, we only create Docs when attaching PDFs
    const docNoun = `Doc${count === 1 ? "" : "s"}`;
    const itemNoun = `${count} job${count === 1 ? "" : "s"}`;
    const emailBodySourceText = useLOIAsBody ? "from your LOI doc template" : "from your text template";



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
                            {/* Title */}
                            <h3 id="gen-title" className="text-sm font-semibold text-gray-900">
                                {willCreateDocs ? "Create LOIs?" : "Create LOIs?"}
                            </h3>

                            {!isPremium && eligibleCount > CONSTANTS.FREE_LOI_GEN_CAP_PER_SHEET && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 w-fit mt-2 mb-2">
                                    You can create up to {CONSTANTS.FREE_LOI_GEN_CAP_PER_SHEET} LOIs <b>per sheet</b> on the free plan. <span className="underline cursor-pointer text-amber-900" onClick={onUpgradeClick}>Upgrade</span> for unlimited.
                                </div>
                            )}

                            {/* Primary explainer */}
                            <p className="mt-1 text-xs leading-5 text-gray-600">
                                {willCreateDocs ? (
                                    <>
                                        This will create <b>{count || "—"}</b> {docNoun} in your "LOIs" Drive subfolder 
                                        and jobs will be added to the <b>Sender Queue</b>. You can review before sending.
                                    </>
                                ) : (
                                    <>
                                        This will create and add <b>{itemNoun}</b> to the <b>Sender Queue</b> with the
                                        LOI email body text resolved {emailBodySourceText}. You can review before sending.
                                    </>
                                )}
                            </p>

                            {/* Links / meta */}
                            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-[11px] text-gray-700 space-y-1">
                                <div className={`text-gray-800 font-semibold ${showCreationSummary ? "mb-2" : "mb-0"} block w-full`}>
                                    <div className="inline-block">Summary</div>
                                    <div className="float-right cursor-pointer select-none" onClick={() => setShowCreationSummary(!showCreationSummary)}>
                                        <svg
                                            className={`h-4 w-4 text-gray-500 transition-transform ${showCreationSummary ? "rotate-180" : ""}`}
                                            viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                                        >
                                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 111.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.25 8.27a.75.75 0 01-.02-1.06z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </div>

                                <div className={`${showCreationSummary ? "block" : "hidden"}`}>
                                    {templateDocId && (attachPdf || useLOIAsBody) ? (
                                        <div className="flex items-center justify-between truncate mb-1">
                                            <span className="text-gray-500">Template</span>
                                            <a
                                                href={`https://docs.google.com/document/d/${templateDocId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[11px] !text-gray-600 hover:!text-gray-900 underline underline-offset-2"
                                            >
                                                <Tooltip title="Open template in Google Docs">
                                                    <ArrowTopRightOnSquareIcon className="h-3 w-3 inline-block" />
                                                </Tooltip>
                                            </a>
                                        </div>
                                    ) : null}

                                    {sheetName ? (
                                        <div className="flex items-center justify-between truncate">
                                            <span className="text-gray-500">Data source sheet</span>
                                            <code className="rounded bg-white px-1 py-[1px]">{sheetNameShort}</code>
                                        </div>
                                    ) : null}

                                    {fileNamePattern && willCreateDocs ? (
                                        <div className="flex items-center justify-between truncate">
                                            <span className="text-gray-500">Doc name pattern</span>
                                            <code className="rounded bg-white px-1 py-[1px]">{fileNamePattern}</code>
                                        </div>
                                    ) : null}

                                    {/* Clear mapping of behavior */}
                                    <div className="mt-2 grid grid-cols-1 gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500 flex items-center gap-1">
                                                Attach LOI as PDF <PaperClipIcon className="h-3 w-3" />
                                            </span>
                                            <code className="rounded bg-white px-1 py-[1px]">{attachPdf ? "Yes" : "No"}</code>
                                        </div>

                                        {
                                            useLOIAsBody && (
                                                <div className="flex items-center justify-between truncate">
                                                    <span className="text-gray-500">Use LOI as email body</span>
                                                    <code className="rounded bg-white px-1 py-[1px]">{useLOIAsBody ? "Yes" : "No"}</code>
                                                </div>
                                            )
                                        }

                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500">
                                                Google Docs to be created
                                            </span>
                                            <code className="rounded bg-white px-1 py-[1px]">
                                                {willCreateDocs ? `${count || "—"}` : "None"}
                                            </code>
                                        </div>
                                    </div>

                                </div>


                            </div>
                        </div>
                    </div>

                    {/* Email preview */}
                    {emailPreview && showEmailPreview ? (
                        <>
                            <div className="mt-2 rounded-lg bg-gray-50 p-3 max-h-[200px] overflow-y-auto">
                                <div className="text-[11px] font-semibold text-gray-500 mb-1 underline">👀 Email preview 👀</div>
                                <div className="text-xs text-gray-900 mt-3">
                                    <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed"><b>Subject:</b> {emailPreview.subject}</div>
                                </div>
                                <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed mt-3 bg-gray-50"><b>Body:</b></div>
                                <div>
                                    {useLOIAsBody ? (
                                        <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{`{{LOI document text}} `}
                                            <ArrowTopRightOnSquareIcon className="w-3 h-3 inline-block cursor-pointer ml-1" onClick={() => window.open(`https://docs.google.com/document/d/${templateDocId}/edit`, '_blank')} />
                                        </div>
                                    ) : <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                                        <div>{emailPreview.body}</div>
                                    </div>}
                                    {attachPdf && <div className="flex items-center gap-1 mt-3 text-xs text-gray-800 whitespace-pre-wrap"><PaperClipIcon className="w-3 h-3 inline-block" />LOI PDF Attached</div>}
                                </div>
                            </div>
                            <div className={`text-[11px] text-gray-800 hover:underline cursor-pointer flex justify-end mt-1`} onClick={() => setShowEmailPreview(false)}>✉️ Hide email preview</div>
                        </>
                    ) : (
                        <span className={`text-[11px] text-gray-800 hover:underline cursor-pointer flex justify-end mt-1`} onClick={() => setShowEmailPreview(true)}>✉️ Show email preview</span>
                    )}

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
                                ? "bg-gray-300 !cursor-not-allowed"
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
                                <span>
                                    {isSubmitting
                                        ? "Creating…"
                                        : willCreateDocs
                                            ? `Yes, create ${count || ""} Doc${count === 1 ? "" : "s"}`
                                            : "Yes, create LOI jobs"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
