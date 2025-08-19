// Define a type for the return object for better type safety
export type DocInfo = {
    id: string;
    name?: string; // Optional because it might not be found
    error?: string; // Optional for when an error occurs
};

/**
 * Gets the names of multiple Google Docs given an array of their file IDs.
 * This function handles errors individually for each ID.
 *
 * @param {string[]} docIds - An array of Google Document file IDs.
 * @returns {DocInfo[]} An array of objects, each containing the original ID
 *                      and either the document's name or an error message.
 */
export const getGoogleDocNamesByIds = (docIds: string[]): DocInfo[] => {
    // Validate that the input is a valid array
    if (!Array.isArray(docIds)) {
        // In a real-world scenario, throwing an error is often best here.
        console.error('Invalid input: docIds must be an array.');
        // However, returning a format consistent with an error might be better for the client
        return [{ id: 'INVALID_INPUT', error: 'Input was not an array.' }];
    }

    const results: DocInfo[] = docIds.map((id) => {
        // Skip any null, undefined, or empty string IDs
        if (!id) {
            return { id: id, error: 'Invalid ID provided (null or empty).' };
        }

        try {
            // Use DriveApp to get the file by its ID
            const file = DocumentApp.openById(id);

            // If successful, get the name and return the success object
            const docName = file.getName();
            return { id: id, name: docName };

        } catch (e) {
            // If getFileById fails (e.g., invalid ID, no permission), it throws an error.
            console.error(`Failed to access doc with ID: ${id}. Error: ${e.message}`);
            // Return an error object for this specific ID
            return { id: id, error: 'File not found or access denied.' };
        }
    });

    return results;
};