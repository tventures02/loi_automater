import React from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { User } from "../../utils/types";


type Props = {
    user: User;
    selectedTemplate: string;
    handleTemplateSelection: (event: React.ChangeEvent<HTMLSelectElement>) => void;
    handleCreateDoc: () => void;
}
const TemplateStepScreen = ({
    user,
    selectedTemplate,
    handleTemplateSelection,
    handleCreateDoc }: Props) => {

    const templateExists = user?.items?.loi?.docIds?.length > 0;

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

            {templateExists ? (
                <div className="mt-4 animate-fadeIn">
                    <select
                        id="docTemplateSelect"
                        value={selectedTemplate}
                        onChange={handleTemplateSelection}
                        className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                        {user.items.loi.docIds.map((templateName) => (
                            <option key={templateName} value={templateName}>
                                {templateName}
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
                    className="w-full inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors cursor-pointer select-none"
                >
                    <PlusIcon className="h-5 w-5 pointer-events-none" /> {/* Added pointer-events-none to icon */}
                    <span className="pointer-events-none">New LOI Template</span> {/* Added pointer-events-none to text */}
                </div>
            )}

        </div>
    )
}
export default TemplateStepScreen;