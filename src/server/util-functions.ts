/**
 * Converts a plain text string into a safe HTML string for an email body.
 *
 * This function makes the text safe for HTML by escaping special characters
 * and then converts newline characters into HTML line breaks (<br>).
 * It's designed to be robust and will return the original plain text if any
 * unexpected error occurs during the conversion.
 *
 * @param {string} plainText The plain text string to convert. Can be null or undefined.
 * @returns {string} The converted, safe HTML string, or the original plainText on error.
 */
export function convertPlainTextToHtml(plainText: string): string {
    // Return an empty string if the input is null, undefined, or not a string.
    if (!plainText || typeof plainText !== 'string') {
        return plainText || "";
    }

    try {
        // 1. First, escape essential HTML characters to ensure the text is displayed
        //    as content and doesn't break the email's HTML structure.
        const safeText = plainText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

        // 2. Then, convert all types of newline characters (for Windows and Unix)
        //    into HTML <br> tags for proper line breaks.
        const htmlText = safeText.replace(/\r?\n/g, '<br>');

        return htmlText;
    } catch (error) {
        // 3. If any error occurs, log it for debugging and return the original text
        //    as a sensible fallback to ensure an email can still be sent.
        Logger.log(`Failed to convert text to HTML. Error: ${error.message}`);
        return plainText;
    }
}