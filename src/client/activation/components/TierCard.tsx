import React from "react";
import { Grid, Typography, Card, CardContent, Paper, CardActions, Switch } from '@mui/material';
import MobileFeature from './MobileFeature';
import CONSTANTS from '../../utils/constants';
import PriceDisplay from './PriceDisplay';
import { serverFunctions } from '../../utils/serverFunctions';
import Check from "@mui/icons-material/Check";

const dollarSignStyle = {
    "position": "relative",
    "fontSize": "1.25em",
    "lineHeight": "26px",
    "fontWeight": "700"
};
const priceStyle = {
    "display": "flex",
    "paddingLeft": "12px",
    "float": "none",
    "-webkit-box-pack": "center",
    "justifyContent": "center",
    "-ms-flex-align": "center",
    "alignItems": "center",
    "fontWeight": "900"
};
let premLabelStyle = {
    'marginBottom': '.1em',
    'borderRadius': '4px',
    'padding': '0.5em',
    'border': `0px`,
    'backgroundColor': CONSTANTS.LIGHT_GREEN,
    'color': 'white',
    'fontSize': '.62em',
    'width': 'fit-content',
    'margin': 'auto',
};

export function TierCard(props) {
    const {
        price,
        title,
        cardTier,
        selectedTier,
        email,
        showMobileLinkInGSheetFeatures,
    } = props;

    let {
        cardStyle
    } = props;

    const spanStyle = { "fontSize": ".75em", "display": "flex", "alignItems": "center" };

    // Define the features of the tier
    const features = props.features.map((feature, ind) => {
        const featureStyling = feature.length > 26 ?
            { divStyle: { "display": "flex", paddingBottom: ".35em" }, spanStyle: { ...spanStyle, "lineHeight": "normal" } } :
            { divStyle: { "alignItems": "center", "display": "flex" }, spanStyle, };

        let featureStyle = featureStyling.divStyle;
        if (feature.includes('->')) {
            feature = feature.replace('->', '');
            featureStyle = {
                ...featureStyle,
                // @ts-ignore
                paddingLeft: "1em",
            }
        }
        return (
            <div style={featureStyle}>
                <Check style={{ "fontSize": "1.2rem", "marginBottom": ".2em" }} />
                <span style={featureStyling.spanStyle}>
                    {feature}
                </span>
            </div>)
    });

    // Style the card based on which tier is selected
    const checked = selectedTier === cardTier;
    const selectText = 'Select this option:';
    if (selectedTier === cardTier) {
        cardStyle = {
            ...cardStyle,
            "backgroundColor": "#5469d4",
            "boxShadow": '0 8px 20px 0 rgb(34 41 57 / 70%)',
            "fontWeight": "bold",
            "color": "white",
        };
    }

    let priceDisplayElem = <PriceDisplay priceText={price ? price.toString() : null} />;
    let paymentMethod: any = 'One time purchase';

    if (!price) paymentMethod = null;

    return (
        <Card 
            style={cardStyle}
        >
            <CardContent style={{ "paddingBottom": "0px", "minHeight": "350px" }}>
                <Grid container onClick={() => { if (price !== "0") props.handlePurchaseSelect(cardTier) }}
                    style={{ cursor: "pointer" }}>
                    {/* Title */}
                    <Grid item xs={12}
                        style={{ cursor: "pointer" }}>
                        <Typography align="center" variant="h5" component="div" gutterBottom>
                            {title}
                        </Typography>
                        {price !== "0" ?
                            <Paper style={premLabelStyle} variant="outlined">
                                <b>{title} Tier</b>
                            </Paper> :
                            null
                        }
                    </Grid>

                    {/* Price */}
                    {price ?
                        <Grid item xs={12}
                            style={{ "margin": "10px", cursor: "pointer" }}>
                            {/* @ts-ignore */}
                            <div style={priceStyle}>
                                {/* @ts-ignore */}
                                <span style={dollarSignStyle}>$</span>
                                {priceDisplayElem}
                            </div>
                        </Grid>
                        : null
                    }

                    {/* payment method (one time purchase or sub) */}
                    <Grid item xs={12} style={{ paddingBottom: '1em', cursor: "pointer" }}>
                        {price !== "0" ? <div style={{ "textAlign": "center", "fontSize": ".75em" }}>
                            {paymentMethod}
                        </div> : null}
                    </Grid>

                    {/* Features list and tier-based text */}
                    <Grid item xs={12} style={{ "margin": "10px", marginBottom: "1em", "textAlign": "left", minHeight: "250px" }}>
                        {features}
                        {
                            showMobileLinkInGSheetFeatures && cardTier === 'tier0' ?
                                <MobileFeature email={email} />
                                :
                                null
                        }
                    </Grid>
                    <Grid container>
                        {price !== '0' && price ?
                            <CardActions style={{ "width": "100%" }}>
                                <Grid item xs={12} style={{ "textAlign": "right" }}>
                                    {selectText} <Switch checked={checked} onChange={() => props.handlePurchaseSelect(cardTier)} />
                                </Grid>
                            </CardActions>
                            : null}
                    </Grid>
                </Grid>
            </CardContent>
        </Card >
    )
}

export default TierCard;