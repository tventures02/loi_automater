import React, { useState, useRef } from "react";
import { Grid } from '@mui/material';
import TierCard from './TierCard';
import CONSTANTS from '../../utils/constants';
import { useStripe, useElements } from '@stripe/react-stripe-js';
import StripeForm from './StripeForm';

const cardStyle = { backgroundColor: '#FAFAFA', width: "100%", boxShadow: '0 8px 20px 0 rgb(34 41 57 / 10%)' };
const tierCardStyle = { paddingLeft: "1em", paddingRight: "1em", margin: "auto", textAlign: "center" };
const linkStyle = { cursor: "pointer", color: "#1456FF", fontWeight: "bold" };
const yourCurrentPlan = "Your Current Plan";

// This component is only shown if the user has purchased SOMETHING when the userHasPaid flag is true
const ValuePropStatusAndUpgrade = (props: {
    paymentStatusMsg: string,
    userEmail: string,
    prices: any,
    user: any,
    showMobileLinkInGSheetFeatures: boolean,
    setErrorMsg: any,
    clientSecret: string,
    processPaymentRespAndSetStates: any,
    userHasPaid: boolean,
}) => {
    const stripe = useStripe();
    const elements = useElements();
    const {
        paymentStatusMsg,
        userEmail,
        prices,
        user,
        showMobileLinkInGSheetFeatures,
        setErrorMsg,
        clientSecret,
        processPaymentRespAndSetStates,
        userHasPaid,
    } = props;

    const [selectedTier, setSelectedTier] = useState(user.addOnPurchaseTier);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const lastDiv = useRef(null);


    const handlePurchaseSelect = (e: string) => {
        setSelectedTier(e);
        if (user.addOnPurchaseTier === 'tier0' && e === 'tier1' && lastDiv) {
            if (lastDiv.current) {
                lastDiv.current.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'start',
                });
            }
        }
    };

    const handleSubmit = async (event) => {
        try {
            event.preventDefault();
            setIsPurchasing(true);

            const result = await stripe.confirmPayment({
                //`Elements` instance that was used to create the Payment Element
                elements,
                redirect: 'if_required',
                confirmParams: {}
            });
            // console.log(result)
            await processPaymentRespAndSetStates(result, 'tier1');
            setIsPurchasing(false);
        } catch (error) {
            setIsPurchasing(false);
            setErrorMsg(error.message);
        }
    };

    // console.log(prices)
    const pricesDisplay = {
        tier0: null,
        tier1: user.addOnPurchaseTier === 'tier1' ? null : prices.tier0,
    };

    // console.log('ValuePropStatusAndUpgrade render')
    // console.log(user)

    if (paymentStatusMsg) {
        return (
            <div style={{ textAlign: "center", width: "100%" }}>
                {paymentStatusMsg}
                {staticMessage(userEmail)}
            </div>
        );
    }

    return (
        <Grid container direction="column" alignItems="center" >
            {staticMessage(userEmail)}
            <Grid container>
                {/* @ts-ignore */}
                <Grid item xs={5} style={tierCardStyle}>
                    {user.addOnPurchaseTier === 'tier0' ? <div>
                        <h2>{yourCurrentPlan}</h2>
                        <p>
                            One time purchase
                        </p>
                    </div> : <div style={{ minHeight: '66px' }}></div>}
                    <TierCard
                        email={userEmail}
                        cardStyle={cardStyle}
                        title={'Pro'}
                        handlePurchaseSelect={handlePurchaseSelect}
                        features={CONSTANTS.PRO_FEATURES}
                        price={pricesDisplay.tier0}
                        cardTier={'tier0'}
                        selectedTier={selectedTier}
                        showMobileLinkInGSheetFeatures={showMobileLinkInGSheetFeatures}
                    />
                </Grid>
                {/* @ts-ignore */}
                <Grid item xs={4} style={tierCardStyle}>
                    {user.addOnPurchaseTier === 'tier1' ?
                        <div>
                            <h2>{yourCurrentPlan}</h2>
                        </div>
                        : <h2>Upgrade To</h2>}
                    <TierCard
                        email={userEmail}
                        cardStyle={cardStyle}
                        title={'Elite'}
                        handlePurchaseSelect={handlePurchaseSelect}
                        features={CONSTANTS.ELITE_FEATURES}
                        price={pricesDisplay.tier1}
                        cardTier={'tier1'}
                        selectedTier={selectedTier}
                        showMobileLinkInGSheetFeatures={false}
                        userHasPaid={userHasPaid}
                    />
                </Grid>
                {
                    selectedTier === 'tier1' && user.addOnPurchaseTier === 'tier0' && clientSecret ?
                        <div style={{ margin: "auto", marginTop: "3em", textAlign: "center" }}>
                            <h2>Upgrade to Elite</h2>
                            <h3>{userEmail}</h3>
                            <StripeForm
                                isPurchasing={isPurchasing}
                                handleSubmit={handleSubmit}
                            />
                        </div>
                        :
                        null
                }
                <Grid item xs={12} ref={lastDiv} style={{ minHeight: '500px' }}>
                </Grid>
            </Grid>
        </Grid >
    )
}

const staticMessage = (userEmail: string) => {
    return (
        <>
            < br /><br />
            <p>Your add-on is ready to use. You must be logged into your Google account associated with</p>
            <p><b>{userEmail}</b></p>
            <p>to use the features.</p>
            <br /><br />
        </>
    )
}

export default ValuePropStatusAndUpgrade;