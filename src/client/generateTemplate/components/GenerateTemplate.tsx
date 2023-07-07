import React, { useState, useEffect } from 'react';
// import { Grid, Button } from '@material-ui/core';
// import { backendCall } from '../../utils/server-calls';
// import { amplitudeDataHandler } from "../../utils/amplitude";
// import CONSTANTS from '../../utils/constants';
// import { serverFunctionErrorHandler } from '../../utils/misc';
// import LoadingAnimation from '../../utils/LoadingAnimation';

const GenerateTemplate = () => {
    //@ts-ignore
    const closeModal = () => google.script.host.close();
    const [isLoading, setIsLoading] = useState(true);
    const [flashcardData, setFlashcardData] = useState(null);
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
            hello

        </div>
    );
};

export default GenerateTemplate;
