import React, { useEffect, useState } from "react";

export default function SendStepScreen() {
    const [hasSubject, setHasSubject] = useState(true);
    const [hasBody, setHasBody] = useState(true);

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Email your LOIs</h2>
            <p className="text-xs text-gray-600">We’ll attach each generated PDF to the corresponding email.</p>

            <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="text-xs">
                    <div className="text-gray-500">From</div>
                    <div className="mt-1 rounded-md border border-gray-200 px-2 py-1">you@company.com</div>
                </div>

                <div className="text-xs">
                    <div className="text-gray-500">Subject</div>
                    <div className="mt-1 rounded-md border border-gray-200 px-2 py-1">Offer for {`{{Address}}`}</div>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setHasSubject(v => !v)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setHasSubject(v => !v)}
                        className="mt-2 inline-block select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                    >
                        {hasSubject ? "Simulate: clear subject (disable Next)" : "Simulate: set subject (enable Next)"}
                    </div>
                </div>

                <div className="text-xs">
                    <div className="text-gray-500">Body</div>
                    <div className="mt-1 rounded-md border border-gray-200 p-2 leading-relaxed">
                        Hi {`{{AgentName}}`},<br />
                        I’m writing to submit an LOI for {`{{Address}}`} with an offer of {`{{Offer}}`}.
                    </div>
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setHasBody(v => !v)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setHasBody(v => !v)}
                        className="mt-2 inline-block select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                    >
                        {hasBody ? "Simulate: clear body (disable Next)" : "Simulate: set body (enable Next)"}
                    </div>
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">Recipients: 69</div>
                    <div className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">Daily cap: 100</div>
                </div>
            </div>
        </div>
    );
}
