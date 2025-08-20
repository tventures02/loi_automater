// SendCenterSetup.tsx
import React from "react";
import InlineSpinner from "../../utils/components/InlineSpinner";

export default function SendCenterSetup({
    creating = false,
    error,
    onCreate,
}: {
    creating?: boolean;
    error?: string | null;
    onCreate: () => void;
}) {
    return (
        <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">Send Center setup</div>
                <p className="mt-1 text-xs text-gray-600">
                    Create a sheet tab (<span className="font-mono">LOI_Queue</span>) used to track and send LOIs. This won’t modify your original data.
                </p>

                {error ? (
                    <div className="mt-2 text-xs text-red-600">{error}</div>
                ) : null}

                <div
                    role="button"
                    tabIndex={0}
                    onClick={!creating ? onCreate : undefined}
                    className={`mt-3 inline-block select-none rounded-md px-3 py-2 text-xs font-medium text-white ${creating ? "bg-gray-300 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800 cursor-pointer"
                        }`}
                >
                    {creating ? (
                        <span className="inline-flex items-center gap-2">
                            <InlineSpinner /> Creating…
                        </span>
                    ) : (
                        "Create Send Center"
                    )}
                </div>

                {/* <div className="mt-2 text-[11px] text-gray-500">
                    Tip: this is created automatically the first time you generate LOIs.
                </div> */}
            </div>
        </div>
    );
}
