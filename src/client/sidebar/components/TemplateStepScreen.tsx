import React from "react";
import { Grid } from "@mui/material";
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

    return (
        <Grid item xs={12} className='w-full p-1 flex justify-center'>
            {user?.items?.loi?.docIds?.length > 0 ? (
                <div className="mt-4 animate-fadeIn">
                    <label htmlFor="docTemplateSelect" className="block text-sm font-medium text-gray-700 mb-1">
                        Select LOI Google Doc Template
                    </label>
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
                        <option value="new">New LOI Template</option>
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
        </Grid>
    )
}
export default TemplateStepScreen;