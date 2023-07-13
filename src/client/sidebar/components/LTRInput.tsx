import React, { useState, useEffect } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
// import { backendCall } from '../../utils/server-calls';
import { Grid, FormControl, Typography, TextField, FormLabel, Switch, FormControlLabel } from '@mui/material';
// import { generateDataToServer } from '../../utils/misc';
import CONSTANTS from '../../utils/constants';
import { getSubArray } from '../../utils/misc';
import TogglableTextInputs from './togglableTextInputs';
import TextInputs from './textInputs';
// import { amplitudeDataHandler } from "../../utils/amplitude";

const textFieldStyle = {
    marginTop: "1.6em",
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
        propTax: false,
        insurance: false,
        rnm: false,
        capex: false,
    });

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
        <div style={{ marginTop: "1em" }}>
            <Grid container style={{ padding: '10px' }}>
                <Grid item xs={12}>
                    <Typography>Purchase</Typography>
                </Grid>
                <TogglableTextInputs
                    labels={[dpLabel]}
                    keys={dpAnaSettingKey}
                    useAmountStateTypes={['downpayment']}
                    textFieldStyle={textFieldStyle}
                    anaSettings={anaSettings}
                    setAnaSettings={setAnaSettings}
                    useAmounts={useAmounts}
                    setUseAmounts={setUseAmounts}
                />
                <Grid item xs={12}>
                    <TextField
                        // @ts-ignore
                        type="number"
                        value={anaSettings.closingCostsD ? anaSettings.closingCostsD : 0}
                        size="small"
                        variant="standard"
                        label={CONSTANTS.SETTINGS.PURCHASE[2][0]}
                        onChange={(e) => {
                            setAnaSettings({
                                ...anaSettings,
                                closingCostsD: parseFloat(e.target.value)
                            })
                        }}
                        // @ts-ignore
                        style={textFieldStyle}
                    />
                </Grid>


                <Grid item xs={12} style={{ marginTop: "4em" }}>
                    <Typography>Loan details</Typography>
                </Grid>
                <TextInputs
                    labels={CONSTANTS.SETTINGS.LOAN}
                    keys={CONSTANTS.SETTINGS.ANALYSIS_KEYS.LOAN}
                    textFieldStyle={textFieldStyle}
                    anaSettings={anaSettings}
                    setAnaSettings={setAnaSettings}
                />

                <Grid item xs={12} style={{ marginTop: "4em" }}>
                    <Typography>Rental income</Typography>
                </Grid>
                <TextInputs
                    labels={CONSTANTS.SETTINGS.LTR}
                    keys={CONSTANTS.SETTINGS.ANALYSIS_KEYS.LTR}
                    textFieldStyle={textFieldStyle}
                    anaSettings={anaSettings}
                    setAnaSettings={setAnaSettings}
                />

                <Grid item xs={12} style={{ marginTop: "4em" }}>
                    <Typography>Expenses</Typography>
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