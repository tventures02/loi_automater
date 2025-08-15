import React, { forwardRef, useMemo } from "react";

export type Step = { key: string; label: string };

type Props = {
    /** Ordered list of steps */
    steps?: Step[];
    /** Current step key */
    current: string;
    /** Called when user clicks a step */
    onStepChange?: (key: string) => void;
    /** Optional right-side slot (e.g., Help) */
    rightSlot?: React.ReactNode;
};

const DEFAULT_STEPS: Step[] = [
    { key: "template", label: "Template" },
    { key: "map", label: "Map" },
    { key: "pdfs", label: "PDFs" },
    { key: "send", label: "Send" },
];

function cx(...c: (string | false | null | undefined)[]) {
    return c.filter(Boolean).join(" ");
}

const StickyHeaderStepper = forwardRef<HTMLDivElement, Props>(function StickyHeaderStepper(
    { steps = DEFAULT_STEPS, current, onStepChange, rightSlot },
    ref
) {
    const order = useMemo(() => steps.map(s => s.key), [steps]);
    const currentIdx = Math.max(0, order.indexOf(current));

    return (
        <div
            ref={ref}
            className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60"
            role="navigation"
            aria-label="LOI Builder steps"
        >
            {/* Optional actions row */}
            <div className="w-full flex items-center justify-end px-3 pt-2 pb-2">
                {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
            </div>

            {/* Stepper */}
            <div className="px-3 pb-3">
                <ol className="flex items-center justify-between">
                    {steps.map((step, idx) => {
                        const isCurrent = idx === currentIdx;
                        const isComplete = idx < currentIdx;

                        const circleBase =
                            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors";
                        const circleStyle = cx(
                            isCurrent && "ring-2 ring-gray-900 text-gray-900 bg-white",
                            !isCurrent && !isComplete && "bg-gray-100 text-gray-500",
                            isComplete && "bg-gray-900 text-white",
                            "hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                        );

                        return (
                            <li key={step.key} className="flex flex-col items-center text-center">
                                <button
                                    type="button"
                                    className={cx(circleBase, circleStyle)}
                                    aria-current={isCurrent ? "step" : undefined}
                                    onClick={() => onStepChange?.(step.key)}
                                    title={step.label}
                                >
                                    {isComplete ? (
                                        <span aria-hidden="true">✓</span>
                                    ) : (
                                        <span className="tabular-nums">{idx + 1}</span>
                                    )}
                                    <span className="sr-only">{step.label}</span>
                                </button>
                                <div className="mt-1 text-[11px] font-medium leading-4 text-gray-700 select-none">
                                    {step.label}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
});

export default StickyHeaderStepper;
