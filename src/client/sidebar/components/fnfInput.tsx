import React, { useState, useEffect } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
// import { backendCall } from '../../utils/server-calls';
import { Grid, FormControl, Typography, TextField, FormLabel, Switch, FormControlLabel, Tooltip, Checkbox } from '@mui/material';
import HelpOutline from '@mui/icons-material/HelpOutline';
// import { generateDataToServer } from '../../utils/misc';
import CONSTANTS from '../../utils/constants';
import TextInputs from './textInputs';
import TogglableTextInputs from './togglableTextInputs';
// import { amplitudeDataHandler } from "../../utils/amplitude";

const textFieldStyle = {
    marginTop: "1.6em",
    height: '32px',
    width: '100%',
    backgroundColor: "white",
};
const helpIconStyle = { fontSize: "1rem", color: "gray", paddingLeft: ".25em", cursor: 'pointer' };
const FNFInput = (props: {
    anaSettings: any,
    setAnaSettings: any,
    setFilledOutARVs,
    filledOutARVs: boolean,
}) => {
    const {
        anaSettings,
        setAnaSettings,
        setFilledOutARVs,
        filledOutARVs,
    } = props;

    return (
        <div style={{ marginTop: "1em", paddingBottom: '2em' }}>
            <Grid container style={{ padding: '10px' }}>
                <Grid item xs={12}>
                    <Typography className='header'>Estimates</Typography>
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel control={
                        <Checkbox size="small" onChange={(e) => setFilledOutARVs(e.target.checked)} checked={filledOutARVs} />
                    }
                        style={{ marginTop: "25px" }}
                        label={<b>Fill in "After repair values ($)" (ARV) in column C of spreadsheet.</b>} />
                </Grid>
                {
                    filledOutARVs ?
                        <Grid container>
                            <TextInputs
                                anaMode={''}
                                labels={[CONSTANTS.SETTINGS.FNF[0]]}
                                keys={[CONSTANTS.SETTINGS.ANALYSIS_KEYS.FNF[0]]}
                                textFieldStyle={textFieldStyle}
                                anaSettings={anaSettings}
                                setAnaSettings={setAnaSettings}
                            />

                            <Grid item xs={12} style={{ marginTop: "4em" }}>
                                <Typography className='header'>Purchase Costs</Typography>
                            </Grid>
                            <TextInputs
                                anaMode={''}
                                labels={[CONSTANTS.SETTINGS.FNF[1]]}
                                keys={[CONSTANTS.SETTINGS.ANALYSIS_KEYS.FNF[1]]}
                                textFieldStyle={textFieldStyle}
                                anaSettings={anaSettings}
                                setAnaSettings={setAnaSettings}
                            />

                            <Grid item xs={12} style={{ marginTop: "4em" }}>
                                <Typography className='header'>Rehab Costs</Typography>
                            </Grid>
                            <TextInputs
                                anaMode={''}
                                labels={[CONSTANTS.SETTINGS.FNF[2], CONSTANTS.SETTINGS.FNF[3], CONSTANTS.SETTINGS.FNF[4]]}
                                keys={[CONSTANTS.SETTINGS.ANALYSIS_KEYS.FNF[2], CONSTANTS.SETTINGS.ANALYSIS_KEYS.FNF[3], CONSTANTS.SETTINGS.ANALYSIS_KEYS.FNF[4]]}
                                textFieldStyle={textFieldStyle}
                                anaSettings={anaSettings}
                                setAnaSettings={setAnaSettings}
                            />

                            <Grid item xs={12} style={{ marginTop: "4em" }}>
                                <Typography className='header'>Sale Costs</Typography>
                            </Grid>
                            <TextInputs
                                anaMode={''}
                                labels={[CONSTANTS.SETTINGS.FNF[5], CONSTANTS.SETTINGS.FNF[6]]}
                                keys={[CONSTANTS.SETTINGS.ANALYSIS_KEYS.FNF[5], CONSTANTS.SETTINGS.ANALYSIS_KEYS.FNF[6]]}
                                textFieldStyle={textFieldStyle}
                                anaSettings={anaSettings}
                                setAnaSettings={setAnaSettings}
                            />
                        </Grid>
                        :
                        null
                }

            </Grid>
        </div>
    )
}
export default FNFInput;