import { Tooltip } from "@mui/material";
import React, { forwardRef, useMemo } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";

type Progress = { current: number; total: number };

type Props = {
    /** Main action label & handler */
    primaryLabel: string;
    onPrimary?: () => void;

    /** Secondary action (e.g., Back) */
    secondaryLabel?: string;
    onSecondary?: () => void;

    /** States */
    primaryDisabled?: boolean;
    primaryLoading?: boolean;

    /** Optional left-side status/meta (chips, small text, etc.) */
    leftSlot?: React.ReactNode;

    /** Optional numeric progress to render a compact pill like "12 / 72" */
    progress?: Progress;

    /** Optional helper line above actions */
    helperText?: string | React.ReactNode;

    /** Current step */
    currentStep?: string;

    /** Mode */
    mode: "send" | "build";

    /** Whether to fix the Y position */
    fixYPos?: boolean;
};

function cx(...cls: (string | false | null | undefined)[]) {
    return cls.filter(Boolean).join(" ");
}

const StickyFooter = forwardRef<HTMLDivElement, Props>(function StickyFooter(
    {
        primaryLabel,
        onPrimary,
        secondaryLabel,
        onSecondary,
        primaryDisabled = false,
        primaryLoading = false,
        leftSlot,
        progress,
        helperText,
        currentStep,
        mode = "send",
        fixYPos = false,
    },
    ref
) {
    const progressText = useMemo(() => {
        if (!progress) return null;
        const { current, total } = progress;
        return `${Math.min(current, total)} / ${total}`;
    }, [progress]);

    const handleActivate = (cb?: () => void, disabled?: boolean) => (e: React.KeyboardEvent | React.MouseEvent) => {
        if (disabled) return;
        if ("key" in e) {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
        }
        cb?.();
    };

    let tooltipTitle = "";
    switch (currentStep) {
        case "template":
            tooltipTitle = "Please select a template and data source";
            break;
        case "map":
            tooltipTitle = "Please map placeholders and email";
            break;
        case "lois":
            tooltipTitle = "Please generate LOIs";
            break;
        default:
            tooltipTitle = "";
    }

    const isFinalStep = primaryLabel?.toLowerCase().includes("send...");

    return (
        <div
            ref={ref}
            className={`sticky ${mode === "build" && currentStep === "send" && fixYPos ? "bottom-[-9px]" : "bottom-[-.23em]"} z-40 border-t border-gray-200 bg-white backdrop-blur supports-[backdrop-filter]:bg-white`}
            aria-label="LOI Builder actions"
        >
            {/* Helper text (optional) */}
            {helperText ? (
                <div className="px-3 pt-2 text-[11px] leading-4 text-gray-600">{helperText}</div>
            ) : null}

            <div className="px-3 py-2 flex items-center justify-between gap-3">
                {/* Left-side: meta / status */}
                <div className="min-w-0 flex items-center gap-2">
                    {progressText ? (
                        <div className="shrink-0 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">
                            {progressText}
                        </div>
                    ) : null}
                    <div className="min-w-0 truncate text-xs text-gray-600">
                        {leftSlot}
                    </div>
                </div>

                {/* Actions (clickable divs) */}
                <div className="flex items-center gap-2">
                    {secondaryLabel && onSecondary ? (
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label={secondaryLabel}
                            className="cursor-pointer select-none rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                            onClick={handleActivate(onSecondary)}
                            onKeyDown={handleActivate(onSecondary)}
                        >
                            {secondaryLabel}
                        </div>
                    ) : null}

                    {
                        onPrimary && (
                            <Tooltip title={primaryDisabled ? tooltipTitle : ""} arrow>
                                <span className="inline-block">
                                    <div
                                        role="button"
                                        tabIndex={primaryDisabled ? -1 : 0}
                                        aria-label={primaryLabel}
                                        aria-disabled={primaryDisabled}
                                        className={cx(
                                            "!cursor-pointer group select-none rounded-md px-3 py-2 text-xs font-medium text-white focus:outline-none",
                                            `${isFinalStep ? `bg-green-600 hover:bg-green-700 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500` :
                                                `bg-gray-900 hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900`}`,
                                            primaryDisabled && "opacity-50 pointer-events-none"
                                        )}
                                        onClick={handleActivate(onPrimary, primaryDisabled)}
                                        onKeyDown={handleActivate(onPrimary, primaryDisabled)}
                                    >

                                        <div className="flex items-center gap-2">
                                            {primaryLoading ? (
                                                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
                                            ) : null}
                                            <span className={`truncate`}>{isFinalStep ? <PaperAirplaneIcon className="w-4 h-4 inline-block" /> : null} {primaryLabel}</span>
                                        </div>
                                    </div>
                                </span>
                            </Tooltip>
                        )
                    }
                </div>
            </div>
        </div>
    );
});

export default StickyFooter;
