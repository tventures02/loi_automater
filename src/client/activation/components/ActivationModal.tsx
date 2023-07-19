import React, { useEffect, useState, useRef } from 'react';
// import { sendToAmplitude, amplitudeDataHandler } from "../../utils/amplitude";
import { Grid } from "@mui/material";
import { serverFunctions } from '../../utils/serverFunctions';
import CONSTANTS from '../../utils/constants';
import SalesView from './SalesView';
import { backendCall } from '../../utils/server-calls';
import { serverFunctionErrorHandler } from '../../utils/misc';
import { Elements } from '@stripe/react-stripe-js';
import LoadingAnimation from '../../utils/LoadingAnimation';
import { loadStripe } from '@stripe/stripe-js';
import ValuePropStatusAndUpgrade from './ValuePropStatusAndUpgrade';
import { generateDataToServer, checkHasUserPaid } from '../../utils/misc';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_API_KEY);
let options = {
    // passing the client secret obtained from the server
    clientSecret: null,
};

const ActivationModal = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [paymentStatusMsg, setPaymentStatusMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [prices, setPrices] = useState({
        tier0: null,
        tier1: null,
        subOneTimeCharge: null,
    });
    const [isTierLoading, setIsTierLoading] = useState(false);
    const [tier, setTier] = useState('tier1');
    const [userEmail, setUserEmail] = useState('');
    const [message, setMessage] = useState('');
    const [userHasPaid, setUserHasPaid] = useState(false);
    const [clientSecret, setClientSecret] = useState(null);
    const [stripeSubId, setSubId] = useState(null);
    const [billingPeriod, setBillingPeriod] = useState('monthly');
    const [showMobileLinkInGSheetFeatures, setShowMobileLinkInGSheetFeatures] = useState(false);
    const [user, setUser] = useState({
        email: '',
        addOnPurchaseTier: 'tier0',
    });

    const lastDiv = useRef(null);
    const firstPass = useRef(true);

    useEffect(() => {
        const getData = async () => {
            try {
                const email = await serverFunctions.getUserEmail();
                if (!email) {
                    throw Error('No user email found. Please log into the browser with your Google account.');
                }
                setUserEmail(email);
                const resp = await getPaidStatus(email);
                console.log('haskdjfa')
                console.log(resp)
                if (resp.success) {
                    // // Send to Amplitude
                    // try {
                    //     amplitudeDataHandler(email, {
                    //         'eventName': CONSTANTS.AMPLITUDE.VIEWED_PRICING_MODAL,
                    //     }, resp.userHasPaid);
                    // }
                    // catch (e) {
                    //     // do nothing for now
                    // }

                    setUser(resp.user);
                    setPrices(resp.prices);
                    console.log('checking has user paid')
                    const userHasPaid = checkHasUserPaid(resp.user.stripe_payment_methods);
                    console.log('done')
                    console.log(userHasPaid)
                    if (userHasPaid) {
                        setUserHasPaid(true);
                        await getNewPaymentIntent(email, 'tier0');
                    }
                    else {
                        await getNewPaymentIntent(email, tier);
                        setMessage("You're using a free version. See below for pricing.");
                    }
                    setIsLoading(false);
                }
                else {
                    setIsLoading(false);
                    throw Error(`Could not retreive user status from the server. ${resp.message}`)
                }
            } catch (e) {
                // sendToAmplitude(
                //     CONSTANTS.AMPLITUDE.ERROR,
                //     { errorMessage: `Activation modal mount: ${e.message}` },
                //     userEmail, userHasPaid
                // );
                setErrorMsg(e.message);
                setIsLoading(false);
            }
        }
        getData();
    }, []);

    const getNewPaymentIntent = async (email: string = null, tier: string) => {
        // console.log(tier)
        const paymentIntentResp = await initPurchaseIntent(email, tier);
        if (!paymentIntentResp) {
            // sendToAmplitude(
            //     CONSTANTS.AMPLITUDE.ERROR,
            //     { errorMessage: `getNewPaymentIntent stripe error` },
            //     email ? email : userEmail, userHasPaid
            // );
            throw Error('Could not get payment intent from Stripe.');
        }
        // console.log('payment intent resp')
        // console.log(paymentIntentResp)
        console.log('payment intent resp')
console.log(paymentIntentResp)
        if (paymentIntentResp.success) {
            const clientSecretTemp = paymentIntentResp.clientSecret ? paymentIntentResp.clientSecret : paymentIntentResp.client_secret;
            if (!clientSecretTemp) {
                // sendToAmplitude(
                //     CONSTANTS.AMPLITUDE.ERROR,
                //     { errorMessage: `getNewPaymentIntent: No client secret` },
                //     email ? email : userEmail, userHasPaid
                //     );
            }
            options = {
                clientSecret: clientSecretTemp,
            };
            setClientSecret(clientSecretTemp);
            setSubId(paymentIntentResp.subscriptionId ? paymentIntentResp.subscriptionId : null);
            if (paymentIntentResp.prices) setPrices(paymentIntentResp.prices);
            setIsTierLoading(false);
        }
        else {
            // sendToAmplitude(
            //     CONSTANTS.AMPLITUDE.ERROR,
            //     { errorMessage: `getNewPaymentIntent tv server error: ${paymentIntentResp.message}` },
            //     email ? email : userEmail, userHasPaid
            // );
            throw Error('Could not get payment intent from Stripe.');
        }
        return paymentIntentResp;
    };

    useEffect(() => {
        // Don't run on component did mount
        if (firstPass.current) {
            firstPass.current = false;
            return;
        }
        // console.log('updatePaymentIntent')
        // console.log(tier)
        const updatePaymentIntent = async () => {
            try {
                setIsTierLoading(true);
                const paymentIntentResp = await getNewPaymentIntent(userEmail, tier);
                if (paymentIntentResp.success && lastDiv) {
                    if (lastDiv.current) {
                        lastDiv.current.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                            inline: 'start',
                        });
                    }
                }
            } catch (error) {
                setErrorMsg(error.message);
                setIsTierLoading(false);
                setIsLoading(false);
            }
        }
        updatePaymentIntent();
    }, [tier]);


    const getPaidStatus = async (email_in) => {
        const email = email_in ? email_in : userEmail;
        const preventAddingUserToDb = false;
        const subStatusResp = await backendCall(
            generateDataToServer(
                email,
                user.addOnPurchaseTier,
                CONSTANTS.APP_CODE,
                CONSTANTS.APP_VARIANT,
                preventAddingUserToDb),
            'gworkspace/getSubscriptionPaidStatus');
        return subStatusResp;
    }

    const initPurchaseIntent = async (email_in: string, tier: string) => {
        if (tier === 'tier0') {
            return await backendCall({ app: CONSTANTS.APP_CODE, tier }, 'gworkspace/createRegularPaymentIntent');
        }

        //////////////////////////////////////
        //        Legacy subscription stuff
        //////////////////////////////////////
        const email = email_in ? email_in : userEmail;
        let subPaymentParams = {
            email,
            app: CONSTANTS.APP_CODE,
            addOnPurchaseTier: 'tier1',
            add_invoice_items: [],
        };
        // if (subOneTimeChargePriceId) {
        //     subPaymentParams = {
        //         ...subPaymentParams,
        //         add_invoice_items: [{price: subOneTimeChargePriceId}],
        //     };
        // }
        return await backendCall(subPaymentParams, 'gworkspace/createSubscriptionPaymentIntent');
    }

    const handlePurchaseSelect = async (selectedTier: string) => {
        if (selectedTier !== tier) {
            try {
                setTier(selectedTier);
            } catch (e) {
                setIsTierLoading(false);
            }
        }
    }

    const processPaymentRespAndSetStates = async (result: any, overwriteTier: string = null) => {
        if (result.error) {
            // Show error to your customer (for example, payment details incomplete)
            setErrorMsg(result.error.message + " Please try again.");
            return;
        }

        // The payment succeeded!
        const dataToServer = {
            email: userEmail,
            stripe_payment_method: result.paymentIntent.payment_method,
            addOnPurchaseTier: overwriteTier ? overwriteTier : tier,
            app: CONSTANTS.APP_CODE,
            subscriptionId: stripeSubId ? stripeSubId : null,
        };

        // sendToAmplitude(
        //     CONSTANTS.AMPLITUDE.SUCCESSFUL_PURCHASE,
        //     null,
        //     userEmail, userHasPaid
        // );

        // const tvBackendResp = await backendCall(dataToServer, 'gworkspace/addPaidUser');
        // if (tvBackendResp.success) {
        //     setPaymentStatusMsg(tvBackendResp.message);
        //     setUserHasPaid(tvBackendResp.userHasPaid);
        //     setUser(tvBackendResp.user);
        // }
        // else { // Stripe payment succeeded but an error occurred when saving user data to bp database
        //     setErrorMsg(tvBackendResp.message);
        //     setUserHasPaid(false);
        // }
        // if (userEmail) {
        //     backendCall({ email: userEmail, app: "flashcardlab", updateType: 'reset' }, 'gworkspace/updateActionCntr');
        // }
        setIsLoading(false);
    }

    // console.log('activation modal render');

    if (isLoading) return (
        <LoadingAnimation divHeight={"20vh"} height={40} width={40} color={null} addStyle={{}} subText={null} />
    )

    // Show error message if not empty
    if (errorMsg !== '') {
        const msgObj = serverFunctionErrorHandler(errorMsg);
        return (
            <div>
                {msgObj.text} <a href={msgObj.link}>{msgObj.linkText}</a>
            </div>
        )
    }

    if (!isLoading && !clientSecret) return <div>Could not communicate with Stripe. Please contact support at tidisventures@gmail.com.</div>
    if (userHasPaid) return (
        <Elements stripe={stripePromise} options={options} key={clientSecret}>
            <ValuePropStatusAndUpgrade
                paymentStatusMsg={paymentStatusMsg}
                userEmail={userEmail}
                user={user}
                prices={prices}
                showMobileLinkInGSheetFeatures={showMobileLinkInGSheetFeatures}
                setErrorMsg={setErrorMsg}
                clientSecret={clientSecret}
                userHasPaid={userHasPaid}
                processPaymentRespAndSetStates={processPaymentRespAndSetStates}
            />
        </Elements>
    );

    console.log(prices)
    return (
        <>
            <div style={{ width: "50%", textAlign: "center", margin: "auto", paddingTop: "4em" }}>
                {message}
            </div>
            <br />
            <Elements stripe={stripePromise} options={options} key={clientSecret}>
                <Grid container direction="column" alignItems="center" style={{ height: "100%", margin: "auto" }}>
                    <Grid container alignItems="center" style={{ height: "100%", minHeight: "510px" }}>
                        <SalesView
                            showMobileLinkInGSheetFeatures={showMobileLinkInGSheetFeatures}
                            isLoading={isLoading}
                            setIsLoading={setIsLoading}
                            isTierLoading={isTierLoading}
                            prices={prices}
                            email={userEmail}
                            tier={tier}
                            setIsTierLoading={setIsTierLoading}
                            handlePurchaseSelect={handlePurchaseSelect}
                            setErrorMsg={setErrorMsg}
                            billingPeriod={billingPeriod}
                            processPaymentRespAndSetStates={processPaymentRespAndSetStates}
                        />
                    </Grid>
                </Grid>
                <Grid item xs={12} ref={lastDiv}>
                </Grid>
            </Elements>
        </>
    )

}
export default ActivationModal;
