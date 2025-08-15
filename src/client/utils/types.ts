export interface User {
    email: string;
    stripe_payment_methods: Array<string>;
    addOnPurchaseTier: string;
    subscriptionId: string;
    subscriptionStatusActive: boolean;
    userHasPaid?: boolean;
    idToken?: string;
    _id: string;
    items: {
        loi: {
            docIds: string[];
        }
    }
}
