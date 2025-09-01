// SettingsDialog.tsx
import React, { useState } from "react";
import CONSTANTS, { MAX_COL_NUMBER } from "../../utils/constants";
import { colLabel } from "../../utils/misc";
import useLocalStorage from 'use-local-storage';
import { Settings } from "../../utils/types";
import { INIT_SETTINGS } from "../../utils/initVals";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@mui/material";

type Props = {
    open: boolean;
    onClose: () => void;
    settings: Settings;
    setSettings: (settings: Settings) => void;
};
const COLUMN_OPTIONS = Array.from({ length: MAX_COL_NUMBER }, (_, i) => colLabel(i + 1)); // A..CV (100 cols)

export default function SettingsDialog({
    open,
    onClose,
    settings,
    setSettings,
}: Props) {
    const [lsSettings, setLSSettings] = useLocalStorage<Settings>(CONSTANTS.LS_KEYS.SETTINGS, INIT_SETTINGS);
    const [maxColCharNumber, setMaxColCharNumber] = useState(lsSettings.maxColCharNumber);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>, key: string) => {
        if (e?.target?.value === "") return;
        const maxColCharNumberSelected = parseInt(e.target.value);
        if (!isNaN(maxColCharNumberSelected)) {
            setLSSettings({ ...lsSettings, maxColCharNumber: maxColCharNumberSelected }); // set in local storage
            setMaxColCharNumber(maxColCharNumberSelected);
            if (key === 'maxColCharNumber') {
                setSettings({ ...settings, maxColCharNumber: maxColCharNumberSelected });
            }
        }
    }

    const resetSettings = () => {
        localStorage.clear()
        setLSSettings(INIT_SETTINGS);
        setSettings(INIT_SETTINGS);
        setMaxColCharNumber(INIT_SETTINGS.maxColCharNumber);
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-3" role="dialog" aria-modal="true">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
            {/* panel */}
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                <div className="p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Settings</h3>

                    <div className="grid grid-cols-[2fr_1fr] gap-2 text-xs">
                        <div className="text-gray-500 flex items-center gap-1">Last column for mapping
                            <Tooltip title="The last column letter that can be mapped from your source data sheet tab."> 
                            <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-gray-900" /></Tooltip></div>
                        <div>
                            <select
                                value={maxColCharNumber}
                                onChange={(e) => handleChange(e, 'maxColCharNumber')}
                                className={`
                        w-full rounded-md border px-2 py-1
                        ${maxColCharNumber ? "border-gray-200" : "border-amber-300"}
                        bg-white text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900
                      `}
                            >
                                {COLUMN_OPTIONS.map((col, idx) => {
                                    const label = col;
                                    return (
                                        <option key={col} value={idx + 1} title={col}>
                                            {label}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">

                        <div
                            role="button"
                            tabIndex={0}
                            onClick={resetSettings}
                            className="select-none cursor-pointer rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                        >
                            Reset settings
                        </div>
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={onClose}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClose()}
                            className="select-none cursor-pointer rounded-md ring-1 ring-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                        >
                            Cancel
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
