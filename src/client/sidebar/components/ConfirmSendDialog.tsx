// ConfirmSendDialog.tsx
import React, { useEffect, useRef, useState } from "react";
import CONSTANTS from "../../utils/constants";

type Variant = "real" | "test";

type Props = {
    open: boolean;
    variant: Variant;
    onCancel: () => void;
    onConfirm: (opts?: {
        sampleCount?: number;
        count?: number;
        attachPolicy?: "respect" | "forceOn" | "forceOff";
        stopOnError?: boolean;
    }) => void;

    // Context
    summary?: {
        remaining?: number;   // daily credits left (min of Gmail + plan)
        queued?: number;      // queued in Sender Queue
        toEmail?: string;     // user's email (for test mode)
    };

    defaultSampleCount?: number;
    isSubmitting?: boolean;

    isPremium: boolean;
    onUpgrade?: () => void;       // optional CTA action
};

export default function ConfirmSendDialog({
    open,
    variant,
    onCancel,
    onConfirm,
    summary,
    defaultSampleCount = 1,
    isSubmitting = false,
    isPremium,
    onUpgrade,
}: Props) {
    const { remaining = 0, queued, toEmail } = summary || {};
    const noCredits = (remaining ?? 0) <= 0;

    const [sampleCount, setSampleCount] = useState(defaultSampleCount);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [stopOnError, setStopOnError] = useState<boolean>(false);

    const maxReal = Math.max(0, Math.min(remaining ?? 0, queued ?? 0));
    const [count, setCount] = useState<number>(maxReal);
    const primaryRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        setAdvancedOpen(false);
        // Reset counts on open / changes
        setCount(Math.max(0, Math.min(remaining ?? 0, queued ?? 0)));

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter") {
                if (noCredits) return; // block sending when no credits
                onConfirm(variant === "test" ? { sampleCount } : { count, stopOnError });
            }
        };
        window.addEventListener("keydown", onKey);
        setTimeout(() => primaryRef.current?.focus(), 0);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onCancel, onConfirm, sampleCount, variant, queued, remaining, defaultSampleCount, noCredits]);

    if (!open) return null;

    // Titles & descriptions
    const titleBase = variant === "real" ? "Send emails now?" : "Send a test email?";
    const title = noCredits ? (isPremium ? "Gmail quota reached for today" : "Out of free sends today") : titleBase;

    const descWhenOk =
        variant === "real"
            ? `This will send ${count} email${count === 1 ? "" : "s"} now.`
            : `We'll send ${sampleCount} preview email${sampleCount === 1 ? "" : "s"} to you (${toEmail || "your email address"}) using the next queued LOIs. Test emails also use your daily credits.`;

    const descWhenNoCredits = isPremium
        ? "You've used all of your Gmail daily sending quota. It resets automatically tomorrow."
        : `You've used your ${CONSTANTS.DEFAULT_FREE_DAILY_SEND_CAP} free sends for today. Upgrade to keep sending right now.`;

    const description = noCredits ? descWhenNoCredits : descWhenOk;

    // Actions
    const handleUpgrade = () => {
        if (onUpgrade) onUpgrade();
    };

    const primaryDisabled =
        isSubmitting ||
        noCredits ||
        (variant === "real" ? count <= 0 : sampleCount <= 0);

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
                                <span className={`font-medium ${noCredits ? "text-red-600" : "text-gray-800"}`}>{remaining ?? "—"}</span>
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
                                        className="px-2 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                        disabled={noCredits}
                                        onClick={() => setSampleCount((v) => Math.max(1, v - 1))}
                                    >
                                        −
                                    </button>
                                    <div className="px-2 text-xs font-medium">{sampleCount}</div>
                                    <button
                                        type="button"
                                        className="px-2 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                        disabled={noCredits}
                                        onClick={() => setSampleCount((v) => Math.min(5, v + 1))}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 text-gray-500">
                                Test emails also use your daily credits and won’t change the Sender Queue status.
                            </div>
                            {noCredits && (
                                <div className="mt-2 rounded bg-red-50 text-red-700 p-2">
                                    You have 0 credits left today.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Advanced options (real sends only) */}
                    {variant === "real" && (
                        <div className="mt-2 flex justify-end flex-col">
                            <button
                                type="button"
                                onClick={() => setAdvancedOpen((v) => !v)}
                                className={`text-[11px] ${noCredits ? "text-gray-400 cursor-not-allowed" : "text-gray-600 hover:text-gray-900 hover:underline"} flex justify-end`}
                                disabled={noCredits}
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
                                                className="px-2 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                                disabled={noCredits}
                                                onClick={() => setCount((v) => Math.max(0, v - 1))}
                                            >
                                                −
                                            </button>
                                            <input
                                                type="number"
                                                min={0}
                                                max={maxReal}
                                                value={count}
                                                disabled={noCredits}
                                                onChange={(e) =>
                                                    setCount(Math.max(0, Math.min(Number(e.target.value || 0), maxReal)))
                                                }
                                                className="w-14 px-2 py-1 text-center text-xs bg-white outline-none disabled:bg-gray-100 disabled:text-gray-400"
                                            />
                                            <button
                                                type="button"
                                                className="px-2 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                                disabled={noCredits}
                                                onClick={() => setCount((v) => Math.min(maxReal, v + 1))}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <label className="flex items-center justify-between">
                                        <span className="text-gray-600">Stop on first error</span>
                                        <span
                                            role="switch"
                                            aria-checked={stopOnError}
                                            onClick={() => !noCredits && setStopOnError((v) => !v)}
                                            className={`ml-3 inline-flex h-5 w-9 items-center rounded-full ${stopOnError ? "bg-gray-900" : "bg-gray-300"
                                                } ${noCredits ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                                        >
                                            <span
                                                className={`ml-1 h-4 w-4 rounded-full bg-white transition ${stopOnError ? "translate-x-3.5" : ""
                                                    }`}
                                            />
                                        </span>
                                    </label>
                                </div>
                            )}
                        </div>
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

                        {/* Upgrade CTA when free user has 0 credits */}
                        {noCredits && !isPremium ? (
                            <div
                                role="button"
                                tabIndex={0}
                                ref={primaryRef}
                                onClick={handleUpgrade}
                                className="select-none rounded-md px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors focus:outline-none cursor-pointer"
                            >
                                Upgrade to continue
                            </div>
                        ) : (
                            <div
                                role="button"
                                tabIndex={0}
                                ref={primaryRef}
                                aria-disabled={primaryDisabled}
                                onClick={
                                    !primaryDisabled
                                        ? () => onConfirm(variant === "test" ? { sampleCount } : { count, stopOnError })
                                        : undefined
                                }
                                className={`select-none rounded-md px-3 py-2 text-xs font-medium text-white ${primaryDisabled
                                        ? "bg-gray-300 cursor-not-allowed"
                                        : "bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors focus:outline-none cursor-pointer"
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    {isSubmitting ? (
                                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    ) : null}
                                    <span>
                                        {isSubmitting
                                            ? "Sending…"
                                            : variant === "real"
                                                ? `Yes, send (${Math.max(0, count)})`
                                                : "Send test"}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
