import React from "react";

export default function AlertModal({
    open,
    title,
    message,
    onCancel,
}: {
    open: boolean;
    title: string;
    message: string;
    onCancel: () => void;
}) {
    if (!open) return null;

    // Turn "\n\n" into paragraphs; keep single "\n" as soft line breaks
    const paragraphs = React.useMemo(() => {
        return message
            .split(/\n{2,}/g)
            .map((para, i) => (
                <p key={i} className="mb-3">
                    {para.split(/\n/g).map((line, j) => (
                        <React.Fragment key={j}>
                            {line}
                            {j < para.split(/\n/g).length - 1 ? <br /> : null}
                        </React.Fragment>
                    ))}
                </p>
            ));
    }, [message]);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3"
            role="dialog"
            aria-modal="true"
        >
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
            {/* dialog */}
            <div className="relative w-full max-w-sm rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-4">
                <div className="text-sm font-semibold text-gray-900">{title}</div>

                {/* paragraphs with vertical separation */}
                <div className="mt-2 space-y-2 text-xs text-gray-600">
                    {paragraphs}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={onCancel}
                        className="select-none flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 cursor-pointer"
                    >
                        OK
                    </div>
                </div>
            </div>
        </div>
    );
}
