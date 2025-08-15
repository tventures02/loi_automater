import React, { useEffect, useState } from "react";

export default function MappingStepScreen() {
    const [allMapped, setAllMapped] = useState<boolean>(true); // toggle to test disabling footer

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Map placeholders</h2>
            <p className="text-xs text-gray-600">
                Confirm each template placeholder maps to a column in this sheet.
            </p>

            <div className="rounded-xl border border-gray-200 p-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-gray-500">Placeholder</div>
                    <div className="text-gray-500">Mapped column</div>

                    <div className="font-medium text-gray-800">{`{{Address}}`}</div>
                    <div className="rounded-md border border-gray-200 px-2 py-1">Address</div>

                    <div className="font-medium text-gray-800">{`{{AgentName}}`}</div>
                    <div className="rounded-md border border-gray-200 px-2 py-1">Agent Name</div>

                    <div className="font-medium text-gray-800">{`{{Email}}`}</div>
                    <div className="rounded-md border border-gray-200 px-2 py-1">Email</div>

                    <div className="font-medium text-gray-800">{`{{Offer}}`}</div>
                    <div className="rounded-md border border-gray-200 px-2 py-1">Offer</div>
                </div>

                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setAllMapped(v => !v)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setAllMapped(v => !v)}
                    className="mt-3 inline-block select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                >
                    {allMapped ? "Simulate: mark mapping incomplete" : "Simulate: mark mapping complete"}
                </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                Preview: “Offer for 123 Main St” will use values from Row 2.
            </div>
        </div>
    );
}
