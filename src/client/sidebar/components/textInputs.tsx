import React from 'react';
import { Grid, FormControl, Typography, TextField, FormLabel, Switch, FormControlLabel } from '@mui/material';
import CONSTANTS from '../../utils/constants';
const TextInput = (props: {
    labels: Array<string>,
    keys: Array<string>,
    textFieldStyle: any,
    anaSettings: any,
    setAnaSettings: any,
    anaMode: string,
}) => {
    const {
        labels,
        keys,
        textFieldStyle,
        anaSettings,
        setAnaSettings,
        anaMode,
    } = props;

    const inputFields = labels.map((label, i) => {
        let thisLabel = label[0];
        if (anaMode === CONSTANTS.ANALYSIS_MODES[2]) {
            if (keys[i] === 'managementFeesP') thisLabel = 'Mgmt fees (% of booking revenue)';
        }
        return (
            <Grid item xs={12}>
                <TextField
                    // @ts-ignore
                    type="number"
                    value={anaSettings[keys[i]] !== null && anaSettings[keys[i]] !== undefined ? anaSettings[keys[i]] : ''}
                    size="small"
                    variant="standard"
                    InputProps={{
                        inputProps: {
                            min: 0,
                        }
                    }}
                    label={thisLabel}
                    onChange={(e) => {
                        setAnaSettings({
                            ...anaSettings,
                            [keys[i]]: parseFloat(e.target.value)
                        })
                    }}
                    // @ts-ignore
                    style={textFieldStyle}
                />
            </Grid>
        )
    });

    return (
        <>{inputFields}</>
    )
}
export default TextInput;