import React, { useState, useEffect } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
import LoadingAnimation from "../../utils/LoadingAnimation";
// import { backendCall } from '../../utils/server-calls';
import { Grid, Button, MenuItem, TextField } from '@mui/material';
// import { generateDataToServer } from '../../utils/misc';
import CONSTANTS from '../../utils/constants';
import CTA from '../../utils/CTA';
// import { amplitudeDataHandler } from "../../utils/amplitude";

const errorMsgStyle = { marginBottom: "0.5rem", fontSize: ".75em", color: "red" };
const textFieldStyle = {
    marginTop: "1em",
    height: '32px',
    width: '100%',
    backgroundColor: "white",
};
const controlButtonStyle = { width: "100%", marginBottom: "1em" };
const SidebarContainer = () => {
    const [userEmail, setUserEmail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [subscriptionStatusActive, setSubscriptionStatusActive] = useState(false);
    const [addOnPurchaseTier, setPurchaseTier] = useState('tier0');
    const [messages, setMessages] = useState({
        trialMessage: null,
        statusMessage: null,
        errorMessage: null,
    });
    const [anaMode, setAnaMode] = useState('');
    const [user, setUser] = useState({
        subscriptionId: '',
    });

    //@ts-ignore
    useEffect(() => {
        try {
            const getData = async () => {
                try {
                    setIsLoading(true);
                    const email = await serverFunctions.getUserEmail();
                    setUserEmail(email);
                    // const subStatusResp = await getSubscriptionPaidStatus(email);
                    // console.log(subStatusResp)
                    // if (subStatusResp.success) {
                    //     setSubscriptionStatusActive(subStatusResp.subscriptionStatusActive);
                    //     setUser(subStatusResp.user);
                    // }
                    // else {
                    //     setIsLoading(false);
                    //     setMessages({
                    //         ...messages,
                    //         errorMessage: 'Could not retreive data from our servers. You can still use the free version of this add-on. Please contact tidisventures@gmail.com or try refreshing the page.',
                    //     });
                    // }
                    setIsLoading(false);
                } catch (error) {
                    console.log(error)
                    handleError('Error: Problem getting data during mounting.');
                }
            };

            getData();
        }
        catch (e) {
            handleError(e.message);
        }
    }, []);

    const handleError = (errorMsg) => {
        setIsLoading(false);
        setMessages({
            ...messages,
            errorMessage: errorMsg + ' Please contact tidisventures@gmail.com.',
        });
    }

    const controls = (
        <>
            <Button size="small" variant="contained" color="primary" style={controlButtonStyle}
                onClick={() => {
                    console.log('askdfh')
                    // sendToAmplitude(CONSTANTS.AMPLITUDE.LAUNCHED_QUIZ_EDITOR);
                }}
            >Calculate</Button>
        </>
    );

    const renderAnalysisOptions = () => {
        let outputTypesDropdown = [];
        for (let i = 0; i < CONSTANTS.ANALYSIS_MODES.length; i++) {
            outputTypesDropdown.push(
                <MenuItem value={CONSTANTS.ANALYSIS_MODES[i]}
                >{CONSTANTS.ANALYSIS_MODES[i]}</MenuItem>
            )
        }
        return outputTypesDropdown;
    }

    if (isLoading) return (
        <LoadingAnimation divHeight={"90vh"} height={40} width={40} color={null} addStyle={{}} subText={null} />
    )

    return (
        <div className='container'>
            <div className='topDiv'>
                {
                    messages.errorMessage ?
                        <Grid xs={12} container style={errorMsgStyle}>
                            {messages.errorMessage}
                        </Grid>
                        :
                        null
                }
                <Grid xs={12} container style={{ marginBottom: "0.5rem", }}>
                    {
                        !subscriptionStatusActive ?
                            <CTA message={{ msg: messages.trialMessage }} singleLineCTA={true} styleOverride={{ marginBottom: "1em" }} />
                            :
                            null
                    }
                </Grid>
                <Grid xs={12} container style={{ marginBottom: "0.5rem", }}>
                    <TextField
                        className="textfield-day-32px"
                        select
                        id="select-question"
                        size="small"
                        variant="outlined"
                        label="Analysis type"
                        value={anaMode}
                        style={textFieldStyle}
                        onChange={(e) => setAnaMode(e.target.value)}
                    >
                        {renderAnalysisOptions()}
                    </TextField>
                </Grid>


            </div>
            <div className='bottomDiv'>
            <Grid item xs={12}>
                {controls}
            </Grid>
            </div>
        </div>
    )
}
export default SidebarContainer;