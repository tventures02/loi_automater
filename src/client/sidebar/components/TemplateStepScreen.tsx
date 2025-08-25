import React, { useEffect, useRef, useState } from "react";
import { User } from "../../utils/types";
import { serverFunctions } from '../../utils/serverFunctions';
import InlineSpinner from "../../utils/components/InlineSpinner";
import { DocInfo } from "../../../server/docs";
import { backendCall } from "../../utils/server-calls";
import CONSTANTS from '../../utils/constants';
import { ArrowTopRightOnSquareIcon, PlusIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import Tooltip from '@mui/material/Tooltip';
import { NewTemplateDialog } from "./NewTemplateDialog";

type Props = {
    user: User;
    selectedTemplate: string;
    templates: DocInfo[];
    setTemplates: (templates: DocInfo[]) => void;
    handleError: (error: string) => void;
    setUser: (user: User) => void;
    setSelectedTemplate: (selectedTemplate: string) => void;
    templateContent: string;
    setTemplateContent: (templateContent: string) => void;
    isGettingTemplates: boolean;
    isLoadingContent: boolean;
    fetchTemplateContent: (docId: string) => void;
    draft: string;
    setDraft: (draft: string) => void;
}
const TemplateStepScreen = ({
    user,
    selectedTemplate,
    templates,
    setTemplates,
    handleError,
    setUser,
    setSelectedTemplate,
    templateContent,
    setTemplateContent,
    isGettingTemplates,
    isLoadingContent,
    fetchTemplateContent,
    draft,
    setDraft
}: Props) => {

    const [docTitle, setDocTitle] = useState('New LOI Template');
    const [isCreatingDoc, setIsCreatingDoc] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const selectRef = useRef<HTMLSelectElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hasUnsaved = isEditing && draft !== templateContent;

    const firstPassRef = useRef(true);

    const templateUrl = selectedTemplate ? `https://docs.google.com/document/d/${selectedTemplate}/edit` : null;

    const handleCreateDoc = async () => {
        if (!docTitle.trim()) {
            handleError('Please enter a title for the document.');
            return;
        }
        setIsCreatingDoc(true);
        try {
            const { templatesFolderId } = await serverFunctions.loiEnsureFolders();
            // The server function now returns an object { url, id }
            const docData = await serverFunctions.createGoogleDoc(docTitle, templatesFolderId);
            if (!docData.id) {
                handleError('Error: Problem creating Google Doc. Please try again.');
                return;
            }

            setUser({
                ...user,
                items: {
                    ...user.items,
                    loi: { ...user.items.loi, docIds: [...user.items.loi.docIds, docData.id] }
                }
            });
            setTemplates([...templates, { id: docData.id, name: docTitle }]);
            setSelectedTemplate(docData.id);

            const dataToServer = {
                email: user.email,
                user,
                docId: docData.id,
                verType: 'idToken',
                source: CONSTANTS.APP_SOURCE,
                app: CONSTANTS.APP_CODE,
            }
            const saveResp = await backendCall(dataToServer, 'loiApi/addDocTemplate', user.idToken);
            if (!saveResp.success) {
                // handleError('Error: Problem saving Google Doc. Please try again.');
                // return;
            }

        } catch (error) {
            handleError(error.message);
        } finally {
            setIsCreatingDoc(false);
        }
    };

    useEffect(() => {
        // Don't load content on first render as it's already loaded in Sidebar
        if (firstPassRef.current) {
            firstPassRef.current = false;
            return;
        }
        // Load content when selection changes; exit edit mode
        if (selectedTemplate) {
            setIsEditing(false);
            fetchTemplateContent(selectedTemplate);
        } else {
            setTemplateContent('');
            setDraft('');
        }
    }, [selectedTemplate]);

    // ---- EDIT HANDLERS ----
    const handleEdit = () => {
        setIsEditing(true);
        setDraft(templateContent || "");
        // focus after paint
        setTimeout(() => textareaRef.current?.focus(), 0);
    };

    const handleSave = () => {
        setTemplateContent(draft);  // commit to parent
        setIsEditing(false);
        // (Optional) persist back to Google Doc here in future
    };

    const handleCancel = () => {
        setDraft(templateContent || ""); // discard local edits
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            handleSave();
        }
    };

    const handleRefresh = () => {
        if (isEditing && hasUnsaved) {
            const ok = window.confirm("You have unsaved changes. Refresh anyway?");
            if (!ok) return;
        }
        if (selectedTemplate) fetchTemplateContent(selectedTemplate);
    };

    const openCreateDialog = () => {
        setDocTitle('New LOI Template'); // or ''
        setIsCreateDialogOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const confirmCreate = async () => {
        if (!docTitle.trim()) {
            handleError('Please enter a title for the document.');
            return;
        }
        setIsCreateDialogOpen(false);
        await handleCreateDoc(); // uses `docTitle`
    };

    const cancelCreate = () => {
        setIsCreateDialogOpen(false);
    };

    const templateExists = templates.length > 0;

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Select Template</h2>
            <p className="text-xs text-gray-600 mb-[3px]">
                {
                    templateExists ?
                        <span>Select the LOI Google Doc Template to use. 
                            <Tooltip title="Use the {{ }} placeholder format to insert data into the template.">
                                <QuestionMarkCircleIcon className="w-3 h-3 inline-block cursor-pointer text-gray-600" />
                            </Tooltip>
                        </span>
                        :
                        (
                            <div className="flex items-center gap-2">
                                <span>Create a Google Doc LOI template first.</span>
                                <div
                                    role="button"
                                    tabIndex={0} // Makes it focusable
                                    onClick={openCreateDialog} // Your existing function
                                    className={`flex items-center gap-1 !cursor-pointer group select-none rounded-md px-3 py-2 text-xs font-medium text-white focus:outline-none bg-gray-900 hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 ${isCreatingDoc ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <PlusIcon className="h-5 w-5 pointer-events-none" /> {/* Added pointer-events-none to icon */}
                                    <span className="pointer-events-none whitespace-nowrap">New Template</span> {/* Added pointer-events-none to text */}
                                </div>
                            </div>
                        )
                }
            </p>

            {isGettingTemplates || isCreatingDoc ? (
                <div className="mt-1 animate-fadeIn flex items-center gap-2 justify-center text-sm text-gray-500">
                    <InlineSpinner />{isGettingTemplates ? "Loading templates..." : "Creating template..."}
                </div>
            ) : templateExists && (
                <div className="mt-1 !mb-2 animate-fadeIn">
                    <select
                        ref={selectRef}
                        id="docTemplateSelect"
                        value={selectedTemplate}
                            onChange={(event) => {
                                if (event.target.value === 'new') {
                                    // keep the current selection in UI and open dialog
                                    if (selectRef.current) selectRef.current.value = selectedTemplate;
                                    openCreateDialog();
                                    return;
                                }
                                setSelectedTemplate(event.target.value);
                            }}
                            className={`w-full rounded-md border border-gray-200 bg-white text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 px-2 py-1 text-xs `}
                        >
                        {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                                {template.name}
                            </option>
                        ))}
                        <option value="new">-- Create New Template --</option>
                    </select>
                </div>
            )}


            {/* Template content preview / editor */}
            {selectedTemplate && !isCreatingDoc && templateExists && (
                <div className="mt-1 !mb-1">
                    <div className={`
            rounded-lg border ${isEditing ? 'border-gray-300' : 'border-gray-200'}
            ${isEditing ? 'bg-white' : 'bg-gray-50'}
            transition-colors
          `}>
                        {isLoadingContent ? (
                            <div className="flex items-center gap-2 p-3 text-xs text-gray-500">
                                <InlineSpinner /> Loading content…
                            </div>
                        ) : (
                            <textarea
                                ref={textareaRef}
                                readOnly={!isEditing}
                                value={isEditing ? draft : (templateContent || "(empty document)")}
                                onChange={isEditing ? (e) => setDraft(e.target.value) : undefined}
                                onKeyDown={isEditing ? handleKeyDown : undefined}
                                className={`
                  w-full h-32 resize-none p-3 text-xs leading-relaxed outline-none
                  ${isEditing ? 'bg-white text-gray-900' : 'bg-transparent text-gray-800'}
                `}
                                spellCheck={false}
                            />
                        )}
                    </div>
                    {isEditing && (
                        <div className="mt-1 text-[10px] text-gray-500">
                            Press <span className="font-medium">⌘/Ctrl + S</span> to save this text only.
                            {hasUnsaved && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 mr-[3px] ml-[3px]" title="Unsaved changes" />}
                        </div>
                    )}
                </div>
            )}

            <NewTemplateDialog
                isCreateDialogOpen={isCreateDialogOpen}
                cancelCreate={cancelCreate}
                confirmCreate={confirmCreate}
                inputRef={inputRef}
                docTitle={docTitle}
                setDocTitle={setDocTitle}
            />

            {/* Template controls */}
            {templateExists && (
                <div className="flex items-center justify-end gap-2">
                    {templateUrl && (
                        <a
                            href={templateUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] !text-gray-600 hover:!text-gray-900 underline underline-offset-2"
                        >
                            <Tooltip title="Open in Docs">
                                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </Tooltip>
                        </a>
                    )}

                    {!isEditing ? (
                        <>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={handleRefresh}
                                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleRefresh()}
                                className="select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 cursor-pointer"
                            >
                                Refresh
                            </div>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={handleEdit}
                                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleEdit()}
                                className="select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 cursor-pointer"
                            >
                                Edit
                            </div>
                        </>
                    ) : (
                        <>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={handleSave}
                                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSave()}
                                className="select-none rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white hover:bg-gray-800 cursor-pointer"
                            >
                                Save
                            </div>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={handleCancel}
                                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCancel()}
                                className="select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 cursor-pointer"
                            >
                                Cancel
                            </div>
                        </>
                    )}
                </div>
            )}



        </div>
    )
}
export default TemplateStepScreen;