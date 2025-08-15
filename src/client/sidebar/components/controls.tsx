import React, { useState, useEffect, useRef } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
import { Grid, Button, MenuItem, TextField } from '@mui/material';
import CONSTANTS from '../../utils/constants';
import AlertDialog from '../../utils/AlertDialog';

const controlButtonStyle = { width: "100%", marginBottom: "1em" };
const Controls = (props: {
    sheet: any,
    setSheet: any,
    textFieldStyle: any,
    setIsLoading: any,
    anaSettings,
    anaMode,
    useAmounts,
    filledOutARVs: boolean,
    functionalityTier: boolean,
    sendToAmplitude: any,
    user: any,
}) => {
    const {
        sheet,
        setSheet,
        textFieldStyle,
        setIsLoading,
        anaSettings,
        anaMode,
        useAmounts,
        filledOutARVs,
        functionalityTier,
        sendToAmplitude,
        user,
    } = props;

    const [openDisclaimer, setOpenDisclaimer] = useState(false);

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

    const btnDisabled = !anaMode || !sheet.selectedSheet || (!filledOutARVs && anaMode === CONSTANTS.ANALYSIS_MODES[3]);

    return (
        <>
            {
                openDisclaimer ?
                    <AlertDialog
                        showAlertFlag={openDisclaimer}
                        contentJSX={<div style={{ fontSize: ".7em" }}>{CONSTANTS.DISCLAIMER}</div>}
                        title={"Disclaimer"}
                        handleCloseAlert={(event, reason: string) => {
                            setOpenDisclaimer(false);
                        }}
                    />
                    :
                    null
            }
            <Grid container>
                <Grid item xs={10}>
                    <TextField
                        className="textfield-day-32px"
                        select
                        id="select-question"
                        size="small"
                        variant="outlined"
                        label="Choose sheet to analyze"
                        value={sheet.selectedSheet}
                        style={{ ...textFieldStyle, marginBottom: '1em' }}
                        onChange={(e) => setSheet({
                            ...sheet,
                            selectedSheet: e.target.value
                        })}
                    >
                        {renderSheetOptions()}
                    </TextField>
                </Grid>
                <Grid item xs={2} className='sheetSelectionRefresh'>
                    <a onClick={async () => {
                        const data = await serverFunctions.getInitData();
                        setSheet({
                            selectedSheet: data.sheetNames[0] ? data.sheetNames[0] : '',
                            sheetNames: data.sheetNames,
                        });
                    }} style={{cursor: "pointer"}}>Refresh sheets</a>
                </Grid>
            </Grid>

            <Button size="small" variant="contained" color="primary" style={{...controlButtonStyle, backgroundColor: btnDisabled ? '' : '#007bff'}}
                disabled={btnDisabled}
                onClick={async () => {
                    try {
                        // sendToAmplitude(CONSTANTS.AMPLITUDE.LAUNCHED_QUIZ_EDITOR);
                        setIsLoading(true);
                        let propertiesSheetData = await serverFunctions.readPricesAndAddresses(sheet.selectedSheet, anaMode, useAmounts);
                        let eventProperties = {
                            anaSettings,
                            firstAddress: null,
                        };
                        if (propertiesSheetData.success && propertiesSheetData.orderedAddresses.length) {
                            eventProperties.firstAddress = propertiesSheetData.orderedAddresses[0];
                        }
                        sendToAmplitude(CONSTANTS.AMPLITUDE.CLICKED_CALC, eventProperties, user);
                        if (!propertiesSheetData.success) throw Error(propertiesSheetData.message);

                        serverFunctions.writeToSettings(anaSettings, useAmounts);
                        await serverFunctions.doAna(
                            propertiesSheetData,
                            anaSettings,
                            anaMode,
                            useAmounts,
                            functionalityTier,
                        );
                        setIsLoading(false);
                    } catch (error) {
                        console.log(error)
                        alert(error)
                        setIsLoading(false);
                    }
                }}
            >Calculate</Button>
            <Grid container>
                <Grid item xs={12} style={{ fontSize: '.7em', textAlign: "center" }}>
                    <a href={CONSTANTS.SUPPORT_PAGE} style={{ cursor: "pointer" }} target="_blank">Help</a> | <a onClick={() => setOpenDisclaimer(true)} style={{ cursor: "pointer" }}>Disclaimer</a> | <a href={CONSTANTS.TERMS} target="_blank">Terms and Conditions</a>
                </Grid>
            </Grid>
        </>
    )
}
export default Controls;