import React, { useEffect, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { User } from "../../utils/types";
import { serverFunctions } from '../../utils/serverFunctions';
import InlineSpinner from "../../utils/components/InlineSpinner";
import { DocInfo } from "../../../server/docs";
import { backendCall } from "../../utils/server-calls";
import CONSTANTS from '../../utils/constants';

type Props = {
    user: User;
    selectedTemplate: string;
    handleError: (error: string) => void;
    setUser: (user: User) => void;
    setSelectedTemplate: (selectedTemplate: string) => void;
}
const TemplateStepScreen = ({
    user,
    selectedTemplate,
    handleError,
    setUser,
    setSelectedTemplate }: Props) => {

    const [isGettingTemplates, setIsGettingTemplates] = useState(true);
    const [templates, setTemplates] = useState<DocInfo[]>([]);
    const [docTitle, setDocTitle] = useState('New LOI Template');
    const [isCreatingDoc, setIsCreatingDoc] = useState(false);

    useEffect(() => {
        const getTemplates = async () => {
            setIsGettingTemplates(true);
            const docInfos = await serverFunctions.getGoogleDocNamesByIds(user?.items?.loi?.docIds);
            console.log("docInfos", docInfos);

            const validDocs = docInfos.filter(doc => doc.name).map(doc => ({ id: doc.id, name: doc.name }));
            const invalidDocIds = docInfos.filter(doc => doc.error).map(doc => doc.id);

            console.log("validDocs", validDocs);
            console.log("invalidDocIds", invalidDocIds);

            setTemplates(validDocs); // Show valid docs immediately
            setIsGettingTemplates(false);

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

    const templateExists =  templates.length > 0;

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Select Google Doc Template</h2>
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

        </div>
    )
}
export default TemplateStepScreen;