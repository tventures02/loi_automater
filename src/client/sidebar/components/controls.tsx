import React, { useState, useEffect, useRef } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
import { Grid, Button, MenuItem, TextField } from '@mui/material';

const controlButtonStyle = { width: "100%", marginBottom: "1em" };
const Controls = (props: {
    sheet: any,
    setSheet: any,
    textFieldStyle: any,
    setIsLoading: any,
    anaSettings,
    anaMode,
    useAmounts,
}) => {
    const {
        sheet,
        setSheet,
        textFieldStyle,
        setIsLoading,
        anaSettings,
        anaMode,
        useAmounts,
    } = props;

    const renderSheetOptions = () => {
        let sheetsDropdown = [];
        for (let i = 0; i < sheet.sheetNames.length; i++) {
            sheetsDropdown.push(
                <MenuItem value={sheet.sheetNames[i]}
                >{sheet.sheetNames[i]}</MenuItem>
            )
        }
        return sheetsDropdown;
    }

    return (
        <>
            <TextField
                className="textfield-day-32px"
                select
                id="select-question"
                size="small"
                variant="outlined"
                label="Choose sheet to analyze"
                value={sheet.selectedSheet}
                style={{...textFieldStyle, marginBottom: '1em'}}
                onChange={(e) => setSheet({
                        ...sheet,
                        selectedSheet: e.target.value
                    })}
            >
                {renderSheetOptions()}
            </TextField>
            <Button size="small" variant="contained" color="primary" style={controlButtonStyle}
                disabled={!anaMode || !sheet.selectedSheet}
                onClick={async () => {
                    try {
                        // sendToAmplitude(CONSTANTS.AMPLITUDE.LAUNCHED_QUIZ_EDITOR);
                        setIsLoading(true);
                        let propertiesSheetData = await serverFunctions.readPricesAndAddresses(sheet.selectedSheet);
                        serverFunctions.writeToSettings(anaSettings);
                        await serverFunctions.doAna(
                            propertiesSheetData,
                            anaSettings,
                            anaMode,
                            useAmounts,
                        );
                        setIsLoading(false);
                    } catch (error) {
                        console.log(error)
                        setIsLoading(false);
                    }
                }}
            >Calculate</Button>
        </>
    )
}
export default Controls;