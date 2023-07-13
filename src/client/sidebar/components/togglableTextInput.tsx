import React, { useState, useEffect } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
// import { backendCall } from '../../utils/server-calls';
import { Grid, FormControl, Tooltip, TextField, FormLabel, Switch, FormControlLabel, InputAdornment } from '@mui/material';
// import { generateDataToServer } from '../../utils/misc';
import CONSTANTS from '../../utils/constants';
// import { amplitudeDataHandler } from "../../utils/amplitude";

const TogglableTextInput = (props: {
    label: string,
    useAmounts: any,
    keyStr: string,
    value: any,
    anaSettings: any,
    setAnaSettings: any,
    setUseAmounts: any,
    useAmountStateType: string,
    textFieldStyle: any,
}) => {
    const {
        label,
        useAmounts,
        keyStr,
        value,
        anaSettings,
        setAnaSettings,
        setUseAmounts,
        useAmountStateType,
        textFieldStyle,
    } = props;

    const adornmentText = useAmounts[useAmountStateType] ? '$' : '%';
    const adornmentType = useAmounts[useAmountStateType] ? 'startAdornment' : 'endAdornment';
    const adornmentPos = useAmounts[useAmountStateType] ? 'start' : 'end';

    const textField =(
        // @ts-ignore
        <Tooltip title={label}>
            <TextField
                // @ts-ignore
                type="number"
                value={value ? value : 0}
                size="small"
                variant="standard"
                label={label}
                onChange={(e) => {
                    if (keyStr in anaSettings) {
                        setAnaSettings({
                            ...anaSettings,
                            [keyStr]: parseFloat(e.target.value)
                        });
                    }
                }}
                // @ts-ignore
                style={textFieldStyle}
                InputProps={{
                    [adornmentType]: <InputAdornment position={adornmentPos}>{adornmentText}</InputAdornment>,
                }}
            />
        </Tooltip>
    )

    return (
        <>
            <Grid item xs={6}>
                {textField}
            </Grid>
            <Grid item xs={6} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FormControlLabel
                    style={{ marginLeft: '0', marginRight: '0' }}
                    control={
                        <Switch checked={useAmounts[useAmountStateType]} onChange={(e) => {
                            setUseAmounts({
                                ...useAmounts,
                                [useAmountStateType]: e.target.checked,
                            })
                        }
                        } name={`toggle${keyStr}`} />
                    }
                    labelPlacement={'start'}
                    label={<div style={{ fontSize: ".7em", color: '#666666' }}>Use $</div>}
                />
            </Grid>
        </>
    )
}
export default TogglableTextInput;