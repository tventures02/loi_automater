import { Grid, Divider } from '@mui/material';
import CONSTANTS from '../../utils/constants';
import React from "react";
import TierCard from './TierCard';

const cardStyle = { "backgroundColor": '#FAFAFA', "width": "100%", "boxShadow": '0 8px 20px 0 rgb(34 41 57 / 10%)' };
const tierCardStyle = { "paddingLeft": "1em", "paddingRight": "1em", "margin": "auto" };

function ValuePropSales(props) {
    const prices = props.prices ? props.prices : null;
    const {
        tier,
        email,
        handlePurchaseSelect,
        isTierLoading,
        setIsTierLoading,
        setIsLoading,
        billingPeriod,
    } = props;

    let tier0Price = 0;
    let tier1Price = 0;
    try {
        tier0Price = prices[0] ? prices[0] : prices.tier0;
        tier1Price = prices[1] ? prices[1] : prices.tier1;
    }
    catch(e) {
        tier0Price = prices.tier0;
        tier1Price = prices.tier1;
    }
    return (
        <Grid container style={{ margin: "auto" }}>
            <Grid item xs={12} style={{ "textAlign": "center" }}>
                <h2>Pricing</h2>
            </Grid>
            {prices ?
                <Grid container>
                    <Grid item xs={4} style={tierCardStyle}>
                        <TierCard cardStyle={cardStyle} title={'Free'} features={CONSTANTS.FREE_FEATURES} cardTier={'free'}
                            price={"0"} />
                    </Grid>
                    <Grid item xs={4} style={tierCardStyle}>
                        <TierCard
                            email={email}
                            cardStyle={cardStyle}
                            title={'Pro'}
                            handlePurchaseSelect={handlePurchaseSelect}
                            features={CONSTANTS.PRO_FEATURES}
                            price={tier0Price}
                            cardTier={'tier0'}
                            selectedTier={tier}
                        />
                    </Grid>
                    <Grid item xs={4} style={tierCardStyle}>
                        <TierCard
                            email={email}
                            cardStyle={cardStyle}
                            title={'Elite'}
                            handlePurchaseSelect={handlePurchaseSelect}
                            features={CONSTANTS.ELITE_FEATURES}
                            price={tier1Price}
                            cardTier={'tier1'}
                            selectedTier={tier}
                        />
                    </Grid>
                </Grid>
                :
                <div>{CONSTANTS.SERVER_ERROR_MSG}</div>
            }
            <Divider />
            <Grid item xs={12} style={{ "textAlign": "center", "marginTop": "2.5em" }}>
                <h2>Buy Premium Features</h2>
                <h3>{email}</h3>
            </Grid>
        </Grid>
    )
}

export default ValuePropSales;