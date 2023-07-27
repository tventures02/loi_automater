import React, { useState, useEffect, useRef } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
import LoadingAnimation from "../../utils/LoadingAnimation";
import { backendCall } from '../../utils/server-calls';
import { Grid, Button, MenuItem, TextField } from '@mui/material';
// import { generateDataToServer } from '../../utils/misc';
import CONSTANTS from '../../utils/constants';
import CTA from '../../utils/CTA';
import RentalInput from './rentalInput';
import FNFInput from './fnfInput';
import Controls from './controls';
// import { amplitudeDataHandler } from "../../utils/amplitude";
import { generateDataToServer, determineUserFunctionalityFromUserDoc } from '../../utils/misc';

const errorMsgStyle = { marginBottom: "0.5rem", fontSize: ".75em", color: "red" };
const textFieldStyle = {
    marginTop: "8px",
    height: '32px',
    width: '100%',
    backgroundColor: "white",
};
const {
    NONE,
    FULL_FUNC,
    FULL_FUNC_SUB,
} = CONSTANTS.FUNC_TIERS;

const SidebarContainer = () => {
    const [userEmail, setUserEmail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [anaSettings, setAnaSettings] = useState({
        downPaymentP: 20, downPaymentD: null,
        closingCostsD: 3000, estRepairCostsD: 1000, otherLenderCostsD: null,
        loanInterestRateP: 5, points: 0, loanTermYears: 30,
        propTaxesP: 1, propTaxesD: null,
        homeInsuranceP: 1, homeInsuranceD: 2000,
        repairsAndMaintP: 5, repairsAndMaintD: null,
        capExP: 5, capExD: null,
        managementFeesP: 10,
        utilitiesD: null,
        hoaFeesD: null,
        otherExpensesD: null,
        rentalIncomeP: .8, otherIncomeD: 0, vacancyP: 3, minRentD: 1000, maxRentD: 3000,
        minNightlyRateD: 100, maxNightlyRateD: 300,
        availableDaysPerYearForBooking: 300,
        platformFeeP: 3, cleaningCostD: 85, cleaningChargeD: 95, occupanyRateP: 80, avgStayDuration: 5,
        annualIncomeGrowthP: 3, annualExpGrowthP: 2,
        desiredProfitD: 0,
        purchaseClosingCostD: 0,
        repairCostsD: 0,
        holdingCostsD: 0,
        holdingTimeMonths: 3,
        agentCommissionP: 6,
        fnfSaleClosingCostsD: 0,
    });
    const controlsRef = useRef(null);
    const [messages, setMessages] = useState({
        trialMessage: 'This free version limits analyzing up to 2 properties at a time.',
        statusMessage: null,
        errorMessage: null,
    });
    const [anaMode, setAnaMode] = useState('');
    const [user, setUser] = useState({
        subscriptionId: '',
        subscriptionStatusActive: true,
        addOnPurchaseTier: 'tier0'
    });
    const [useAmounts, setUseAmounts] = useState({
        downpayment: false,
        propTax: false,
        insurance: false,
        rnm: false,
        capex: false,
        colCRents: false,
    });
    const [filledOutARVs, setFilledOutARVs] = useState(false);
    const [sheet, setSheet] = useState({
        sheetNames: [],
        selectedSheet: '',
    });
    const [functionalityTier, setFunctionalityTier] = useState(NONE);
    const [config, setConfig] = useState({
        gwsCalcYTURL: 'https://www.youtube.com/watch?v=c0-1-zYiCMU'
    });

    //@ts-ignore
    useEffect(() => {
        try {
            const getData = async () => {
                try {
                    setIsLoading(true);
                    const data = await serverFunctions.getInitData();
                    setUserEmail(data.email);
                    setSheet({
                        selectedSheet: data.sheetNames[0] ? data.sheetNames[0] : '',
                        sheetNames: data.sheetNames,
                    });

                    const preventAddingUserToDb = false;
                    const subStatusResp = await backendCall(
                        generateDataToServer(
                            data.email,
                            user.addOnPurchaseTier,
                            CONSTANTS.APP_CODE,
                            CONSTANTS.APP_VARIANT,
                            preventAddingUserToDb),
                        'gworkspace/getSubscriptionPaidStatus');
                    console.log(subStatusResp)

                    const functionalityTier = determineUserFunctionalityFromUserDoc(subStatusResp.user);
                    setFunctionalityTier(functionalityTier);
                    if (subStatusResp.success) {
                        setUser({
                            ...user,
                            ...subStatusResp.user,
                            subscriptionStatusActive: subStatusResp.subscriptionStatusActive,
                        });
                    }
                    else {
                        setIsLoading(false);
                        setMessages({
                            ...messages,
                            errorMessage: 'Could not retreive data from our servers. You can still use the free version of this add-on. Please contact tidisventures@gmail.com or try refreshing the page.',
                        });
                    }
                    setIsLoading(false);

                    const defaultValues = await serverFunctions.readAndParseSettingsValues();
                    setAnaSettings({...anaSettings, ...defaultValues.settingsValues});
                    setUseAmounts({...useAmounts, ...defaultValues.useAmountFlags});

                    let configObj = await getConfigFromBackend(); // set the html search strings for scraping the page
                    if (configObj) {
                        setConfig({
                            ...config,
                            ...configObj,
                        });
                    }
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

    const getConfigFromBackend = async () => {
        const resp = await backendCall({ app: CONSTANTS.APP_CODE }, 'config/getConfig');
        if (resp.success) return resp.params;
        else return null;
    }

    const handleError = (errorMsg) => {
        setIsLoading(false);
        setMessages({
            ...messages,
            errorMessage: errorMsg + ' Please contact tidisventures@gmail.com.',
        });
    }

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

    if (isLoading) return (
        <LoadingAnimation divHeight={"90vh"} height={40} width={40} color={null} addStyle={{}} subText={null} />
    )
    // console.log('render side bar')
    console.log(anaSettings)
    console.log(anaMode)

    let topDivHeight = '80vh';
    if (controlsRef?.current) {
        topDivHeight = `calc(100vh - ${controlsRef.current.clientHeight}px)`;
    }

    let inputFieldsComponent = null;
    if (anaMode === CONSTANTS.ANALYSIS_MODES[1] ||
        anaMode === CONSTANTS.ANALYSIS_MODES[2]) {
        inputFieldsComponent = <RentalInput
            anaMode={anaMode}
            useAmounts={useAmounts}
            setUseAmounts={setUseAmounts}
            anaSettings={anaSettings}
            setAnaSettings={setAnaSettings}
            userHasPaid={functionalityTier !== NONE}
        />;
    }
    else if (anaMode === CONSTANTS.ANALYSIS_MODES[3]) {
        inputFieldsComponent = <FNFInput
            anaSettings={anaSettings}
            setAnaSettings={setAnaSettings}
            setFilledOutARVs={setFilledOutARVs}
            filledOutARVs={filledOutARVs}
        />;
    }

    return (
        <div className='container'>
            <div className='topDiv' style={{ height: topDivHeight }}>
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
                        functionalityTier === NONE ?
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
                        onChange={(e) => {
                            setAnaMode(e.target.value);
                            if (e.target.value === CONSTANTS.ANALYSIS_MODES[2]) {//STR 
                                setUseAmounts({
                                    ...useAmounts,
                                    capex: true,
                                    rnm: true,
                                });
                            }
                        }}
                    >
                        {renderAnalysisOptions()}
                    </TextField>
                </Grid>
                <Grid xs={12} container>
                    {
                        inputFieldsComponent ?
                            inputFieldsComponent :
                            <div className='helpTextSidebar'>
                                <h3>To start:</h3>
                                1. Input property prices in column A and addresses in column B in a sheet. Start on row 2.
                                <br /><br />
                                2. Then, choose analysis from dropdown.
                                <br /><br />
                                3. Click 'Calculate'. <a href={config.gwsCalcYTURL} target="_blank" style={{ cursor: 'pointer' }}>See a short video.</a>
                            </div>
                    }
                </Grid>
            </div>
            <div className='bottomDiv' ref={controlsRef}>
                <Grid item xs={12} style={{ width: "100%", paddingTop: "10px" }}>
                    <Controls
                        sheet={sheet}
                        setSheet={setSheet}
                        textFieldStyle={textFieldStyle}
                        setIsLoading={setIsLoading}
                        anaSettings={anaSettings}
                        anaMode={anaMode}
                        filledOutARVs={filledOutARVs}
                        useAmounts={useAmounts}
                        functionalityTier={functionalityTier}
                    />
                </Grid>
            </div>
        </div>
    )
}
export default SidebarContainer;