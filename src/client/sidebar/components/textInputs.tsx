import React from 'react';
import { Grid, FormControl, Typography, TextField, FormLabel, Switch, FormControlLabel } from '@mui/material';
const TextInput = (props: {
    labels: Array<string>,
    keys: Array<string>,
    textFieldStyle: any,
    anaSettings: any,
    setAnaSettings: any,
}) => {
    const {
        labels,
        keys,
        textFieldStyle,
        anaSettings,
        setAnaSettings,
    } = props;

    const inputFields = labels.map((label, i) => {
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
                    label={label[0]}
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