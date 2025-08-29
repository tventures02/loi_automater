import React from "react";

const JobWarning = ({ type, message, buttonText, action }: { type: "warning" | "critical", message: string, buttonText: string, action: () => void }) => {
    const styles =
        type === "critical"
            ? {
                border: "border-red-200",
                bg: "bg-red-50",
                text: "text-red-800",
                btnRing: "ring-red-300",
                btnText: "text-red-700 hover:bg-red-50",
            }
            : {
                border: "border-amber-200",
                bg: "bg-amber-50",
                text: "text-amber-800",
                btnRing: "ring-red-300",
                btnText: "text-red-700 hover:bg-red-50",
            };

    return (
        <div className={`rounded-md border ${styles.border} ${styles.bg} p-2 text-[11px] ${styles.text} w-fit`}>
            <div className="font-medium flex items-center gap-1">{message}</div>
            <div className="flex items-center gap-1 justify-end mt-2">
                <div
                    role="button"
                    tabIndex={0}
                    className={`select-none !w-auto rounded-md px-2 py-1 text-[11px] ring-1 ${styles.btnRing} ${styles.btnText} cursor-pointer`}
                    onClick={action}
                >
                    {buttonText}
                </div>
            </div>
        </div>
    );
};

export default JobWarning;