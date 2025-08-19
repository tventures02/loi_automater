import React, { useCallback, useEffect, useRef, useState } from "react";
import { User } from "../../utils/types";
import { serverFunctions } from '../../utils/serverFunctions';
import InlineSpinner from "../../utils/components/InlineSpinner";
import { DocInfo } from "../../../server/docs";
import { backendCall } from "../../utils/server-calls";
import CONSTANTS from '../../utils/constants';
import { ArrowTopRightOnSquareIcon, TrashIcon, PencilSquareIcon, PlusIcon } from '@heroicons/react/24/outline';
import Tooltip from '@mui/material/Tooltip';

type Props = {
    user: User;
    selectedTemplate: string;
    handleError: (error: string) => void;
    setUser: (user: User) => void;
    setSelectedTemplate: (selectedTemplate: string) => void;
    templateContent: string;
    setTemplateContent: (templateContent: string) => void;
}
const TemplateStepScreen = ({
    user,
    selectedTemplate,
    handleError,
    setUser,
    setSelectedTemplate,
    templateContent,
    setTemplateContent }: Props) => {

    const [isGettingTemplates, setIsGettingTemplates] = useState(true);
    const [templates, setTemplates] = useState<DocInfo[]>([]);
    const [docTitle, setDocTitle] = useState('New LOI Template');
    const [isCreatingDoc, setIsCreatingDoc] = useState(false);
    const [isLoadingContent, setIsLoadingContent] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState<string>(templateContent || "");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hasUnsaved = isEditing && draft !== templateContent;

    const templateUrl =
        selectedTemplate ? `https://docs.google.com/document/d/${selectedTemplate}/edit` : null;

    useEffect(() => {
        const getTemplates = async () => {
            try {
            setIsGettingTemplates(true);
            const docInfos = await serverFunctions.getGoogleDocNamesByIds(user?.items?.loi?.docIds);
            console.log("docInfos", docInfos);

            const validDocs = docInfos.filter(doc => doc.name).map(doc => ({ id: doc.id, name: doc.name }));
            const invalidDocIds = docInfos.filter(doc => doc.error).map(doc => doc.id);

            console.log("validDocs", validDocs);
            console.log("invalidDocIds", invalidDocIds);

            setTemplates(validDocs); // Show valid docs immediately
            // If nothing selected yet, default to first
            if (!selectedTemplate && validDocs.length > 0) {
                setSelectedTemplate(validDocs[0].id);
            }

            // 3. If any are invalid, tell the backend to remove them
            if (invalidDocIds.length > 0) {
                console.log("Syncing: removing invalid IDs:", invalidDocIds);
                const dataToServer = {
                    email: user.email,
                    user,
                    invalidDocIds,
                    verType: 'idToken',
                    source: CONSTANTS.APP_SOURCE,
                    app: CONSTANTS.APP_CODE,
                }
                await backendCall(dataToServer, 'loiApi/syncDocTemplates', user.idToken);
            }
            } catch (err: any) {
                handleError(err?.message || 'Error loading templates.');
            } finally {
                setIsGettingTemplates(false);
            }
        }
        getTemplates();
    }, []);

    const handleCreateDoc = async () => {
        if (!docTitle.trim()) {
            handleError('Please enter a title for the document.');
            return;
        }
        setIsCreatingDoc(true);
        try {
            // The server function now returns an object { url, id }
            const docData = await serverFunctions.createGoogleDoc(docTitle);
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

    const fetchTemplateContent = useCallback(async (docId: string) => {
        if (!docId) {
            setTemplateContent('');
            setDraft('');
            return;
        }
        setIsLoadingContent(true);
        try {
            let text = await serverFunctions.getGoogleDocPlainText(docId);
            if (!text) {
                handleError('Error: Problem fetching template content. Please try again.');
                return;
            }
            text = text.trim().replace(/\n/, '');
            setTemplateContent(text || '');
            setDraft(text || '');
        } catch (err: any) {
            handleError(err?.message || 'Error fetching template content.');
            setTemplateContent('');
            setDraft('');
        } finally {
            setIsLoadingContent(false);
        }
    }, [handleError]);

    useEffect(() => {
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

    const handleTemplateSelection = (event) => {
        if (event.target.value === 'new') {
            handleCreateDoc();
            return;
        }
        setSelectedTemplate(event.target.value);
        // You can add logic here to act on the selection,
        // for example, load the template's content.
        console.log("Selected Template:", event.target.value);
    };

    const handleRefresh = () => {
        
        if (isEditing && hasUnsaved) {
            const ok = window.confirm("You have unsaved changes. Refresh anyway?");
            if (!ok) return;
        }
        if (selectedTemplate) fetchTemplateContent(selectedTemplate);
    };

    const templateExists = templates.length > 0;

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Select Template</h2>
            <p className="text-xs text-gray-600">
                {
                    templateExists ?
                        "Select the LOI Google Doc Template to use."
                        :
                        "Create a Google Doc LOI template first."
                }
            </p>

            {isGettingTemplates || isCreatingDoc ? (
                <div className="mt-4 animate-fadeIn flex items-center gap-2 justify-center text-sm text-gray-500">
                    <InlineSpinner />{isGettingTemplates ? "Loading templates..." : "Creating template..."}
                </div>
            ) : templateExists ? (
                <div className="mt-4 animate-fadeIn">
                    <select
                        id="docTemplateSelect"
                        value={selectedTemplate}
                        onChange={handleTemplateSelection}
                        className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                        {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                                {template.name}
                            </option>
                        ))}
                        <option value="new">-- Create New Template --</option>
                    </select>
                </div>
            ) : (
                <div
                    role="button"
                    tabIndex={0} // Makes it focusable
                    onClick={handleCreateDoc} // Your existing function
                    className={`w-full inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors cursor-pointer select-none ${isCreatingDoc ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <PlusIcon className="h-5 w-5 pointer-events-none" /> {/* Added pointer-events-none to icon */}
                    <span className="pointer-events-none">New Template</span> {/* Added pointer-events-none to text */}
                </div>
            )}


            {/* Template content preview / editor */}
            {selectedTemplate && !isCreatingDoc && (
                <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between">
                        <div className="text-[11px] font-medium text-gray-700 flex items-center gap-2">
                            Template contents
                            {hasUnsaved && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" title="Unsaved changes" />}
                        </div>
                        <div className="flex items-center gap-2">
                            {templateUrl && (
                                <a
                                    href={templateUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-gray-600 hover:text-gray-900 underline underline-offset-2"
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
                                        className="select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                                    >
                                        Refresh
                                    </div>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={handleEdit}
                                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleEdit()}
                                        className="select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
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
                                        className="select-none rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white hover:bg-gray-800"
                                    >
                                        Save
                                    </div>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={handleCancel}
                                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCancel()}
                                        className="select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

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
                  w-full h-48 resize-none p-3 text-xs leading-relaxed outline-none
                  ${isEditing ? 'bg-white text-gray-900' : 'bg-transparent text-gray-800'}
                `}
                                spellCheck={false}
                            />
                        )}
                    </div>
                    {isEditing && (
                        <div className="mt-1 text-[11px] text-gray-500">
                            Tip: Press <span className="font-medium">⌘/Ctrl + S</span> to save.
                        </div>
                    )}
                </div>
            )}

        </div>
    )
}
export default TemplateStepScreen;