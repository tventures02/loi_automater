import React, { useState, useEffect } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
import LoadingAnimation from "../../utils/LoadingAnimation";
// import { backendCall } from '../../utils/server-calls';
import { Grid, Button, MenuItem, TextField } from '@mui/material';
// import { generateDataToServer } from '../../utils/misc';
import CONSTANTS from '../../utils/constants';
import CTA from '../../utils/CTA';
// import { amplitudeDataHandler } from "../../utils/amplitude";

const errorMsgStyle = { marginBottom: "0.5rem", fontSize: ".75em", color: "red" };
const textFieldStyle = {
    marginTop: "8px",
    height: '32px',
    width: '100%',
    backgroundColor: "white",
};
const controlButtonStyle = { width: "100%", marginBottom: "1em" };
const SidebarContainer = () => {
    const [userEmail, setUserEmail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [anaSettings, setAnaSettings] = useState({
        downPaymentP: 20, downPaymentD: null, closingCostsD: 3000,
        loanInterestRateP: 5, points: 0, loanTermYears: 30,
        propTaxesP: 1, propTaxesD: null,
        homeInsuranceP: 1, homeInsuranceD: 2000,
        repairsAndMaintP: 5, repairsAndMaintD: null,
        capExP: 5, capExD: null,
        managementFeesP: 10,
        utilitiesD: null,
        hoaFeesD: null,
        otherExpensesD: null,
        rentalIncomeD: 2000, otherIncomeD: 0, vacancyP: 3,
        nightlyRateD: 100, availableDaysPerYearForBooking: 300, platformFeeP: 3, cleaningCostD: 85, cleaningChargeD: 95, occupanyRateP: 80,
        annualIncomeGrowthP: 3, annualExpGrowthP: 2
    });
    const [addOnPurchaseTier, setPurchaseTier] = useState('tier0');
    const [messages, setMessages] = useState({
        trialMessage: null,
        statusMessage: null,
        errorMessage: null,
    });
    const [anaMode, setAnaMode] = useState('');
    const [user, setUser] = useState({
        subscriptionId: '',
        subscriptionStatusActive: false,
        addOnPurchaseTier: 'tier0'
    });

    //@ts-ignore
    useEffect(() => {
        try {
            const getData = async () => {
                try {
                    setIsLoading(true);
                    const email = await serverFunctions.getUserEmail();
                    setUserEmail(email);
                    // const subStatusResp = await getSubscriptionPaidStatus(email);
                    // console.log(subStatusResp)
                    // if (subStatusResp.success) {
                    //     setSubscriptionStatusActive(subStatusResp.subscriptionStatusActive);
                    //     setUser(subStatusResp.user);
                    // }
                    // else {
                    //     setIsLoading(false);
                    //     setMessages({
                    //         ...messages,
                    //         errorMessage: 'Could not retreive data from our servers. You can still use the free version of this add-on. Please contact tidisventures@gmail.com or try refreshing the page.',
                    //     });
                    // }
                    setIsLoading(false);

                    const defaultValues = await serverFunctions.readAndParseSettingsValues();
                    setAnaSettings(defaultValues);
                } catch (error) {
                    console.log(error)
                    handleError('Error: Problem getting data during mounting.');
                }
            };

            getData();
        }
        catch (e) {
            handleError(e.message);
        }
    }, []);

    const handleError = (errorMsg) => {
        setIsLoading(false);
        setMessages({
            ...messages,
            errorMessage: errorMsg + ' Please contact tidisventures@gmail.com.',
        });
    }

    const controls = (
        <>
            <Button size="small" variant="contained" color="primary" style={controlButtonStyle}
                onClick={async () => {
                    console.log('askdfh')
                    // sendToAmplitude(CONSTANTS.AMPLITUDE.LAUNCHED_QUIZ_EDITOR);
                    let priceAndAddressesObj = await serverFunctions.readPricesAndAddresses();
                    console.log(priceAndAddressesObj)
                }}
            >Calculate</Button>
        </>
    );

    const renderAnalysisOptions = () => {
        let outputTypesDropdown = [];
        for (let i = 0; i < CONSTANTS.ANALYSIS_MODES.length; i++) {
            outputTypesDropdown.push(
                <MenuItem value={CONSTANTS.ANALYSIS_MODES[i]}
                >{CONSTANTS.ANALYSIS_MODES[i]}</MenuItem>
            )
        }
        return outputTypesDropdown;
    }

    const renderInputFields = () => {
        let params = [];
        let inputFields= [];
        switch (anaMode) {
            case CONSTANTS.ANALYSIS_MODES[1]: // ltr
                params = [
                    ...CONSTANTS.SETTINGS.ANALYSIS_KEYS.PURCHASE,
                    ...CONSTANTS.SETTINGS.ANALYSIS_KEYS.LOAN,
                    ...CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES,
                    ...CONSTANTS.SETTINGS.ANALYSIS_KEYS.LTR,
                ];
                break;
        
            default:
                break;
        }
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
                    style={{...textFieldStyle, marginTop: '1em'}}
                />
            )
        }

        return inputFields;
    }
    if (isLoading) return (
        <LoadingAnimation divHeight={"90vh"} height={40} width={40} color={null} addStyle={{}} subText={null} />
    )
    console.log('render side bar')
    console.log(anaSettings)
    console.log(anaMode)

    return (
        <div className='container'>
            <div className='topDiv'>
                {
                    messages.errorMessage ?
                        <Grid xs={12} container style={errorMsgStyle}>
                            {messages.errorMessage}
                        </Grid>
                        :
                        null
                }
                <Grid xs={12} container>
                    {
                        !user.subscriptionStatusActive ?
                            <CTA message={{ msg: messages.trialMessage }} singleLineCTA={true} />
                            :
                            null
                    }
                </Grid>
                <Grid xs={12} container style={{ marginBottom: "0.5rem", }}>
                    <TextField
                        className="textfield-day-32px"
                        select
                        id="select-question"
                        size="small"
                        variant="outlined"
                        label="Choose analysis type"
                        value={anaMode}
                        style={textFieldStyle}
                        onChange={(e) => setAnaMode(e.target.value)}
                    >
                        {renderAnalysisOptions()}
                    </TextField>
                </Grid>
                <Grid xs={12} container>
                    {
                        anaMode !== '' ?
                            <>
                                {renderInputFields()}
                            </>
                            :
                            null
                    }
                </Grid>


            </div>
            <div className='bottomDiv'>
            <Grid item xs={12}>
                {controls}
            </Grid>
            </div>
        </div>
    )
}
export default SidebarContainer;