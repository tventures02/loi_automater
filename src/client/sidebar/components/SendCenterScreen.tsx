// src/client/components/SendCenterScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import InlineSpinner from "../../utils/components/InlineSpinner";
import { serverFunctions } from "../../utils/serverFunctions";
import StickyFooter from "./StickFooter";
import { QueueItem } from "./Sidebar";
import { SendSummary } from "./Sidebar";
import ConfirmSendDialog from "./ConfirmSendDialog";
import ConfirmClearQueueModal from "./ConfirmClearQueueModal";
import { ArrowPathIcon, LinkIcon, PaperClipIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Alert, Tooltip } from "@mui/material";
import { Snackbar } from "@mui/material";
import { User } from "../../utils/types";
import CtaCard from "./CtaCard";
import CONSTANTS from "../../utils/constants";
import JobWarning from "./JobWarning";
import { sendToAmplitude } from "../../utils/amplitude";

const isDev = process.env.REACT_APP_NODE_ENV === 'development' || process.env.REACT_APP_NODE_ENV === 'dev';

// Some constants
const PAGE_SIZE = 50;
export const QUEUE_DISPLAY_LIMIT = 500;

// Types
type SendDialogState = { open: boolean; variant: "real" | "test" };
type AllowedStatus = "queued" | "paused" | "sent" | "failed";
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
    user: User;
    onUpgradeClick: () => void;
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
    user,
    onUpgradeClick,
}: Props) {
    const [filter, setFilter] = useState<"all" | "queued" | "failed" | "paused" | "sent">("all");
    const [sending, setSending] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean, message: string, severity: "success" | "error" | "warning" }>({ open: false, message: "", severity: "success" });
    const [queueOpen, setQueueOpen] = useState<boolean>(false); // collapsible Queue
    const [dialog, setDialog] = useState<SendDialogState>({ open: false, variant: "real" });
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [openClear, setOpenClear] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [openMenu, setOpenMenu] = useState<{
        open: boolean;
        id: string | null;
        x: number;
        y: number;
        current: AllowedStatus;
    }>({ open: false, id: null, x: 0, y: 0, current: "queued" });
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [sendProg, setSendProg] = useState<{
        active: boolean;
        mode: "real" | "test";
        planned: number;
        sent: number;
        failed: number;
        loops: number;
        lastBatch: number;
        batchCap?: number;
        timeBudgetHit?: boolean;
    }>({ active: false, mode: "real", planned: 0, sent: 0, failed: 0, loops: 0, lastBatch: 0 });
    const pauseRef = useRef(false);
    const [pauseRequested, setPauseRequested] = useState(false);
    const [iQueueEmailBodyPreview, setIQueueEmailBodyPreview] = useState<number | null>(null);
    const requestPause = () => { pauseRef.current = true; setPauseRequested(true); };
    const resetPause = () => { pauseRef.current = false; setPauseRequested(false); };

    const { summary, items, loading, error } = sendData;
    const isPremium = user.subscriptionStatusActive;
    const queuedTotal = summary?.queued ?? 0;

    useEffect(() => {
        if (summary?.missing.length > 0) {
            setSnackbar({ open: true, message: `Some columns (${summary?.missing.join(", ")}) are missing in the "Sender Queue" tab. Please add them and try again or delete the "Sender Queue" tab and reopen Bulk LOI Sender.`, severity: "error" });
        }
    }, [summary?.missing]);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [filter, items.length]);


    useEffect(() => {
        if (!openMenu.open) return;
        const close = () => setOpenMenu(m => ({ ...m, open: false }));
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
        window.addEventListener("scroll", close, true);
        window.addEventListener("resize", close);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
            window.removeEventListener("keydown", onKey);
        };
    }, [openMenu.open]);

    // keep your existing logic but move the entry points:
    const confirmRealSend = async (
        count: number,
        stopOnError: boolean = false,
    ) => {
        if (!(summary?.remaining && queuedTotal)) return;
        if (summary?.missing.length > 0) {
            setSnackbar({ open: true, message: `Some columns (${summary?.missing.join(", ")}) are missing in the "Sender Queue" tab. Please add them and try again or delete the "Sender Queue" tab and reopen Bulk LOI Sender.`, severity: "error" });
            return;
        }
        if (count === 0) {
            setSnackbar({ open: true, message: "No emails to send. Please generate some LOIs first or increase the number of emails to send.", severity: "error" });
            return;
        }
        const requestedCount = count;
        setDialog({ open: false, variant: "real" });

        resetPause();
        setSending(true);
        setSendProg({ active: true, mode: "real", planned: requestedCount, sent: 0, failed: 0, loops: 0, lastBatch: 0 });

        try {
            sendToAmplitude(CONSTANTS.AMPLITUDE.SENDING_LOIS, { testMode: false }, { email: user.email });
        } catch (error) { }

        try {
            let sentSoFar = 0;
            let failedSoFar = 0;
            let loops = 0;
            let done = false
            let nextToken: number | null = 2; // Start scanning from row 2
            const attachPDFBatchCap = CONSTANTS.USE_GOOGLE_DOCS_BATCH_CAP;
            const noAttachBatchCap = CONSTANTS.NO_ATTACH_BATCH_CAP;
            const MAX_LOOPS = Math.ceil(CONSTANTS.MAX_GWORKSPACE_PREMIUM_SEND_CAP / attachPDFBatchCap); // hard safety
            let queuedRemaining = queuedTotal;

            while (loops < MAX_LOOPS && !done) {
                if (pauseRef.current) break;

                const ask = Math.max(1, requestedCount - sentSoFar);
                const res = await serverFunctions.sendNextBatch({
                    count: ask,
                    stopOnError,
                    attachPDFBatchCap,
                    noAttachBatchCap,
                    isPremium,
                    freeDailyCap: CONSTANTS.DEFAULT_FREE_DAILY_SEND_CAP,
                    startFromRow: nextToken,
                });

                if (isDev) {
                    console.log('real send results')
                    console.log('res', res);
                }

                const sent = res?.sent ?? 0;
                const failed = res?.failed ?? 0;
                const creditsLeft = res?.creditsLeft ?? 0;
                const timeBudgetHit = !!res?.timeBudgetHit;
                nextToken = res?.nextToken ?? null;

                // Optimistic summary updates
                setSendData(s => ({
                    ...s,
                    summary: {
                        ...s.summary,
                        remaining: creditsLeft ?? Math.max(0, (s.summary?.remaining || 0) - sent),
                        sent: (s.summary?.sent || 0) + sent,
                        queued: Math.max(0, (s.summary?.queued || 0) - sent),
                    }
                }));

                sentSoFar += sent;
                failedSoFar += failed;
                loops += 1;

                setSendProg(p => ({
                    ...p,
                    loops,
                    batchCap: res?.batchCap,
                    timeBudgetHit,
                    lastBatch: sent,
                    sent: sentSoFar,
                    failed: failedSoFar,
                }));

                // Stop conditions
                queuedRemaining = Math.max(0, queuedRemaining - sent);
                const noneQueuedNow = queuedRemaining <= 0;
                if (sent === 0 || creditsLeft <= 0 || noneQueuedNow) {
                    done = true;
                }
                if (sentSoFar >= requestedCount || nextToken === null) {
                    done = true;
                }
                if (stopOnError && failedSoFar > 0) {
                    done = true;
                }
            }

            if (failedSoFar > 0) {
                setSnackbar({ open: true, message: `Sent ${sentSoFar} LOIs so far but failed to send ${failedSoFar} LOIs.`, severity: "warning" });
            }
            else {
                setSnackbar({ open: true, message: `Successfully sent ${sentSoFar} LOIs.`, severity: "success" });
                try {
                    sendToAmplitude(CONSTANTS.AMPLITUDE.SENT_LOIS, { requestedCount, sent: sentSoFar, testMode: false }, { email: user.email });
                } catch (error) {}
            }
        } catch (e) {
            setSnackbar({ open: true, message: `Send failed. ${e.message}`, severity: "error" });
            try {
                sendToAmplitude(CONSTANTS.AMPLITUDE.ERROR, { error: e?.message || JSON.stringify(e), where: 'sendCenterScreen (confirmRealSend)' }, { email: user.email });
            } catch (error) {}
        } finally {
            setSending(false);
            setDialog({ open: false, variant: "real" });
            setSendProg(p => ({ ...p, active: false }));
            refreshSendData(true);
        }
    };

    const updateItemStatus = async (item: QueueItem, next: AllowedStatus) => {
        if (pendingId) return;
        setPendingId(item.id);
        try {
            setOpenMenu(m => ({ ...m, open: false }));
            await serverFunctions.queueUpdateStatus({ id: item.id, status: next });
            setSendData(s => ({
                ...s,
                items: s.items.map(it => (it.id === item.id ? { ...it, status: next } : it)),
            }));
            serverFunctions.highlightQueueRow(item.queueTabRow);
            setSnackbar({ open: true, message: `Updated status to ${next}.`, severity: "success" });
            // refreshSendData(true);
        } finally {
            setPendingId(null);
        }
    };

    const onStatusPillClick = (e: React.MouseEvent, item: QueueItem) => {
        if (pendingId) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const menuWidth = 160;
        setOpenMenu({
            open: true,
            id: item.id,
            x: Math.min(rect.left, window.innerWidth - menuWidth - 8),
            y: rect.bottom + 6,
            current: (item.status as AllowedStatus) || "queued",
        });
    };

    const confirmTestSend = async (sampleCount = 1) => {
        if (!summary?.remaining) return;
        if (summary?.missing.length > 0) {
            setSnackbar({ open: true, message: `Some columns (${summary?.missing.join(", ")}) are missing in the "Sender Queue" tab. Please add them and try again or delete the "Sender Queue" tab and reopen Bulk LOI Sender.`, severity: "error" });
            return;
        }
        // do NOT mutate queue locally
        setSending(true);
        try {
            sendToAmplitude(CONSTANTS.AMPLITUDE.SENDING_LOIS, { testMode: true }, { email: user.email });
        } catch (error) { }
        const numEmailsToSend = Math.min(sampleCount, queuedTotal, 5);
        let sent = 0;
        try {
            const res = await serverFunctions.sendNextBatch({
                count: numEmailsToSend,
                testMode: true,
                previewTo: sendData?.summary?.userEmail, // fallback handled server-side
                isPremium,
                freeDailyCap: CONSTANTS.DEFAULT_FREE_DAILY_SEND_CAP,
            });

            sent = res?.sent ?? 0;

            if (isDev) {
                console.log('test send results')
                console.log('res', res);
            }

            setSnackbar({ open: true, message: `Sent ${sent} test email${sent > 1 ? "s" : ""} to ${sendData?.summary?.userEmail || "you"}`, severity: "success" });
            try {
                sendToAmplitude(CONSTANTS.AMPLITUDE.SENT_LOIS, { numEmailsToSend, sent, testMode: true }, { email: user.email });
            } catch (error) {}
        } catch (e) {
            setSnackbar({ open: true, message: `Test send failed. ${e.message}`, severity: "error" });
            try {
                sendToAmplitude(CONSTANTS.AMPLITUDE.ERROR, { error: e?.message || JSON.stringify(e), where: 'sendCenterScreen (confirmTestSend)' }, { email: user.email });
            } catch (error) {}
        } finally {
            setSending(false);
            setDialog({ open: false, variant: "test" });
            refreshSendData(true);
        }
    };

    const handleClearQueue = async (deleteDocs: boolean = false, removeSent: boolean = false) => {
        if (clearing) return;
        setClearing(true);

        try {
            if (deleteDocs) {
                // Progressive deletion: loop until nextToken is null
                let nextToken: number | null = 2;      // first data row
                let totalDeleted = 0;
                let totalTrashed = 0;
                let totalMissing = 0;
                let totalCandidates = 0;
                let loops = 0;
                let maxLoops = 10;

                while (nextToken !== null && loops < maxLoops) {
                    const res = await serverFunctions.queueDeleteDocsSimple({
                        removeSent,            // true => only delete Docs for rows with status "sent"
                        startFromRow: nextToken,
                        limit: 200,            // tune as needed
                        timeBudgetMs: 270000,  // ~4.5 min; server will return early if needed
                        throttleEvery: 50,
                        sleepMs: 600,
                        // permanentDelete: false, // keep default "trash"
                    });

                    loops += 1;
                    totalDeleted += res?.deleted ?? 0;
                    totalTrashed += res?.trashed ?? 0;
                    totalMissing += res?.missing ?? 0;
                    totalCandidates += loops === 1 ? (res?.candidates ?? 0) : 0; // candidates per-call; first call is enough for UI
                    nextToken = res?.nextToken ?? null;

                    // Lightweight progress ping (non-blocking UX)
                    setSnackbar({
                        open: true,
                        severity: "success",
                        message: `Deleting docs… ${(totalDeleted + totalTrashed)} deleted so far.`,
                    });

                    // Nothing to do or server didn’t hit budget but returned no candidates
                    if (!res?.timeBudgetHit && (res?.candidates ?? 0) === 0) break;
                    if (loops >= maxLoops) break;
                }

                if (isDev) {
                    console.log("Doc deletion totals:", { totalDeleted, totalTrashed, totalMissing, totalCandidates, loops });
                }
            }

            // Now clear the sheet (all rows or only "sent" rows depending on removeSent)
            await serverFunctions.queueClearAll(removeSent);

            // Optimistic local reset; also call onRefresh to re-pull counts
            setSendData(s => ({ ...s, items: [] }));
            setSendData(s => ({
                ...s,
                summary: s.summary ? { ...s.summary, queued: 0 } : s.summary
            }));
            onRefresh?.();

            setSnackbar({ open: true, message: "Queue was successfully cleared.", severity: "success" });
        } catch (e: any) {
            console.error("Failed to clear queue", e);
            setSnackbar({ open: true, message: "Failed to clear queue. Please try again.", severity: "error" });
            try {
                sendToAmplitude(CONSTANTS.AMPLITUDE.ERROR, { error: e?.message || JSON.stringify(e), where: 'sendCenterScreen (handleClearQueue)' }, { email: user.email });
            } catch (error) {}
        } finally {
            setClearing(false);
            setOpenClear(false);
            setTimeout(() => setSnackbar({ open: false, message: "", severity: "success" }), 2500);
            setQueueOpen(false);
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

    const openRealDialog = () => setDialog({ open: true, variant: "real" });
    const openTestDialog = () => setDialog({ open: true, variant: "test" });

    const filtered = useMemo(() => {
        if (filter === "all") return items;
        return items.filter(i => (i.status || "").toLowerCase() === filter);
    }, [items, filter]);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [filter, items.length]);

    const visibleItems = useMemo(
        () => filtered.slice(0, Math.min(visibleCount, filtered.length)),
        [filtered, visibleCount]
    );

    const handleOpenQueue = () => {
        serverFunctions.showSendQueueTab();
        setQueueOpen(true);
    }

    if (!user?.email) return (
        <div className="space-y-3 pb-3">
            <h2 className="text-sm font-semibold text-gray-900">Send Emails</h2>
            <div className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-900">Sender Queue Summary</div>
                    <Tooltip title={`Open Sender Queue`}>
                        <LinkIcon className="w-3 h-3 cursor-pointer" onClick={handleOpenQueue} />
                    </Tooltip>
                </div>
            </div>
        </div>
    );

    let primaryLabel = "Send...";
    if (sending) primaryLabel = "Sending…";
    else if (queuedTotal === 0) primaryLabel = "Open Builder";

    const primaryDisabled = queuedTotal === 0 ? loading : (sending || loading);
    const canLoadMore = visibleCount < filtered.length;
    const queueTotal = summary?.total ?? 0;
    const percent = sendProg.planned > 0 ? Math.min(100, Math.round((sendProg.sent / sendProg.planned) * 100)) : 0;
    let ctaMsg = '';
    if (summary?.queued > CONSTANTS.DEFAULT_FREE_DAILY_SEND_CAP) ctaMsg = `Upgrade to send ${CONSTANTS.DEFAULT_PREMIUM_DAILY_SEND_CAP}+ emails / day`;
    else if (summary?.remaining === 0) ctaMsg = `Upgrade to send more emails!`;

    // if (isDev) console.log('items', items.slice(0, 10));

    // Main content height: allow space for sticky footer
    return (
        <div className="space-y-3 pb-3">
            <h2 className="text-sm font-semibold text-gray-900">Send Emails</h2>

            {/* Summary strip with a Refresh control */}
            <div className="rounded-xl border border-gray-200 p-3">
                {loading ? <div className="text-xs text-gray-500 flex items-center gap-2"><InlineSpinner /> Loading...</div> :
                    <>
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-medium text-gray-900">Sender Queue Summary</div>
                            <Tooltip title={`Open Sender Queue`}>
                                <LinkIcon className="w-3 h-3 cursor-pointer" onClick={handleOpenQueue} />
                            </Tooltip>
                        </div>
                        <div className="flex items-end justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge label={`Credits left today: ${summary?.remaining ?? "—"}`} />
                                <Badge label={`Left to send: ${summary?.queued ?? "—"}`} />
                                <Badge label={`Sent: ${summary?.sent ?? "—"}`} />
                                <Badge label={`Failed: ${summary?.failed ?? "—"}`} />
                                <Badge label={`Total jobs: ${summary?.total ?? "—"}`} />
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
                        <div className="text-xs font-medium text-gray-900">Queue Review</div>
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
                            <div className="px-3 pb-3 text-xs text-gray-600">No {filter === "all" ? "" : `${filter} `}jobs.</div>
                        ) : (
                            <div className="px-3 pb-3 space-y-1 max-h-[300px] overflow-y-scroll scrollbar-hide">
                                <ul className="divide-y divide-gray-100">
                                    {visibleItems.map((item, index) => {
                                        return (
                                            <li key={`${item.id}-item-${index}-${item.status}`} className="py-2 text-xs flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-[11px] text-gray-600 flex">
                                                        <b>Recipient: </b>
                                                    </div>
                                                    <div className="text-gray-900 truncate mb-1">{item.recipient}</div>

                                                    <div className="text-[11px] text-gray-600 flex">
                                                        <b>Subject: </b>
                                                    </div>
                                                    <div className="text-[11px] text-gray-600 truncate flex mb-1">
                                                        <span className="w-[100%] overflow-hidden whitespace-nowrap text-ellipsis truncate">
                                                            {item.subject || "(no subject)"}
                                                        </span>
                                                    </div>
                                                    {
                                                        item.emailBody && (
                                                            <>
                                                                <div className="text-[11px] text-gray-600 flex">
                                                                    <b>Email Body: </b>
                                                                </div>
                                                                <div className="text-[11px] text-gray-600 flex mb-1">
                                                                    {iQueueEmailBodyPreview === index ? (
                                                                        <div className="text-gray-600 whitespace-pre-line">
                                                                            {item.emailBody}
                                                                        </div>
                                                                    ) :
                                                                        <div className="text-gray-600" >
                                                                            {item.emailBody?.slice(0, 20)}{item.emailBody?.slice(20).length > 0 ? '...' : ''}
                                                                            <a className="underline underline-offset-2 ml-1 cursor-pointer" onClick={() => setIQueueEmailBodyPreview(index)}>
                                                                                Show all
                                                                            </a>
                                                                        </div>
                                                                    }
                                                                </div>
                                                            </>
                                                        )
                                                    }

                                                    {/* Attachment */}
                                                    <div className="text-[11px] text-gray-600 truncate mb-1">
                                                        {item.docUrl ? (
                                                            <>
                                                                <div className="flex">
                                                                    <b>Attachment: </b>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <a className="underline underline-offset-2" href={item.docUrl} target="_blank" rel="noopener noreferrer">
                                                                        Open doc
                                                                    </a>
                                                                    {item?.attachPdf && <PaperClipIcon className="w-3 h-3 inline-block" />}
                                                                </div>
                                                            </>
                                                        ) : null}
                                                    </div>

                                                    {/* Queue tab row */}
                                                    <div className="text-gray-600 text-[11px]" >Queue tab row:
                                                        <a className="underline underline-offset-2 ml-1 cursor-pointer" onClick={() => serverFunctions.highlightQueueRow(item.queueTabRow)}>{item.queueTabRow}</a>
                                                    </div>
                                                    {item.status === "failed" && item.lastError ? (
                                                        <div className="text-[11px] text-red-600 truncate mt-0.5">{item?.lastError?.includes('Error:') ? item.lastError : `Error: ${item.lastError}`}</div>
                                                    ) : null}
                                                </div>
                                                <StatusPill
                                                    status={item.status as any}
                                                    loading={pendingId === item.id}
                                                    onClick={(e) => onStatusPillClick(e, item)}
                                                />
                                            </li>
                                        )
                                    }
                                    )}
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

            {sendProg.active && (
                <div className="rounded-xl border border-gray-200 p-3 bg-white shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-900 flex items-center gap-1">
                            <InlineSpinner /> Sending emails
                        </div>
                        <div className="flex items-center gap-2">
                            {sendProg.timeBudgetHit ? (
                                <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                                    Time budget reached — continuing…
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <div className="mt-2 text-[11px] text-gray-600">
                        Sent this run: <b>{sendProg.sent}</b> / {sendProg.planned} &middot; Last batch: {sendProg.lastBatch}
                        {sendProg.failed > 0 && <> &middot; <span className="text-red-600">Failed: {sendProg.failed}</span></>}
                    </div>

                    {/* Progres bar  only shows since free send cap is less than batch size */}
                    {
                        isPremium && (
                            <div className="mt-2 h-2 w-full bg-gray-200 rounded">
                                <div
                                    className="h-2 rounded bg-indigo-500 transition-[width] duration-200"
                                    style={{ width: `${percent}%` }}
                                />
                            </div>)
                    }

                    <div className="mt-1 text-[10px] text-gray-500">{percent}% complete</div>
                    <div className="mt-2 text-[10px] text-red-400">
                        Don't close this window or sidebar while sending.
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                        {!pauseRequested ? (
                            <button
                                type="button"
                                onClick={requestPause}
                                className="rounded-md px-3 py-1.5 text-[11px] text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 cursor-pointer"
                            >
                                Stop after this batch
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled
                                className="rounded-md px-3 py-1.5 text-[11px] text-gray-500 ring-1 ring-gray-200 bg-gray-50 cursor-not-allowed"
                            >
                                Will stop after this batch…
                            </button>
                        )}
                    </div>
                </div>
            )}


            {
                !isPremium && ctaMsg && !sendData.loading && (
                    <CtaCard message={ctaMsg} user={user} />
                )
            }

            {!sendData.loading && (
                <>
                    {summary?.total >= CONSTANTS.TOTAL_JOBS_WARNING && summary?.total < CONSTANTS.TOTAL_JOBS_CRITICAL && (
                        <JobWarning
                            type="warning"
                            message={`You have over ${CONSTANTS.TOTAL_JOBS_WARNING} total LOIs jobs in the Sender Queue tab. Delete already sent LOIs to improve performance.`}
                            buttonText="Remove sent LOIs"
                            action={async () => {
                                setSendData(s => ({ ...s, loading: true }));
                                const res = await serverFunctions.queuePurgeSentAndCompact();
                                // console.log('res', res);
                                refreshSendData(true);
                                setSendData(s => ({ ...s, loading: false }));
                            }}
                        />
                    )}

                    {summary?.total >= CONSTANTS.TOTAL_JOBS_CRITICAL && (
                        <JobWarning
                            type="critical"
                            message={`You have over ${CONSTANTS.TOTAL_JOBS_CRITICAL} total LOIs jobs in the Sender Queue tab. Please clear the queue to continue sending.`}
                            buttonText="Clear queue"
                            action={async () => {
                                setSendData(s => ({ ...s, loading: true }));
                                const res = await serverFunctions.queueClearAll();
                                // console.log('res', res);
                                refreshSendData(true);
                                setSendData(s => ({ ...s, loading: false }));
                            }}
                        />
                    )}
                </>
            )}


            {/* Snackbar */}
            {snackbar.open && (
                <Snackbar open={snackbar.open} onClose={() => setSnackbar({ open: false, message: "", severity: "success" })}>
                    <Alert severity={snackbar.severity}><span className="text-xs">{snackbar.message}</span></Alert>
                </Snackbar>
            )}

            {/* Sticky Footer (primary action: Send next) */}
            <StickyFooter
                primaryLabel={primaryLabel}
                secondaryLabel="Send Test Email"
                onSecondary={queuedTotal > 0 ? openTestDialog : undefined}
                secondaryDisabled={loading || sending}
                onPrimary={!sending && queuedTotal > 0 ? openRealDialog : queuedTotal === 0 && !loading && (mode === "send" || currentStep === "send") ? handleGoToGenLOIs : undefined}
                primaryDisabled={primaryDisabled}
                primaryLoading={sending}
                leftSlot={null}
                helperText={loading ? null : queuedTotal === 0 ? <span className="text-amber-600">⚠ No queued jobs to send. Generate some LOIs first.</span> : undefined}
                currentStep="send"
                mode={mode}
                fixYPos={true}
                user={user}
            />

            {openMenu.open && openMenu.id && (
                <StatusDropdownGlobal
                    x={openMenu.x}
                    y={openMenu.y}
                    current={openMenu.current}
                    disabled={pendingId === openMenu.id}
                    onChoose={(next) => {
                        const it = sendData.items.find(i => i.id === openMenu.id);
                        if (it) updateItemStatus(it, next);
                    }}
                    onRequestClose={() => setOpenMenu(m => ({ ...m, open: false }))}
                />
            )}

            <ConfirmSendDialog
                open={dialog.open}
                variant={dialog.variant}
                onCancel={() => setDialog({ open: false, variant: "real" })}
                onConfirm={dialog.variant === "real" ?
                    ({ count, stopOnError } = { count: 1, stopOnError: false }) => confirmRealSend(count, stopOnError) :
                    ({ sampleCount } = { sampleCount: 1 }) => confirmTestSend(sampleCount)}
                summary={summary}
                defaultSampleCount={1}
                isSubmitting={sending}
                isPremium={isPremium}
                onUpgrade={onUpgradeClick}
                user={user}
            />

            {openClear && (
                <ConfirmClearQueueModal
                    summary={summary}
                    clearing={clearing}
                    onCancel={() => { setOpenClear(false); }}
                    onConfirm={(deleteDocs, removeSent) => handleClearQueue(deleteDocs, removeSent)}
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

function StatusPill({
    status,
    loading,
    onClick,
}: {
    status: QueueItem["status"] | "paused";
    loading?: boolean;
    onClick?: (e: React.MouseEvent) => void;
}) {
    const tone =
        status === "queued" ? "bg-gray-100 text-gray-700" :
            status === "paused" ? "bg-yellow-50 text-yellow-700" :
                status === "sent" ? "bg-emerald-50 text-emerald-700" :
                    status === "failed" ? "bg-red-50 text-red-700" :
                        "bg-gray-100 text-gray-700";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={loading}
            className={`shrink-0 rounded-md px-2 py-1 text-[11px] ${tone} hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-60 cursor-pointer`}
            title={loading ? "Updating…" : "Change status"}
        >
            {loading ? (
                <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin align-middle" />
            ) : (
                status
            )}
        </button>
    );
}

function StatusDropdownGlobal({
    x, y, current, disabled, onChoose, onRequestClose
}: {
    x: number;
    y: number;
    current: AllowedStatus;
    disabled?: boolean;
    onChoose: (next: AllowedStatus) => void;
    onRequestClose: () => void;
}) {
    const options: AllowedStatus[] = ["queued", "paused", "sent", "failed"];
    const body = (
        <>
            {/* backdrop to close on outside click */}
            <div className="fixed inset-0 z-[998]" onClick={onRequestClose} />
            <div
                className="fixed z-[999] w-40 rounded-md border border-gray-200 bg-white shadow-lg"
                style={{ left: x, top: y }}
                role="menu"
            >
                {options.map(opt => {
                    const active = opt === current;
                    return (
                        <button
                            key={opt}
                            type="button"
                            disabled={disabled || active}
                            onClick={() => { onChoose(opt); }}
                            className={`block w-full text-left px-3 py-1.5 text-[11px] ${active ? "bg-gray-100 text-gray-900 cursor-default"
                                : "text-gray-700 hover:bg-gray-50"
                                } disabled:opacity-50`}
                            role="menuitem"
                        >
                            {opt}{active ? " ✓" : ""}
                        </button>
                    );
                })}
            </div>
        </>
    );
    return createPortal(body, document.body);
}