import React from "react";
import { Grid } from '@mui/material';
import Contact from './Contact';
import CONSTANTS from '../../utils/constants';
import LoadingAnimation from '../../utils/LoadingAnimation';
import { PaymentElement } from '@stripe/react-stripe-js';

const centerStyle = { display: "flex", justifyContent: "center" };
const loadingStyle = {
    'position': 'absolute',
    zIndex: 999,
    'align-content': 'center',
    'background-color': 'rgba(255, 255, 255, 0.3)'
};
const StripeForm = (props: {
    isPurchasing: boolean,
    handleSubmit: any,
}) => {
    const {
        isPurchasing,
        handleSubmit,
    } = props;

    let overlayLoading = null;
    if (isPurchasing) {
        overlayLoading = (
            <LoadingAnimation divHeight={'100%'} addStyle={loadingStyle} height={60} width={60} color={'blue'} subText={null} />);
    }
    return (
        <>
            < Grid item xs={12} style={{ ...centerStyle, "paddingTop": "15px", "minHeight": "510px", position: "relative" }
            }>
                {overlayLoading ? overlayLoading : null}
                < form onSubmit={handleSubmit} >
                    <PaymentElement options={{ terms: { card: "never" } }} />
                    <button disabled={isPurchasing} style={{marginTop: '1em'}}>Buy</button>
                </form >
            </Grid >
            <Contact />
            < Grid item xs={12} style={{ ...centerStyle, "paddingTop": "30px" }}>
                <a href="https://stripe.com/"><img src={CONSTANTS.STRIPE_BADGE} style={{ "width": "110px", "backgroundColor": "white" }} /></a>
            </Grid >
        </>
    )
}

export default StripeForm;