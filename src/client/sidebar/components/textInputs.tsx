import React from 'react';
import { Grid, FormControl, Typography, TextField, FormLabel, Switch, FormControlLabel } from '@mui/material';
const TextInput = (props: {
    labels: Array<string>,
    keys: Array<string>,
    useRentRange: boolean,
    textFieldStyle: any,
    anaSettings: any,
    setAnaSettings: any,
}) => {
    const {
        labels,
        keys,
        useRentRange,
        textFieldStyle,
        anaSettings,
        setAnaSettings,
    } = props;

    console.log('rental income range')
    console.log(anaSettings.rentalIncomeRange)

    const handleSliderChange = (event, newValue) => {
        setAnaSettings({
            ...anaSettings,
            rentalIncomeRange: newValue,
        });
    }

    const valuetext = (value) => {
        return `$${value}`;
    }


    const inputFields = labels.map((label, i) => {
        if (useRentRange && keys[i] === 'rentalIncomeD') {
            return (
                <>
                    <Grid item xs={6}>
                        <TextField
                            // @ts-ignore
                            type="number"
                            value={anaSettings.rentalIncomeRange[0] ? anaSettings.rentalIncomeRange[0] : 0}
                            size="small"
                            variant="standard"
                            label={'Min. rent ($)'}
                            onChange={(e) => {
                                setAnaSettings({
                                    ...anaSettings,
                                    rentalIncomeRange: [e.target.value, anaSettings.rentalIncomeRange[1]]
                                })
                            }}
                            // @ts-ignore
                            style={textFieldStyle}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            // @ts-ignore
                            type="number"
                            value={anaSettings.rentalIncomeRange[1] ? anaSettings.rentalIncomeRange[1] : 0}
                            size="small"
                            variant="standard"
                            label={'Max rent ($)'}
                            onChange={(e) => {
                                setAnaSettings({
                                    ...anaSettings,
                                    rentalIncomeRange: [anaSettings.rentalIncomeRange[0], e.target.value]
                                })
                            }}
                            // @ts-ignore
                            style={textFieldStyle}
                        />
                    </Grid>
                </>
            );
        }
        return (
            <Grid item xs={12}>
                <TextField
                    // @ts-ignore
                    type="number"
                    value={anaSettings[keys[i]] ? anaSettings[keys[i]] : 0}
                    size="small"
                    variant="standard"
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
        <>
            {inputFields}
        </>
    )
}
export default TextInput;