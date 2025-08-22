// src/client/components/SendCenterScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";
import { serverFunctions } from "../../utils/serverFunctions";
import StickyFooter from "./StickFooter";
import { QueueItem } from "./Sidebar";
import { SendSummary } from "./Sidebar";
import ConfirmSendDialog from "./ConfirmSendDialog";
import ConfirmClearQueueModal from "./ConfirmClearQueueModal";
import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@mui/material";

type SendDialogState = { open: boolean; variant: "real" | "test" };

type Props = {
    sendData: {
        summary: SendSummary | null;
        items: QueueItem[];
        lastFetched: number;
        loading: boolean;
        error?: string | null;
    };
    onRefresh?: () => void;
    setSendData: React.Dispatch<React.SetStateAction<{
        summary: SendSummary | null;
        items: QueueItem[];
        lastFetched: number;
        loading: boolean;
        error?: string | null;
    }>>;
    refreshSendData: (force?: boolean) => void;
    setMode: (mode: "build" | "send") => void;
    mode: "build" | "send";
    currentStep: string;
    setCurrentStep: React.Dispatch<React.SetStateAction<string>>;
};

export default function SendCenterScreen({
    sendData,
    onRefresh,
    setSendData,
    refreshSendData,
    setMode,
    mode,
    currentStep,
    setCurrentStep,
}: Props) {
    const [filter, setFilter] = useState<"all" | "queued" | "scheduled" | "failed" | "sent">("all");
    const [sending, setSending] = useState(false);
    const [toast, setToast] = useState<string>("");
    const [queueOpen, setQueueOpen] = useState<boolean>(false); // collapsible Queue
    const [dialog, setDialog] = useState<SendDialogState>({ open: false, variant: "real" });

    const [openClear, setOpenClear] = useState(false);
    const [clearing, setClearing] = useState(false);

    const { summary, items, loading, error } = sendData;

    const filtered = useMemo(() => {
        if (filter === "all") return items;
        return items.filter(i => i.status === filter);
    }, [items, filter]);

    const queuedCount = items.filter(i => i.status === "queued").length;
    const canSend = summary?.remaining > 0 && queuedCount > 0;

    // keep your existing logic but move the entry points:
    const confirmRealSend = async () => {
        if (!(summary?.remaining && queuedCount)) return;
        setSending(true);
        try {
            const n = Math.min(summary.remaining, queuedCount, 100);
            const res = await safeCall(async () => serverFunctions.sendNextBatch({ max: n }));
            const created = res?.sent ?? n;

            // update local UI as you already do:
            let updated = 0;
            const nextItems = items.map(i => (updated < created && i.status === "queued" ? (updated++, { ...i, status: "sent" as const }) : i));
            setSendData(s => ({ ...s, items: nextItems }));
            setSendData(s => ({
                ...s,
                summary: {
                    ...s.summary,
                    remaining: Math.max(0, (s.summary?.remaining || 0) - created),
                    sent: (s.summary?.sent || 0) + created,
                    queued: Math.max(0, (s.summary?.queued || 0) - created),
                }
            }));
            setToast(`Sent ${created} LOIs`);
        } catch {
            setToast("Send failed. Please try again.");
        } finally {
            setSending(false);
            setDialog({ open: false, variant: "real" });
            setTimeout(() => setToast(""), 3500);
            refreshSendData(true);
        }
    };

    const confirmTestSend = async (sampleCount = 1) => {
        // do NOT mutate queue locally
        setSending(true);
        try {
            const n = Math.min(sampleCount, queuedCount, 5);
            await safeCall(async () =>
                serverFunctions.sendNextBatch({
                    max: n,
                    testMode: true,
                    previewTo: sendData?.summary?.userEmail, // fallback handled server-side
                })
            );
            setToast(`Sent ${n} test email${n > 1 ? "s" : ""} to ${sendData?.summary?.userEmail || "you"}`);
        } catch {
            setToast("Test send failed. Please try again.");
        } finally {
            setSending(false);
            setDialog({ open: false, variant: "test" });
            setTimeout(() => setToast(""), 3500);
            refreshSendData(true);
        }
    };

    const handleClearQueue = async () => {
        if (clearing) return;
        setClearing(true);
        try {
            await serverFunctions.queueClearAll();
            // Optimistic local reset; also call onRefresh to re-pull counts
            setSendData(s => ({ ...s, items: [] }));
            setSendData(s => ({
                ...s,
                summary: s.summary ? { ...s.summary, queued: 0 } : s.summary
            }));
            onRefresh?.();
            setToast("Queue cleared.");
        } catch {
            setToast("Failed to clear queue. Please try again.");
        } finally {
            setClearing(false);
            setOpenClear(false);
            setTimeout(() => setToast(""), 2500);
        }
    };

    const handleGoToGenLOIs = () => {
        if (mode === "send") {
            setMode("build");
            setCurrentStep("template");
        }
        else {
            setCurrentStep("lois");
        }
    }

    const scanForNewRows = async () => {
        setToast("Scanned sheet: 42 new rows found (demo)");
        setTimeout(() => setToast(""), 2500);
    };

    const openRealDialog = () => setDialog({ open: true, variant: "real" });
    const openTestDialog = () => setDialog({ open: true, variant: "test" });

    const addNewLoisToQueue = async () => {
        const demo = [
            { id: cryptoId(), recipient: "new1@example.com", address: "11 Birch Ln", docUrl: "#", status: "queued" as const, scheduled: null },
            { id: cryptoId(), recipient: "new2@example.com", address: "22 Cedar Dr", docUrl: "#", status: "queued" as const, scheduled: null },
        ];
        setSendData(s => ({ ...s, items: [...demo, ...s.items] }));
        setSendData(s => ({ ...s, summary: { ...s.summary, queued: s.summary?.queued + demo.length } }));
        setToast(`Queued ${demo.length} new LOIs`);
        setTimeout(() => setToast(""), 2500);
    };

    let primaryLabel = "Send Next";
    if (sending) primaryLabel = "Sending…";
    else if (queuedCount === 0) primaryLabel = "Open Builder";
    else primaryLabel = `Send Next ${Math.min(summary?.remaining, queuedCount) || 0}`;

    const primaryDisabled = queuedCount === 0 ? loading : (!canSend || sending || loading);

    // Main content height: allow space for sticky footer
    return (
        <div className="space-y-3 pb-3">
            <h2 className="text-sm font-semibold text-gray-900">Send Emails</h2>

            {/* Summary strip with a Refresh control */}
            <div className="rounded-xl border border-gray-200 p-3">
                {loading ? <div className="text-xs text-gray-500 flex items-center gap-2"><InlineSpinner /> Loading...</div> :
                    <>
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-medium text-gray-900">Summary</div>
                        </div>
                        <div className="flex items-end justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge label={`Credits left today: ${summary?.remaining ?? "—"}`} />
                                <Badge label={`To be sent: ${summary?.queued ?? "—"}`} />
                                <Badge label={`Successfully sent: ${summary?.sent ?? "—"}`} />
                            </div>
                        </div>
                    </>
                }
                {error ? <div className="mt-2 text-[11px] text-red-600">{error}</div> : null}
                {!loading && <div className="w-full flex items-center justify-end gap-2 mt-2">
                    <Tooltip title="Refresh data from Sender Queue sheet">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={onRefresh}
                        className="flex items-center gap-1 cursor-pointer select-none rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                    >
                        <ArrowPathIcon className="w-3 h-3" />
                        Refresh
                    </div>
                    </Tooltip>
                </div>}
            </div>


            {/* Queue (collapsible) */}
            <div className="rounded-xl border border-gray-200">
                {/* Summary row (click to toggle) */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setQueueOpen(v => !v)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setQueueOpen(v => !v)}
                    className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
                >
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-900">Queue</div>
                    </div>
                    <svg
                        className={`h-4 w-4 text-gray-500 transition-transform ${queueOpen ? "rotate-180" : ""}`}
                        viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                    >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 111.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.25 8.27a.75.75 0 01-.02-1.06z" clipRule="evenodd" />
                    </svg>
                </div>

                {/* Details (collapsible) */}
                {queueOpen && (
                    <>
                        <div className="flex items-center justify-between px-3">
                            <div className="text-xs text-gray-600">
                                {loading ? "" : `${filtered.length} item${filtered.length !== 1 ? "s" : ""}`}
                            </div>
                            {/* CLEAR QUEUE (destructive) */}
                            {items.length > 0 && !loading && <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setOpenClear(true)}
                                className={`select-none !w-auto rounded-md px-2 py-1 text-[11px] ring-1 ${items.length === 0
                                    ? "ring-gray-200 text-gray-400 cursor-not-allowed"
                                    : "ring-red-300 text-red-700 hover:bg-red-50 cursor-pointer"
                                    }`}
                                aria-disabled={items.length === 0}
                            >
                                <div className="flex items-center gap-1"><TrashIcon className="w-3 h-3" /> Clear queue…</div>
                            </div>
                            }
                        </div>


                        <div className="flex items-center justify-between px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <FilterPill active={filter === "all"} onClick={() => setFilter("all")} label="All" />
                                <FilterPill active={filter === "queued"} onClick={() => setFilter("queued")} label="Queued" />
                                <FilterPill active={filter === "failed"} onClick={() => setFilter("failed")} label="Failed" />
                                <FilterPill active={filter === "sent"} onClick={() => setFilter("sent")} label="Sent" />
                            </div>
                        </div>

                        {loading ? (
                            <div className="px-3 pb-3 text-xs text-gray-500 flex items-center gap-2">
                                <InlineSpinner /> Loading…
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="px-3 pb-3 text-xs text-gray-600">No items.</div>
                        ) : (
                            <div className="px-3 pb-3 space-y-1 max-h-[300px] overflow-y-scroll scrollbar-hide">
                                <ul className="divide-y divide-gray-100">
                                    {filtered.map((item) => (
                                        <li key={item.id} className="py-2 text-xs flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-gray-900 truncate">{item.recipient}</div>
                                                <div className="text-[11px] text-gray-600 truncate">
                                                    {item.subject || "(no subject)"}
                                                </div>
                                                <div className="text-[11px] text-gray-600 truncate">
                                                    {item.docUrl ? (
                                                        <a className="underline underline-offset-2" href={item.docUrl} target="_blank" rel="noopener noreferrer">
                                                            open doc
                                                        </a>
                                                    ) : (
                                                        "no doc"
                                                    )}
                                                </div>
                                                {item.status === "failed" && item.lastError ? (
                                                    <div className="text-[11px] text-red-600 truncate mt-0.5">Error: {item.lastError}</div>
                                                ) : null}
                                            </div>
                                            <StatusPill status={item.status} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* New data panel */}
            {/* {!loading && <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="text-sm font-semibold text-gray-900">New data?</div>
                <div className="text-xs text-gray-600">
                    Scan your sheet for rows without an LOI and add them to the queue.
                </div>
                <div className="flex items-center gap-2">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={scanForNewRows}
                        className="select-none rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                        Scan for new rows
                    </div>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={addNewLoisToQueue}
                        className="select-none rounded-md px-3 py-2 text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 cursor-pointer"
                    >
                        Create LOIs for new rows
                    </div>
                </div>
            </div>} */}

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-3 right-3 z-50 rounded-md bg-blue-500 px-3 py-2 text-xs text-white shadow">
                    {toast}
                </div>
            )}

            {/* Sticky Footer (primary action: Send next) */}
            <StickyFooter
                primaryLabel={primaryLabel}
                secondaryLabel="Send Test Email"
                onSecondary={queuedCount > 0 ? openTestDialog : undefined}
                onPrimary={canSend && !sending ? openRealDialog : queuedCount === 0 && !loading && (mode === "send" || currentStep === "send") ? handleGoToGenLOIs : undefined}
                primaryDisabled={primaryDisabled}
                primaryLoading={sending}
                leftSlot={null}
                helperText={loading ? null : queuedCount === 0 ? "No queued items to send. Generate some LOIs first." : undefined}
                currentStep="send"
                mode={mode}
                fixYPos={true}
            />

            <ConfirmSendDialog
                open={dialog.open}
                variant={dialog.variant}
                onCancel={() => setDialog({ open: false, variant: "real" })}
                onConfirm={dialog.variant === "real" ? () => confirmRealSend() : ({ sampleCount } = { sampleCount: 1 }) => confirmTestSend(sampleCount)}
                remaining={summary?.remaining}
                queued={queuedCount}
                toEmail={sendData?.summary?.userEmail}
                defaultSampleCount={1}
                isSubmitting={sending}
            />

            {openClear && (
                <ConfirmClearQueueModal
                    count={items.length}
                    clearing={clearing}
                    onCancel={() => { if (!clearing) { setOpenClear(false); } }}
                    onConfirm={handleClearQueue}
                />
            )}

        </div>
    );
}

/* Small subcomponents */
function Badge({ label }: { label: string }) {
    return (
        <div className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">
            {label}
        </div>
    );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            className={`select-none rounded-md px-2 py-1 text-[11px] cursor-pointer ${active ? "bg-gray-900 text-white" : "ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
        >
            {label}
        </div>
    );
}

function StatusPill({ status }: { status: QueueItem["status"] }) {
    const tone =
        status === "queued" ? "bg-gray-100 text-gray-700" :
            status === "scheduled" ? "bg-indigo-50 text-indigo-700" :
                status === "sending" ? "bg-amber-50 text-amber-700" :
                    status === "sent" ? "bg-emerald-50 text-emerald-700" :
                        "bg-red-50 text-red-700";
    return (
        <div className={`shrink-0 rounded-md px-2 py-1 text-[11px] ${tone}`}>
            {status}
        </div>
    );
}

/* Helpers */
async function safeCall<T>(fn: () => Promise<T>): Promise<T | null> {
    try { return await fn(); } catch { return null; }
}
function cryptoId() {
    try { return crypto.randomUUID(); } catch { return String(Date.now() + Math.random()); }
}
