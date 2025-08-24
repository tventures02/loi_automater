// ConfirmSendDialog.tsx
import React, { useEffect, useRef, useState } from "react";

type Variant = "real" | "test";

type Props = {
    open: boolean;
    variant: Variant;
    onCancel: () => void;
    onConfirm: (opts?: { sampleCount?: number, count?: number, attachPolicy?: "respect" | "forceOn" | "forceOff", stopOnError?: boolean }) => void;

    // Context
    remaining?: number;     // MailApp daily quota remaining
    queued?: number;        // queued in Sender Queue
    toEmail?: string;       // user's email (for test mode)
    defaultSampleCount?: number; // test mode: how many previews to send
    isSubmitting?: boolean;
};

export default function ConfirmSendDialog({
    open,
    variant,
    onCancel,
    onConfirm,
    remaining,
    queued,
    toEmail,
    defaultSampleCount = 1,
    isSubmitting = false,
}: Props) {
    const [sampleCount, setSampleCount] = useState(defaultSampleCount);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [attachPolicy, setAttachPolicy] = useState<"respect" | "forceOn" | "forceOff">("respect");
    const [stopOnError, setStopOnError] = useState<boolean>(false);
    const maxReal = Math.max(0, Math.min(remaining ?? 0, queued ?? 0));
    const [count, setCount] = useState<number>(maxReal);
    const primaryRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        setAdvancedOpen(false);
        setAttachPolicy("respect");
        setCount(Math.max(0, Math.min(remaining ?? 0, queued ?? 0)));
        // setSampleCount(defaultSampleCount);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter") onConfirm(variant === "test" ? { sampleCount } : { count, attachPolicy, stopOnError });
        };
        window.addEventListener("keydown", onKey);
        setTimeout(() => primaryRef.current?.focus(), 0);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onCancel, onConfirm, sampleCount, variant, queued, remaining, defaultSampleCount]);

    if (!open) return null;

    const title = variant === "real" ? "Send emails now?" : "Send a test email?";
    const description =
        variant === "real"
            ? `This will send ${count} emails now.`
            : `We'll send ${sampleCount > 1 ? "" : "a"} preview email${sampleCount > 1 ? "s" : ""} to you (${toEmail || "your email address"}) using the next queued LOIs.`;


            console.log('sampleCount', sampleCount);
    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-3" role="dialog" aria-modal="true">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />
            {/* panel */}
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                <div className="p-4">
                    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                    <p className="mt-1 text-xs leading-5 text-gray-600">{description}</p>

                    {variant === "real" ? (
                        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-700 space-y-1">
                            <div>
                                <span className="text-gray-500">Remaining credits today: </span>
                                <span className="font-medium text-gray-800">{remaining ?? "—"}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Waiting to be sent: </span>
                                <span className="font-medium text-gray-800">{queued ?? "—"}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-700">
                            <div className="flex items-center justify-between">
                                <div className="text-gray-600">Number of test emails</div>
                                <div className="inline-flex items-center rounded-md ring-1 ring-gray-200">
                                    <button
                                        type="button"
                                        className="px-2 text-xs text-gray-700 hover:bg-gray-100"
                                        onClick={() => setSampleCount((v) => Math.max(1, v - 1))}
                                    >
                                        −
                                    </button>
                                    <div className="px-2 text-xs font-medium">{sampleCount}</div>
                                    <button
                                        type="button"
                                        className="px-2 text-xs text-gray-700 hover:bg-gray-100"
                                        onClick={() => setSampleCount((v) => Math.min(5, v + 1))}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 text-gray-500">
                                This won't change the queue status; test emails are sent to you to verify everything is correct.
                            </div>
                        </div>
                    )}

                    {variant === "real" && (

                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={() => setAdvancedOpen((v) => !v)}
                                className="text-[11px] text-gray-600 hover:text-gray-900 hover:underline cursor-pointer"
                            >
                                {advancedOpen ? "Hide advanced options" : "Show advanced options"}
                            </button>

                            {advancedOpen && (
                                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-700 space-y-2">

                                    <div className="flex items-center justify-between">
                                        <div className="text-gray-600">Set number of emails to send</div>
                                        <div className="inline-flex items-center rounded-md ring-1 ring-gray-200">
                                            <button
                                                type="button"
                                                className="px-2 text-xs text-gray-700 hover:bg-gray-100"
                                                onClick={() => setCount((v) => Math.max(0, v - 1))}
                                            >
                                                −
                                            </button>
                                            <input
                                                type="number"
                                                min={0}
                                                max={maxReal}
                                                value={count}
                                                onChange={(e) => setCount(Math.max(0, Math.min(Number(e.target.value || 0), maxReal)))}
                                                className="w-14 px-2 py-1 text-center text-xs bg-white outline-none"
                                            />
                                            <button
                                                type="button"
                                                className="px-2 text-xs text-gray-700 hover:bg-gray-100"
                                                onClick={() => setCount((v) => Math.min(maxReal, v + 1))}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-600">Attach PDF</span>
                                        <select
                                            value={attachPolicy}
                                            onChange={(e) => setAttachPolicy(e.target.value as any)}
                                            className="ml-3 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800"
                                        >
                                            <option value="respect">Respect per-row setting</option>
                                            <option value="forceOn">Force attach</option>
                                            <option value="forceOff">Don’t attach</option>
                                        </select>
                                    </div>

                                    <label className="flex items-center justify-between">
                                        <span className="text-gray-600">Stop on first error</span>
                                        <span
                                            role="switch"
                                            aria-checked={stopOnError}
                                            onClick={() => setStopOnError((v) => !v)}
                                            className={`ml-3 inline-flex h-5 w-9 items-center rounded-full ${stopOnError ? "bg-gray-900" : "bg-gray-300"} cursor-pointer`}
                                        >
                                            <span className={`ml-1 h-4 w-4 rounded-full bg-white transition ${stopOnError ? "translate-x-4" : ""}`} />
                                        </span>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

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
                            ref={primaryRef}
                            aria-disabled={isSubmitting}
                            onClick={!isSubmitting ? () => onConfirm(variant === "test" ? { sampleCount } : { count, attachPolicy, stopOnError }) : undefined}
                            className={`select-none rounded-md px-3 py-2 text-xs font-medium text-white ${isSubmitting ? "bg-gray-300 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800 cursor-pointer"
                                } focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900`}
                        >
                            <div className="flex items-center gap-2">
                                {isSubmitting ? (
                                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                ) : null}
                                <span>{isSubmitting ? "Sending…" : variant === "real" ? `Yes, send (${count})` : "Send test"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
