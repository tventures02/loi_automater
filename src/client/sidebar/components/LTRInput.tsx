import React, { useState, useEffect } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
// import { backendCall } from '../../utils/server-calls';
import { Grid, FormControl, Typography, TextField, FormLabel, Switch, FormControlLabel } from '@mui/material';
// import { generateDataToServer } from '../../utils/misc';
import CONSTANTS from '../../utils/constants';
// import { amplitudeDataHandler } from "../../utils/amplitude";

const textFieldStyle = {
    marginTop: "1em",
    height: '32px',
    width: '100%',
    backgroundColor: "white",
};

const LTRInput = (props: {
    anaSettings: any,
    setAnaSettings: any,
}) => {
    const {
        anaSettings,
        setAnaSettings,
    } = props;

    const [useAmounts, setUseAmounts] = useState({
        downpayment: false,
    });

    const renderInputFields = () => {
        console.log("here")
        let params = [];
        let inputFields = [];
        params = [
            ...CONSTANTS.SETTINGS.ANALYSIS_KEYS.PURCHASE,
            ...CONSTANTS.SETTINGS.ANALYSIS_KEYS.LOAN,
            ...CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES,
            ...CONSTANTS.SETTINGS.ANALYSIS_KEYS.LTR,
        ];

        for (let i = 0; i < params.length; i++) {
            const anaSettingsKey = params[i];
            const anaSettingsValue = anaSettings[anaSettingsKey];
            inputFields.push(
                <TextField
                    // @ts-ignore
                    type="number"
                    value={anaSettingsValue}
                    size="small"
                    variant="standard"
                    label={params[i]}
                    onChange={(e) => {
                        console.log(e.target.value);
                        setAnaSettings({
                            ...anaSettings,
                            [anaSettingsKey]: parseFloat(e.target.value)
                        })
                    }}
                    // @ts-ignore
                    style={textFieldStyle}
                />
            )
        }
        return inputFields;
    }

    return (
        <div style={{marginTop: "1em"}}>
            <Typography>Purchase</Typography>
            <Grid container style={{ padding: '10px' }}>
                <Grid item xs={6}>
                    {
                        useAmounts.downpayment
                            ?
                            <TextField
                                // @ts-ignore
                                type="number"
                                value={anaSettings.downPaymentD ? anaSettings.downPaymentD : 0}
                                size="small"
                                variant="standard"
                                label={'Downpayment ($)'}
                                onChange={(e) => {
                                    console.log(e.target.value);
                                    setAnaSettings({
                                        ...anaSettings,
                                        downPaymentD: parseFloat(e.target.value)
                                    })
                                }}
                                // @ts-ignore
                                style={textFieldStyle}
                            />
                            :
                            <TextField
                                // @ts-ignore
                                type="number"
                                value={anaSettings.downPaymentP}
                                size="small"
                                variant="standard"
                                label={'Downpayment (%)'}
                                onChange={(e) => {
                                    console.log(e.target.value);
                                    setAnaSettings({
                                        ...anaSettings,
                                        downPaymentP: parseFloat(e.target.value)
                                    })
                                }}
                                // @ts-ignore
                                style={textFieldStyle}
                            />
                    }
                </Grid>
                <Grid item xs={6} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FormControlLabel
                        control={
                            <Switch onChange={(e) => {
                                setUseAmounts({
                                    ...useAmounts,
                                    downpayment: e.target.checked,
                                })
                            }
                            } name="toggleDP" />
                        }
                        label={<div style={{ fontSize: ".7em" }}>Use $</div>}
                    />
                </Grid>
            </Grid>
            {/* {renderInputFields()} */}
        </div>
    )
}
export default LTRInput;