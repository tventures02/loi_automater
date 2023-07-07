import React, { useState, useEffect } from 'react';
import { Button, Grid } from '@mui/material';
// import { Grid, Button } from '@material-ui/core';
// import { backendCall } from '../../utils/server-calls';
// import { amplitudeDataHandler } from "../../utils/amplitude";
// import CONSTANTS from '../../utils/constants';
// import { serverFunctionErrorHandler } from '../../utils/misc';
import { serverFunctions } from '../../utils/serverFunctions';
import LoadingAnimation from '../../utils/LoadingAnimation';

const GenerateTemplate = () => {
    //@ts-ignore
    const closeModal = () => google.script.host.close();
    const [isLoading, setIsLoading] = useState(true);
    const [messages, setMessages] = useState({
        statusMessage: null,
        errorMessage: null,
    });

    useEffect(() => {
        // Send to Amplitude
        try {
            // serverFunctions.getUserEmail().then((email) => {
            //     amplitudeDataHandler(email, {
            //         'eventName': CONSTANTS.AMPLITUDE.GEN_LIST,
            //     }, null);
            // }).catch((e) => {
            //     setMessages({
            //         ...messages,
            //         errorMessage: e.message,
            //     });
            // });
        }
        catch (e) {
            setMessages({
                ...messages,
                errorMessage: e.message,
            });
        }
        setIsLoading(false);
    }, []); // empty arg forces behavior to be like componentDidMount

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
            }}
        >
            {isLoading ? (
                <LoadingAnimation divHeight={'100%'} height={60} width={60} subText={null} />
            ) : (
                <>
                    <Grid container>
                        <Grid item xs={12} style={{ "textAlign": "left", "width": "100%"}}>
                            Generating a template will delete all the sheets in this file. Are you sure you want to continue?
                        </Grid>
                    </Grid>
                    <Grid container style={{ marginTop: "1.5em" }}>
                        <Grid item xs={6} style={{ "width": "100%" }}>
                            <div style={{ width: '50%', margin: 'auto' }}>
                                <Button
                                    style={{ width: '100%', backgroundColor: 'white' }}
                                    size="medium"
                                    color="primary"
                                    //@ts-ignore
                                    onClick={closeModal}
                                >
                                    No
                                </Button>
                            </div>
                        </Grid>
                        <Grid item xs={6} style={{ "width": "100%" }}>
                            <div style={{ width: '50%', margin: 'auto' }}>
                                <Button
                                    style={{ width: '100%' }}
                                    size="medium"
                                    variant="contained"
                                    color="primary"
                                    onClick={() => {
                                        setIsLoading(true);
                                        serverFunctions.generateTemplateScript().then((resp) => {
                                            serverFunctions.openSidebar().then(() => {
                                                closeModal();
                                            }).catch((e) => {
                                                closeModal();
                                            });
                                        }).catch((e) => {
                                            setIsLoading(false);
                                        });
                                    }}>
                                    Yes
                                </Button>
                            </div>
                        </Grid>
                    </Grid>
                </>
            )}

        </div>
    );
};

export default GenerateTemplate;
