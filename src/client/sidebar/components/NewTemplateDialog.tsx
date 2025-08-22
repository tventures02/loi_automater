import React from "react";


type Props = {
    isCreateDialogOpen: boolean;
    cancelCreate: () => void;
    confirmCreate: () => void;
    inputRef: React.RefObject<HTMLInputElement>;
    docTitle: string;
    setDocTitle: (docTitle: string) => void;
}

export const NewTemplateDialog = ({
    isCreateDialogOpen,
    cancelCreate,
    confirmCreate,
    inputRef,
    docTitle,
    setDocTitle
}: Props) => {

    if (!isCreateDialogOpen) return null;

    return isCreateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 !mb-0">
            <div className="absolute inset-0 bg-black/40" onClick={cancelCreate} />
            <div
                role="dialog"
                aria-modal="true"
                className="relative w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-lg"
            >
                <div className="p-4">
                    <div className="text-sm font-semibold text-gray-900">Create new template</div>
                    <div className="mt-1 text-xs text-gray-600">
                        Enter a name for your Google Doc template created in your Google Drive.
                    </div>

                    <input
                        ref={inputRef}
                        value={docTitle}
                        onChange={(e) => setDocTitle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmCreate();
                            if (e.key === 'Escape') cancelCreate();
                        }}
                        placeholder="e.g., LOI Template — Agents"
                        autoFocus
                        className="mt-3 w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
                    />

                    <div className="mt-3 flex items-center justify-end gap-2">
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={cancelCreate}
                            className="select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 cursor-pointer"
                        >
                            Cancel
                        </div>
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={confirmCreate}
                            className="select-none rounded-md bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-gray-800 cursor-pointer"
                        >
                            Create
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
