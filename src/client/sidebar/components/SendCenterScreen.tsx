// src/client/components/SendCenterScreen.tsx
import React, { useMemo, useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";
import { serverFunctions } from "../../utils/serverFunctions";
import StickyFooter from "./StickFooter";
import { QueueItem } from "./Sidebar";
import { SendSummary } from "./Sidebar";
import ConfirmSendDialog from "./ConfirmSendDialog";
import ConfirmClearQueueModal from "./ConfirmClearQueueModal";
import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Alert, Tooltip } from "@mui/material";
import { Snackbar } from "@mui/material";

type SendDialogState = { open: boolean; variant: "real" | "test" };
const PAGE_SIZE = 10;
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
    const [filter, setFilter] = useState<"all" | "queued" | "failed" | "sent">("all");
    const [sending, setSending] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string, severity: "success" | "error" }>({ open: false, message: "", severity: "success" });
    const [queueOpen, setQueueOpen] = useState<boolean>(false); // collapsible Queue
    const [dialog, setDialog] = useState<SendDialogState>({ open: false, variant: "real" });
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [openClear, setOpenClear] = useState(false);
    const [clearing, setClearing] = useState(false);
    const { summary, items, loading, error } = sendData;

    const queuedTotal = summary?.queued ?? 0;
    const canSend = (summary?.remaining ?? 0) > 0 && queuedTotal > 0;

    const filtered = useMemo(() => {
        setVisibleCount(PAGE_SIZE);
        if (filter === "all") return items;
        return items.filter(i => i.status === filter);
    }, [items, filter]);

    const visibleItems = useMemo(
        () => filtered.slice(0, Math.min(visibleCount, filtered.length)),
        [filtered, visibleCount]
    );

    // keep your existing logic but move the entry points:
    const confirmRealSend = async () => {
        if (!(summary?.remaining && queuedTotal)) return;
        setSending(true);
        try {
            const n = Math.min(summary.remaining, queuedTotal, 100);
            const res = await serverFunctions.sendNextBatch({ max: n });
            const sent = res?.sent ?? n;

            // Optimistic local counters; the list itself will be refreshed after
            setSendData(s => ({
                ...s,
                summary: {
                    ...s.summary,
                    remaining: res?.creditsLeft ?? Math.max(0, (s.summary?.remaining || 0) - sent),
                    sent: (s.summary?.sent || 0) + sent,
                    queued: Math.max(0, (s.summary?.queued || 0) - sent),
                }
            }));
            setSnackbar({ open: true, message: `Sent ${sent} LOIs`, severity: "success" });
        } catch (e) {
            setSnackbar({ open: true, message: `Send failed. ${e.message}`, severity: "error" });
        } finally {
            setSending(false);
            setDialog({ open: false, variant: "real" });
            setTimeout(() => setSnackbar({ open: false, message: "", severity: "success" }), 3500);
            refreshSendData(true);
        }
    };

    const confirmTestSend = async (sampleCount = 1) => {
        // do NOT mutate queue locally
        setSending(true);
        try {
            const n = Math.min(sampleCount, queuedTotal, 5);
            await serverFunctions.sendNextBatch({
                max: n,
                testMode: true,
                previewTo: sendData?.summary?.userEmail, // fallback handled server-side
            });

            setSnackbar({ open: true, message: `Sent ${n} test email${n > 1 ? "s" : ""} to ${sendData?.summary?.userEmail || "you"}`, severity: "success" });
        } catch {
            setSnackbar({ open: true, message: "Test send failed. Please try again.", severity: "error" });
        } finally {
            setSending(false);
            setDialog({ open: false, variant: "test" });
            setTimeout(() => setSnackbar({ open: false, message: "", severity: "success" }), 3500);
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
            setSnackbar({ open: true, message: "Queue cleared.", severity: "success" });
        } catch {
            setSnackbar({ open: true, message: "Failed to clear queue. Please try again.", severity: "error" });
        } finally {
            setClearing(false);
            setOpenClear(false);
            setTimeout(() => setSnackbar({ open: false, message: "", severity: "success" }), 2500);
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
        setSnackbar({ open: true, message: "Scanned sheet: 42 new rows found (demo)", severity: "success" });
        setTimeout(() => setSnackbar({ open: false, message: "", severity: "success" }), 2500);
    };

    const addNewLoisToQueue = async () => {
        const demo = [
            { id: cryptoId(), recipient: "new1@example.com", address: "11 Birch Ln", docUrl: "#", status: "queued" as const, scheduled: null },
            { id: cryptoId(), recipient: "new2@example.com", address: "22 Cedar Dr", docUrl: "#", status: "queued" as const, scheduled: null },
        ];
        setSendData(s => ({ ...s, summary: { ...s.summary, queued: s.summary?.queued + demo.length } }));
        setSnackbar({ open: true, message: `Queued ${demo.length} new LOIs`, severity: "success" });
        setTimeout(() => setSnackbar({ open: false, message: "", severity: "success" }), 2500);
    };

    const openRealDialog = () => setDialog({ open: true, variant: "real" });
    const openTestDialog = () => setDialog({ open: true, variant: "test" });

    let primaryLabel = "Send Next";
    if (sending) primaryLabel = "Sending…";
    else if (queuedTotal === 0) primaryLabel = "Open Builder";
    else primaryLabel = `Send Next ${Math.min(summary?.remaining, queuedTotal) || 0}`;

    const primaryDisabled = queuedTotal === 0 ? loading : (!canSend || sending || loading);
    const canLoadMore = visibleCount < filtered.length;
    const queueTotal = summary?.total ?? 0;

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
                                <Badge label={`Sent: ${summary?.sent ?? "—"}`} />
                                <Badge label={`Failed: ${summary?.failed ?? "—"}`} />
                                <Badge label={`All queue items: ${summary?.total ?? "—"}`} />
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
                            <div className="text-xs text-gray-600 truncate overflow-hidden whitespace-nowrap ellipsis">
                                {loading ? "" : queueTotal > 0 ? `Showing ${visibleItems.length} of ${queueTotal}` : ""}
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
                                    {visibleItems.map((item) => (
                                        <li key={item.id} className="py-2 text-xs flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-gray-900 truncate">{item.recipient}</div>
                                                <div className="text-[11px] text-gray-600 truncate">
                                                    {item.subject || "(no subject)"}
                                                </div>
                                                <div className="text-gray-600 text-[11px]">Queue tab row: {item.queueTabRow}</div>
                                                <div className="text-[11px] text-gray-600 truncate">
                                                    {item.docUrl ? (
                                                        <a className="underline underline-offset-2" href={item.docUrl} target="_blank" rel="noopener noreferrer">
                                                            Open doc
                                                        </a>
                                                    ) : (
                                                        "No doc"
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

                                {/* Showing X of Y */}
                                <div className="pt-1 pb-1 flex items-center justify-between text-[11px] text-gray-600">
                                    {canLoadMore && (
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length))}
                                            className="select-none rounded-md ring-1 ring-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 cursor-pointer justify-end"
                                        >
                                            Show next {Math.min(PAGE_SIZE, filtered.length - visibleCount)}
                                        </div>
                                    )}
                                </div>

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

            {/* Snackbar */}
            {snackbar.open && (
                <Snackbar open={snackbar.open} autoHideDuration={3500} onClose={() => setSnackbar({ open: false, message: "", severity: "success" })}>
                    <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
                </Snackbar>
            )}  

            {/* Sticky Footer (primary action: Send next) */}
            <StickyFooter
                primaryLabel={primaryLabel}
                secondaryLabel="Send Test Email"
                onSecondary={queuedTotal > 0 ? openTestDialog : undefined}
                onPrimary={canSend && !sending ? openRealDialog : queuedTotal === 0 && !loading && (mode === "send" || currentStep === "send") ? handleGoToGenLOIs : undefined}
                primaryDisabled={primaryDisabled}
                primaryLoading={sending}
                leftSlot={null}
                helperText={loading ? null : queuedTotal === 0 ? "No queued items to send. Generate some LOIs first." : undefined}
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
                queued={queuedTotal}
                toEmail={sendData?.summary?.userEmail}
                defaultSampleCount={1}
                isSubmitting={sending}
            />

            {openClear && (
                <ConfirmClearQueueModal
                    count={queueTotal}
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
