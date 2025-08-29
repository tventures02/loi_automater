import CONSTANTS from '../utils/constants';

export async function initiateTokenPurchase(
    token: string,
    verType: 'idToken' | 'accessToken',
    source: string = CONSTANTS.APP_SOURCE_CODE // Or appropriate client
): Promise<{ success: boolean; purchaseCode?: string; error?: string }> {
    const app = 'flashcardlab';
    try {
        const response = await fetch(`${process.env.REACT_APP_TV_BACKEND}tvapi/purchase-token/initiate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ verType, source, app }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data; // { success: true, purchaseCode: '...' }
    } catch (error) {
        console.error("Error initiating token purchase:", error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}