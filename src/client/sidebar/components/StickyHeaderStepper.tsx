import React, { forwardRef, useEffect, useMemo } from "react";

type StepStatus = "pending" | "current" | "complete" | "error";

export type Step = {
    key: string;
    label: string;
    status?: StepStatus; // optional; auto-derived from current if not provided
    disabled?: boolean;  // prevents navigation if true
};

type Props = {
    /** Ordered list of steps */
    steps?: Step[];
    /** Current step key */
    current: string;
    /** Called when user clicks/keys to another step */
    onStepChange?: (key: string) => void;
    /** Optional: gate navigation (e.g., don't allow skipping ahead) */
    canNavigateToStep?: (targetKey: string, currentKey: string) => boolean;
    /** Optional app title (top-left) */
    title?: string;
    /** Optional right-side slot (e.g., "Activity" button) */
    rightSlot?: React.ReactNode;
};

const DEFAULT_STEPS: Step[] = [
    { key: "template", label: "Template" },
    { key: "map", label: "Map" },
    { key: "pdfs", label: "PDFs" },
    { key: "send", label: "Send" },
];

function cx(...classes: (string | false | null | undefined)[]) {
    return classes.filter(Boolean).join(" ");
}

const StickyHeaderStepper = forwardRef<HTMLDivElement, Props>(function StickyHeaderStepper(
    {
        steps = DEFAULT_STEPS,
        current,
        onStepChange,
        canNavigateToStep = (target, curr) => {
            // default: allow navigating to current or any previous step
            const order = steps.map(s => s.key);
            return order.indexOf(target) <= order.indexOf(curr);
        },
        title = "LOI Builder",
        rightSlot,
    },
    ref
) {
    const order = useMemo(() => steps.map(s => s.key), [steps]);
    const currentIdx = Math.max(0, order.indexOf(current));
    const progressPct = (currentIdx / Math.max(1, steps.length - 1)) * 100;

    // Keyboard navigation: Left/Right arrows
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            const dir = e.key === "ArrowRight" ? 1 : -1;
            const nextIdx = Math.min(Math.max(0, currentIdx + dir), steps.length - 1);
            const nextKey = steps[nextIdx].key;
            if (nextKey !== current && canNavigateToStep(nextKey, current)) {
                e.preventDefault();
                onStepChange?.(nextKey);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [current, currentIdx, steps, onStepChange, canNavigateToStep]);

    return (
        <div
            ref={ref}
            className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60"
            role="navigation"
            aria-label="LOI Builder steps"
        >
            {/* Top row: title + optional actions */}
            <div className="flex items-center justify-between px-3 pt-2 pb-2">
                {rightSlot ? <div className="ml-3 shrink-0">{rightSlot}</div> : null}
            </div>

            {/* Stepper */}
            <div className="relative px-3 pb-3">
                <div
                    className="absolute left-3 top-6 h-[2px] bg-gray-900 transition-all duration-300"
                    style={{ width: `calc(${progressPct}% - 0.75rem)` }}
                    aria-hidden="true"
                />

                <ol className="relative z-10 flex items-center justify-between">
                    {steps.map((step, idx) => {
                        const derivedStatus: StepStatus =
                            step.status ??
                            (idx < currentIdx ? "complete" : idx === currentIdx ? "current" : "pending");

                        const isClickable = !step.disabled && canNavigateToStep(step.key, current);
                        const baseCircle =
                            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold";
                        const circle = cx(
                            derivedStatus === "complete" && "bg-gray-900 text-white",
                            derivedStatus === "current" && "ring-2 ring-gray-900 text-gray-900 bg-white",
                            derivedStatus === "pending" && "bg-gray-100 text-gray-500",
                            derivedStatus === "error" && "bg-red-100 text-red-700 ring-1 ring-red-600/30"
                        );
                        const label =
                            "mt-1 text-[11px] font-medium leading-4 text-gray-700 select-none";

                        return (
                            <li key={step.key} className="flex flex-col items-center text-center">
                                <button
                                    type="button"
                                    className={cx(
                                        baseCircle,
                                        circle,
                                        isClickable && "hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900",
                                        !isClickable && "cursor-default"
                                    )}
                                    aria-current={derivedStatus === "current" ? "step" : undefined}
                                    aria-disabled={!isClickable}
                                    onClick={() => {
                                        if (isClickable) onStepChange?.(step.key);
                                    }}
                                    title={step.label}
                                >
                                    {/* number or check */}
                                    {derivedStatus === "complete" ? (
                                        <span aria-hidden="true">✓</span>
                                    ) : (
                                        <span className="tabular-nums">{idx + 1}</span>
                                    )}
                                    <span className="sr-only">{step.label}</span>
                                </button>
                                <div className={label}>{step.label}</div>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
});

export default StickyHeaderStepper;
