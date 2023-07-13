import React, { useState, useEffect } from 'react';
import { Grid, FormControl, Typography, TextField, FormLabel, Switch, FormControlLabel } from '@mui/material';
import TogglableTextInput from './togglableTextInput';

const TogglableTextInputs = (props: {
    labels: Array<string>,
    keys: Array<string>,
    useAmountStateTypes: Array<string>,
    textFieldStyle: any,
    anaSettings: any,
    setAnaSettings: any,
    useAmounts: any,
    setUseAmounts: any,
}) => {
    const {
        labels,
        keys,
        useAmountStateTypes,
        textFieldStyle,
        anaSettings,
        setAnaSettings,
        useAmounts,
        setUseAmounts,
    } = props;

    const inputFields = labels.map((label, i) => {
        return (
            <TogglableTextInput
                label={label}
                useAmounts={useAmounts}
                keyStr={keys[i]}
                value={anaSettings[keys[i]]}
                anaSettings={anaSettings}
                setAnaSettings={setAnaSettings}
                setUseAmounts={setUseAmounts}
                useAmountStateType={useAmountStateTypes[i]}
                textFieldStyle={textFieldStyle}
            />
        )
    });

    return (
        <>
            {inputFields}
        </>
    )
}
export default TogglableTextInputs;