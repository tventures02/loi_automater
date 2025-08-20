// src/client/components/SendCenterScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";
import { serverFunctions } from "../../utils/serverFunctions";


type Props = {
    mode: "build" | "send";
};


type QueueItem = {
    id: string;
    recipient: string;
    address?: string;
    docUrl?: string;
    scheduled?: string | null;
    status: "queued" | "scheduled" | "sending" | "sent" | "failed";
    lastError?: string | null;
};

type SendSummary = {
    remaining: number;      // MailApp.getRemainingDailyQuota()
    queued: number;
    scheduled: number;
    sentToday: number;
};

const placeholderQueue: QueueItem[] = [
    { id: "1", recipient: "agent1@example.com", address: "123 Main St", docUrl: "#", status: "queued", scheduled: null },
    { id: "2", recipient: "agent2@example.com", address: "456 Oak Ave", docUrl: "#", status: "queued", scheduled: null },
    { id: "3", recipient: "agent3@example.com", address: "789 Pine Rd", docUrl: "#", status: "failed", lastError: "Bounce", scheduled: null },
];

export default function SendCenterScreen({ mode }: Props) {
    const [isLoading, setIsLoading] = useState(true);
    const [summary, setSummary] = useState<SendSummary>({ remaining: 100, queued: 2, scheduled: 0, sentToday: 0 });
    const [items, setItems] = useState<QueueItem[]>(placeholderQueue);
    const [filter, setFilter] = useState<"all" | "queued" | "scheduled" | "failed" | "sent">("all");
    const [sending, setSending] = useState(false);
    const [toast, setToast] = useState<string>("");

    // Load summary + queue (fallback to placeholders if server functions not ready)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setIsLoading(true);

                // These server calls are optional placeholders — catch errors silently and show demo data
                const s = await safeCall(async () => serverFunctions.getSendSummary());
                const q = await safeCall(async () => serverFunctions.queueList({ status: "all", limit: 50 }));

                if (!cancelled) {
                    if (s?.remaining != null) {
                        setSummary({
                            remaining: s.remaining,
                            queued: s.queued ?? items.filter(i => i.status === "queued").length,
                            scheduled: s.scheduled ?? 0,
                            sentToday: s.sentToday ?? 0,
                        });
                    }
                    if (Array.isArray(q?.items)) {
                        setItems(q.items);
                    }
                }
            } finally {
                if (!cancelled) setIsLoading(false);
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
    const canSend = summary.remaining > 0 && queuedCount > 0;

    const sendNext = async () => {
        if (!canSend) return;
        setSending(true);
        try {
            // Placeholder server call; if not available, just fake success
            const n = Math.min(summary.remaining, queuedCount, 100);
            const res = await safeCall(async () => serverFunctions.sendNextBatch({ max: n }));
            const created = res?.sent ?? n;

            // Reflect locally
            let updated = 0;
            const nextItems = items.map(i => {
                if (updated < created && i.status === "queued") {
                    updated++;
                    return { ...i, status: "sent" as const };
                }
                return i;
            });
            setItems(nextItems);
            setSummary(s => ({ ...s, remaining: Math.max(0, s.remaining - created), sentToday: s.sentToday + created, queued: Math.max(0, s.queued - created) }));
            setToast(`Sent ${created} LOIs`);
        } catch {
            setToast("Send failed. Please try again.");
        } finally {
            setSending(false);
            setTimeout(() => setToast(""), 3500);
        }
    };

    const scanForNewRows = async () => {
        // Placeholder UX: show a tiny toast to confirm
        setToast("Scanned sheet: 42 new rows found (demo)");
        setTimeout(() => setToast(""), 2500);
    };

    const addNewLoisToQueue = async () => {
        // Placeholder UX: append some queued items
        const demo = [
            { id: cryptoId(), recipient: "new1@example.com", address: "11 Birch Ln", docUrl: "#", status: "queued" as const, scheduled: null },
            { id: cryptoId(), recipient: "new2@example.com", address: "22 Cedar Dr", docUrl: "#", status: "queued" as const, scheduled: null },
        ];
        setItems(prev => [...demo, ...prev]);
        setSummary(s => ({ ...s, queued: s.queued + demo.length }));
        setToast(`Queued ${demo.length} new LOIs`);
        setTimeout(() => setToast(""), 2500);
    };

    return (
        <div className="space-y-3">
            {/* Summary strip */}
            <div className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge label={`Remaining today: ${summary.remaining}`} />
                        <Badge label={`Queued: ${summary.queued}`} />
                        <Badge label={`Sent today: ${summary.sentToday}`} />
                    </div>
                    <div className="flex items-center gap-2">
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={canSend && !sending ? sendNext : undefined}
                            className={`select-none rounded-md px-3 py-2 text-xs font-medium text-white ${canSend && !sending ? "bg-gray-900 hover:bg-gray-800 cursor-pointer" : "bg-gray-300 cursor-not-allowed"}`}
                        >
                            {sending ? "Sending…" : `Send next ${Math.min(summary.remaining, queuedCount) || 0}`}
                        </div>
                    </div>
                </div>
            </div>

            {/* Queue list */}
            <div className="rounded-xl border border-gray-200">
                <div className="flex items-center justify-between px-3 py-2">
                    <div className="text-sm font-semibold text-gray-900">Queue</div>
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
