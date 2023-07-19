import { Grid } from "@mui/material";
import ValuePropSales from "./ValuePropSales";
import React, { useState } from "react";
import { useStripe, useElements } from '@stripe/react-stripe-js';
import StripeForm from './StripeForm';

const SalesView = ({
    showMobileLinkInGSheetFeatures,
    isLoading,
    setIsLoading,
    prices,
    isTierLoading,
    tier,
    setIsTierLoading,
    setErrorMsg,
    handlePurchaseSelect,
    email,
    billingPeriod,
    processPaymentRespAndSetStates,
}) => {
    const stripe = useStripe();
    const elements = useElements();
    const [isPurchasing, setIsPurchasing] = useState(false);

    const handleSubmit = async (event) => {
        try {
            // We don't want to let default form submission happen here, which would refresh the page.
            event.preventDefault();
            setIsPurchasing(true);
    
            const result = await stripe.confirmPayment({
                //`Elements` instance that was used to create the Payment Element
                elements,
                redirect: 'if_required',
                confirmParams: {}
            });
            await processPaymentRespAndSetStates(result);
            setIsPurchasing(false);
        } catch (error) {
            setIsPurchasing(false);
            setErrorMsg(error.message);
        }
    };

    return (
        <div>
            {/* @ts-ignore */}
            <Grid className={"text-xl"} item xs={12} lg={10} style={{ textAlign: "center", margin: "auto" }}>
                {
                    prices && !isLoading ?
                        <ValuePropSales
                            prices={prices}
                            email={email}
                            tier={tier}
                            handlePurchaseSelect={handlePurchaseSelect}
                            isTierLoading={isTierLoading}
                            setIsTierLoading={setIsTierLoading}
                            billingPeriod={billingPeriod}
                            setIsLoading={setIsLoading}
                            showMobileLinkInGSheetFeatures={showMobileLinkInGSheetFeatures}
                        />
                        :
                        null
                }

                <StripeForm
                    isPurchasing={isPurchasing}
                    handleSubmit={handleSubmit}
                />
            </Grid>
        </div>
    )
}
export default SalesView;
