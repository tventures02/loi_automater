import React, { useEffect, useRef, useState } from "react";
import { User } from "../../utils/types";
import { serverFunctions } from '../../utils/serverFunctions';
import InlineSpinner from "../../utils/components/InlineSpinner";
import { DocInfo } from "../../../server/docs";
import { backendCall } from "../../utils/server-calls";
import CONSTANTS from '../../utils/constants';
import { PlusIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import Tooltip from '@mui/material/Tooltip';
import { NewTemplateDialog } from "./NewTemplateDialog";
import { sendToAmplitude } from "../../utils/amplitude";

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
}: Props) => {

    const [docTitle, setDocTitle] = useState('New LOI Template');
    const [isCreatingDoc, setIsCreatingDoc] = useState(false);

    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const selectRef = useRef<HTMLSelectElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
                source: CONSTANTS.APP_SOURCE_CODE,
                app: CONSTANTS.APP_CODE,
            }
            const saveResp = await backendCall(dataToServer, 'loiApi/addDocTemplate', user.idToken);
            if (!saveResp.success) {
                // handleError('Error: Problem saving Google Doc. Please try again.');
                // return;
            }

        } catch (error) {
            handleError(error.message);
            try {
                sendToAmplitude(CONSTANTS.AMPLITUDE.ERROR, { error: error?.message || JSON.stringify(error), where: 'templateStepScreen (handleCreateDoc)' }, { email: user.email });
            } catch (error) {}
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
            fetchTemplateContent(selectedTemplate);
        } else {
            setTemplateContent('');
        }
    }, [selectedTemplate]);

    // ---- EDIT HANDLERS ----
    const handleRefresh = () => {
        if (selectedTemplate) fetchTemplateContent(selectedTemplate);
    };

    const openCreateDialog = () => {
        if (isCreatingDoc) return;
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
        try {
            sendToAmplitude(CONSTANTS.AMPLITUDE.CREATED_TEMPLATE, { docTitle }, { email: user.email });
        } catch (error) {}
    };

    const cancelCreate = () => {
        setIsCreateDialogOpen(false);
    };

    const templateExists = templates.length > 0;

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Select Template</h2>
            <div className="text-xs text-gray-600 mb-[3px] flex items-center gap-1">
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
                                    className={`flex items-center gap-1 !cursor-pointer group select-none rounded-md px-3 py-2 text-xs font-medium text-white focus:outline-none 
                                        bg-gray-900 hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 ${isCreatingDoc ? 'opacity-50 !cursor-not-allowed' : ''}`}
                                >
                                    <PlusIcon className="h-5 w-5 pointer-events-none" /> {/* Added pointer-events-none to icon */}
                                    <span className="pointer-events-none whitespace-nowrap">New Template</span> {/* Added pointer-events-none to text */}
                                </div>
                            </div>
                        )
                }
            </div>

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
                                try {
                                    sendToAmplitude(CONSTANTS.AMPLITUDE.SELECTED_TEMPLATE, { docTitle: templates.find(template => template.id === event.target.value)?.name }, { email: user.email });
                                } catch (error) {}
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
            rounded-lg border border-gray-200 bg-gray-50}
            transition-colors
          `}>
                        {isLoadingContent ? (
                            <div className="flex items-center gap-2 p-3 text-xs text-gray-500">
                                <InlineSpinner /> Loading content…
                            </div>
                        ) : (
                            <textarea
                                ref={textareaRef}
                                readOnly={true}
                                value={templateContent || "(empty document)"}
                                onChange={undefined}
                                onKeyDown={undefined}
                                className={`w-full h-32 resize-none p-3 text-xs leading-relaxed outline-none bg-transparent text-gray-800`}
                                spellCheck={false}
                            />
                        )}
                    </div>
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
                        onClick={() => { if (templateUrl) window.open(templateUrl, '_blank') }}
                        className="select-none rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                        Edit
                    </div>
                </div>
            )}
        </div>
    )
}
export default TemplateStepScreen;