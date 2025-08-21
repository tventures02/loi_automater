// src/client/components/SendCenterScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";
import { serverFunctions } from "../../utils/serverFunctions";
import StickyFooter from "./StickFooter";
import { QueueItem } from "./Sidebar";
import { SendSummary } from "./Sidebar";

type Props = {
    mode: "build" | "send";
    summary: SendSummary | null;
    items: QueueItem[];
    isLoading: boolean;
    error?: string | null;
    onRefresh?: () => void;
    setSendData: React.Dispatch<React.SetStateAction<{
        summary: SendSummary | null;
        items: QueueItem[];
        lastFetched: number;
        loading: boolean;
        error?: string | null;
    }>>;
};

const placeholderQueue: QueueItem[] = [];

export default function SendCenterScreen({ 
    mode,
    summary, 
    items, 
    isLoading, 
    error, 
    onRefresh,
    setSendData
}: Props) {
    const [filter, setFilter] = useState<"all" | "queued" | "scheduled" | "failed" | "sent">("all");
    const [sending, setSending] = useState(false);
    const [toast, setToast] = useState<string>("");
    const [queueOpen, setQueueOpen] = useState<boolean>(false); // collapsible Queue

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setSendData(s => ({ ...s, loading: true }));
                const summaryRes = await safeCall(async () => serverFunctions.getSendSummary());
                const q = await safeCall(async () => serverFunctions.queueList({ status: "all", limit: 50 }));
                if (!cancelled) {
                    if (summaryRes?.remaining) {
                        setSendData(s => ({ ...s, summary: {
                            remaining: summaryRes.remaining,
                            queued: summaryRes.queued ?? items.filter(i => i.status === "queued").length,
                            scheduled: summaryRes.scheduled ?? 0,
                            sentToday: summaryRes.sentToday ?? 0,
                        }}));
                    }
                    if (Array.isArray(q?.items)) setSendData(s => ({ ...s, items: q.items }));
                }
            } finally {
                if (!cancelled) setSendData(s => ({ ...s, loading: false }));
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filtered = useMemo(() => {
        if (filter === "all") return items;
        return items.filter(i => i.status === filter);
    }, [items, filter]);

    const queuedCount = items.filter(i => i.status === "queued").length;
    const canSend = summary?.remaining > 0 && queuedCount > 0;

    const sendNext = async () => {
        if (!canSend) return;
        setSending(true);
        try {
            const n = Math.min(summary?.remaining, queuedCount, 100);
            const res = await safeCall(async () => serverFunctions.sendNextBatch({ max: n }));
            const created = res?.sent ?? n;

            // Update local UI
            let updated = 0;
            const nextItems = items.map(i => {
                if (updated < created && i.status === "queued") {
                    updated++;
                    return { ...i, status: "sent" as const };
                }
                return i;
            });
            setSendData(s => ({ ...s, items: nextItems }));
            setSendData(s => ({
                ...s,
                summary: {
                    ...s.summary,
                    remaining: Math.max(0, s.summary?.remaining - created),
                    sentToday: s.summary?.sentToday + created,
                    queued: Math.max(0, s.summary?.queued - created),
                }
            }));
            setToast(`Sent ${created} LOIs`);
        } catch {
            setToast("Send failed. Please try again.");
        } finally {
            setSending(false);
            setTimeout(() => setToast(""), 3500);
        }
    };

    const scanForNewRows = async () => {
        setToast("Scanned sheet: 42 new rows found (demo)");
        setTimeout(() => setToast(""), 2500);
    };

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

    // Main content height: allow space for sticky footer
    return (
        <div className="space-y-3 pb-16">
            {/* Summary strip with a Refresh control */}
            <div className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge label={`Remaining today: ${summary?.remaining ?? "—"}`} />
                        <Badge label={`Queued: ${summary?.queued ?? "—"}`} />
                        <Badge label={`Sent today: ${summary?.sentToday ?? "—"}`} />
                    </div>
                    <div className="flex items-center gap-2">
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={onRefresh}
                            className="select-none rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                        >
                            Refresh
                        </div>
                    </div>
                </div>
                {error ? <div className="mt-2 text-[11px] text-red-600">{error}</div> : null}
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
                    <div className="text-sm font-semibold text-gray-900">Queue</div>
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
                        <div className="flex items-center justify-between px-3 py-2">
                            <div className="text-xs text-gray-600">
                                {isLoading ? "Loading…" : `${filtered.length} item${filtered.length !== 1 ? "s" : ""}`}
                            </div>
                            <div className="flex items-center gap-2">
                                <FilterPill active={filter === "all"} onClick={() => setFilter("all")} label="All" />
                                <FilterPill active={filter === "queued"} onClick={() => setFilter("queued")} label="Queued" />
                                <FilterPill active={filter === "scheduled"} onClick={() => setFilter("scheduled")} label="Scheduled" />
                                <FilterPill active={filter === "failed"} onClick={() => setFilter("failed")} label="Failed" />
                                <FilterPill active={filter === "sent"} onClick={() => setFilter("sent")} label="Sent" />
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="px-3 pb-3 text-xs text-gray-500 flex items-center gap-2">
                                <InlineSpinner /> Loading…
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="px-3 pb-3 text-xs text-gray-600">No items.</div>
                        ) : (
                            <div className="px-3 pb-3">
                                <ul className="divide-y divide-gray-100">
                                    {filtered.map((item) => (
                                        <li key={item.id} className="py-2 text-xs flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-gray-900 truncate">{item.recipient}</div>
                                                <div className="text-[11px] text-gray-600 truncate">
                                                    {item.address || "(no address)"} ·{" "}
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
            <div className="rounded-xl border border-gray-200 p-3 space-y-2">
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
            </div>

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-3 right-3 z-50 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow">
                    {toast}
                </div>
            )}

            {/* Sticky Footer (primary action: Send next) */}
            <StickyFooter
                primaryLabel={sending ? "Sending…" : `Send next ${Math.min(summary?.remaining, queuedCount) || 0}`}
                onPrimary={canSend && !sending ? sendNext : undefined}
                primaryDisabled={!canSend || sending}
                primaryLoading={sending}
                leftSlot={<span>Remaining today: {summary?.remaining}</span>}
                helperText={queuedCount === 0 ? "No queued items to send." : undefined}
                currentStep="send"
            />
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
