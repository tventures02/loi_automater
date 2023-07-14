import React, { useState, useEffect } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
// import { backendCall } from '../../utils/server-calls';
import { Grid, FormControl, Typography, TextField, FormLabel, Switch, FormControlLabel, Tooltip } from '@mui/material';
import HelpOutline from '@mui/icons-material/HelpOutline';
// import { generateDataToServer } from '../../utils/misc';
import CONSTANTS from '../../utils/constants';
import { getSubArray } from '../../utils/misc';
import TogglableTextInputs from './togglableTextInputs';
import TextInputs from './textInputs';
import LTRToolTipMsg from './ltrToolTipMsg';
// import { amplitudeDataHandler } from "../../utils/amplitude";

const textFieldStyle = {
    marginTop: "1.6em",
    height: '32px',
    width: '100%',
    backgroundColor: "white",
};
const helpIconStyle = { fontSize: "1rem", color: "gray", paddingLeft: ".25em", cursor: 'pointer'};
const LTRInput = (props: {
    anaSettings: any,
    setAnaSettings: any,
    useAmounts: any,
    useRentRange: any,
    setUseAmounts: any,
    setUseRentRange: any,
}) => {
    const {
        anaSettings,
        setAnaSettings,
        useAmounts,
        useRentRange,
        setUseAmounts,
        setUseRentRange,
    } = props;

    const dpAnaSettingKey = useAmounts.downpayment ? CONSTANTS.SETTINGS.ANALYSIS_KEYS.PURCHASE[1] : CONSTANTS.SETTINGS.ANALYSIS_KEYS.PURCHASE[0];
    const propTaxAnaSettingKey = useAmounts.propTax ? CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES[1] : CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES[0];
    const insuranceAnaSettingKey = useAmounts.insurance ? CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES[3] : CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES[2];
    const rnmAnaSettingKey = useAmounts.rnm ? CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES[5] : CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES[4];
    const capexAnaSettingKey = useAmounts.capex ? CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES[7] : CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES[6];
    const expKeys = [propTaxAnaSettingKey, insuranceAnaSettingKey, rnmAnaSettingKey, capexAnaSettingKey];
    const endExpKeys = getSubArray(CONSTANTS.SETTINGS.ANALYSIS_KEYS.EXPENSES, 'managementFeesP');

    const dpLabel = useAmounts.downpayment ? CONSTANTS.SETTINGS.PURCHASE[1][0] : CONSTANTS.SETTINGS.PURCHASE[0][0];
    const propTaxLabel = useAmounts.propTax ? CONSTANTS.SETTINGS.EXPENSES[1][0] : CONSTANTS.SETTINGS.EXPENSES[0][0];
    const insurLabel = useAmounts.insurance ? CONSTANTS.SETTINGS.EXPENSES[3][0] : CONSTANTS.SETTINGS.EXPENSES[2][0];
    const rnmLabel = useAmounts.rnm ? CONSTANTS.SETTINGS.EXPENSES[5][0] : CONSTANTS.SETTINGS.EXPENSES[4][0];
    const capexLabel = useAmounts.capex ? CONSTANTS.SETTINGS.EXPENSES[7][0] : CONSTANTS.SETTINGS.EXPENSES[6][0];
    const expLabels = [propTaxLabel, insurLabel, rnmLabel, capexLabel];
    const endExpLabels = CONSTANTS.SETTINGS.EXPENSES.slice(-endExpKeys.length);

    const expUseAmountTypes = ['propTax', 'insurance', 'rnm', 'capex'];
    return (
        <div style={{ marginTop: "1em", paddingBottom: '2em' }}>
            <Grid container style={{ padding: '10px' }}>
                <Grid item xs={12}>
                    <Typography className='header'>Purchase</Typography>
                </Grid>
                <TogglableTextInputs
                    labels={[dpLabel]}
                    keys={[dpAnaSettingKey]}
                    useAmountStateTypes={['downpayment']}
                    textFieldStyle={textFieldStyle}
                    anaSettings={anaSettings}
                    setAnaSettings={setAnaSettings}
                    useAmounts={useAmounts}
                    setUseAmounts={setUseAmounts}
                />
                <TextInputs
                    labels={[CONSTANTS.SETTINGS.PURCHASE[2], CONSTANTS.SETTINGS.PURCHASE[3] ,CONSTANTS.SETTINGS.PURCHASE[4]]}
                    keys={['closingCostsD','estRepairCostsD','otherLenderCostsD',]}
                    textFieldStyle={textFieldStyle}
                    anaSettings={anaSettings}
                    setAnaSettings={setAnaSettings}
                />

                <Grid item xs={12} style={{ marginTop: "4em" }}>
                    <Typography className='header'>Loan details</Typography>
                </Grid>
                <TextInputs
                    labels={CONSTANTS.SETTINGS.LOAN}
                    keys={CONSTANTS.SETTINGS.ANALYSIS_KEYS.LOAN}
                    textFieldStyle={textFieldStyle}
                    anaSettings={anaSettings}
                    setAnaSettings={setAnaSettings}
                />

                <Grid item xs={12} style={{ marginTop: "4em" }}>
                    <Typography className='header'>
                        <div style={{display: 'flex',justifyContent: 'center', alignItems: 'center'}}>Rental income
                        <Tooltip title={<LTRToolTipMsg/>}>
                            <HelpOutline style={helpIconStyle} />
                        </Tooltip>
                        </div>
                    </Typography>
                </Grid>
                <TextInputs
                    labels={CONSTANTS.SETTINGS.LTR}
                    keys={CONSTANTS.SETTINGS.ANALYSIS_KEYS.LTR}
                    textFieldStyle={textFieldStyle}
                    anaSettings={anaSettings}
                    setAnaSettings={setAnaSettings}
                />

                <Grid item xs={12} style={{ marginTop: "4em" }}>
                    <Typography className='header'>Expenses</Typography>
                </Grid>
                <TogglableTextInputs
                    labels={expLabels}
                    keys={expKeys}
                    useAmountStateTypes={expUseAmountTypes}
                    textFieldStyle={textFieldStyle}
                    anaSettings={anaSettings}
                    setAnaSettings={setAnaSettings}
                    useAmounts={useAmounts}
                    setUseAmounts={setUseAmounts}
                />
                <TextInputs
                    labels={endExpLabels}
                    keys={endExpKeys}
                    textFieldStyle={textFieldStyle}
                    anaSettings={anaSettings}
                    setAnaSettings={setAnaSettings}
                />
            </Grid>
        </div>
    )
}
export default LTRInput;