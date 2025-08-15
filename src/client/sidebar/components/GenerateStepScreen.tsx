import React, { useEffect, useState } from "react";

export default function GenerateStepScreen() {
    const [ready, setReady] = useState(true);

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Create PDFs</h2>
            <p className="text-xs text-gray-600">Choose the folder and naming pattern, then generate.</p>

            <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="text-xs">
                    <div className="text-gray-500">Output folder</div>
                    <div className="mt-1 rounded-md border border-gray-200 px-2 py-1">/Drive/LOI Outputs/Today</div>
                </div>

                <div className="text-xs">
                    <div className="text-gray-500">File name pattern</div>
                    <div className="mt-1 rounded-md border border-gray-200 px-2 py-1">LOI - {`{{Address}}`} - {`{{AgentName}}`}</div>
                    <div className="mt-1 text-[11px] text-gray-500">Example: LOI - 123 Main St - Jane Lee</div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Eligible rows: 72</div>
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Invalid emails: 3 (skipped)</div>
                </div>

                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setReady(v => !v)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setReady(v => !v)}
                    className="inline-block select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                >
                    {ready ? "Simulate: make preflight fail" : "Simulate: make preflight pass"}
                </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                Preview thumbnails would show here.
            </div>
        </div>
    );
}
