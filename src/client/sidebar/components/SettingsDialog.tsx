// SettingsDialog.tsx
import React, { useState } from "react";
import CONSTANTS, { MAX_COL_NUMBER } from "../../utils/constants";
import { colLabel } from "../../utils/misc";
import useLocalStorage from 'use-local-storage';
import { Settings, User } from "../../utils/types";
import { INIT_SETTINGS } from "../../utils/initVals";
import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@mui/material";
const isDev = process.env.REACT_APP_NODE_ENV.includes('dev') || process.env.REACT_APP_TV_BACKEND.includes('localhost');
type Props = {
    open: boolean;
    onClose: () => void;
    settings: Settings;
    setSettings: (settings: Settings) => void;
    config: any;
    user: User;
};
const COLUMN_OPTIONS = Array.from({ length: MAX_COL_NUMBER }, (_, i) => colLabel(i + 1)); // A..CV (100 cols)

export default function SettingsDialog({
    open,
    onClose,
    settings,
    setSettings,
    config,
    user,
}: Props) {
    const [lsSettings, setLSSettings] = useLocalStorage<Settings>(CONSTANTS.LS_KEYS.SETTINGS, INIT_SETTINGS);
    const [maxColCharNumber, setMaxColCharNumber] = useState(lsSettings.maxColCharNumber);
    const [postSendAction, setPostSendAction] = useState(lsSettings.postSendAction);

    if (isDev) {
        console.log('config', config);
    }
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>, key: string) => {
        const val = e.target.value;
        if (key === 'maxColCharNumber') {
            const n = parseInt(val, 10);
            if (!Number.isNaN(n)) {
                const next = { ...lsSettings, maxColCharNumber: n };
                setLSSettings(next);
                setMaxColCharNumber(n);
                setSettings({ ...settings, maxColCharNumber: n });
            }
        } else if (key === 'postSendAction') {
            const next = { ...lsSettings, postSendAction: val as 'keep' | 'trash' | 'delete' };
            setLSSettings(next);
            setPostSendAction(next.postSendAction);
            setSettings({ ...settings, postSendAction: next.postSendAction });
        }
    };

    const resetSettings = () => {
        localStorage.clear()
        setLSSettings(INIT_SETTINGS);
        setSettings(INIT_SETTINGS);
        setMaxColCharNumber(INIT_SETTINGS.maxColCharNumber);
    }

    if (!open) return null;
    const isPremium = user?.subscriptionStatusActive;
    const subManagementLink = config?.purchasePg?.subManagementLink;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-3" role="dialog" aria-modal="true">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
            {/* panel */}
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                <div className="p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Settings</h3>

                    <div className="grid grid-cols-[2fr_1fr] gap-2 text-xs mb-2">
                        <div className="text-gray-500 flex items-center gap-1">
                            After sending LOIs
                            <Tooltip title="Choose what happens to each generated Google Doc after its email is sent.">
                                <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-gray-900" />
                            </Tooltip>
                        </div>
                        <div>
                            <select
                                value={postSendAction}
                                onChange={(e) => handleChange(e, 'postSendAction')}
                                className="w-full rounded-md border border-gray-200 px-2 py-1 bg-white text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                            >
                                <option value="keep">Keep files</option>
                                <option value="trash">Move files to trash (recoverable)</option>
                                <option value="delete">Permanently delete</option>
                            </select>
                        </div>
                    </div>

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

                        {isPremium && (
                            <div className="text-gray-500 flex items-center gap-1">
                                <a href={subManagementLink} className="text-indigo-500 hover:text-indigo-600 hover:underline cursor-pointer" target="_blank" rel="noopener noreferrer">Manage subscription</a>
                            </div>
                        )}
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
