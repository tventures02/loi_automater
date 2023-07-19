import React from "react";
import { Grid, Typography } from '@mui/material';

function PriceDisplay({ priceText }) {
    if (!priceText) return null;
    const priceSplitArray = priceText.split('.');
    const dollarText = priceSplitArray[0];
    let centsText = null;
    if (priceSplitArray.length === 2) {
        centsText = priceSplitArray[1];
    }
    return (
        <span>
            <Typography align="center" variant="h2" component="div" style={{display: "flex", alignItems: "center"}}>
                {dollarText}
                {
                    centsText ?
                        <span style={{ fontSize: '.35em' }}>
                            .{centsText}
                        </span>
                        :
                    null
                }
            </Typography>

        </span>
    )
}

export default PriceDisplay;