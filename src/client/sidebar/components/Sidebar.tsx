import React, { useState, useEffect, useRef } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
import LoadingAnimation from "../../utils/LoadingAnimation";
import { backendCall } from '../../utils/server-calls';
import { Grid, MenuItem, TextField } from '@mui/material';
import CONSTANTS from '../../utils/constants';
import CTAWidget from './CTASideBar';
import {
    PlusIcon,
} from '@heroicons/react/24/outline';   
import { sendToAmplitude } from "../../utils/amplitude";
import { generateDataToServer } from '../../utils/misc';

const errorMsgStyle = { marginBottom: "0.5rem", fontSize: ".75em", color: "red" };

const SidebarContainer = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [docTitle, setDocTitle] = useState('LOI Template');
    const [newDocInfo, setNewDocInfo] = useState({ url: null, id: null });
    const controlsRef = useRef(null);
    const [messages, setMessages] = useState({
        trialMessage: 'This free version limits analyzing up to 2 properties at a time.',
        statusMessage: null,
        errorMessage: null,
    });
    const [user, setUser] = useState({
        email: '',
        subscriptionId: '',
        subscriptionStatusActive: true,
        addOnPurchaseTier: 'tier0',
        idToken: null,
    });
    const [sheet, setSheet] = useState({
        sheetNames: [],
        selectedSheet: '',
    });
    const [config, setConfig] = useState({
        gwsCalcYTURL: 'https://www.youtube.com/watch?v=c0-1-zYiCMU'
    });

    //@ts-ignore
    useEffect(() => {
        try {
            const getData = async () => {
                try {
                    setIsLoading(true);
                    const data = await serverFunctions.getInitData();
                    const {
                        idToken,
                        aud,
                    } = data;
                    sendToAmplitude(CONSTANTS.AMPLITUDE.OPEN_SIDEBAR, null, {email: data.email});
                    setSheet({
                        selectedSheet: data.sheetNames[0] ? data.sheetNames[0] : '',
                        sheetNames: data.sheetNames,
                    });

                    const preventAddingUserToDb = false;
                    const dataToServer = {
                        ...generateDataToServer(
                            data.email,
                            user.addOnPurchaseTier,
                            CONSTANTS.APP_CODE,
                            CONSTANTS.APP_VARIANT,
                            preventAddingUserToDb),
                        clientId: aud,
                    };
                    const subStatusResp = await backendCall(
                        dataToServer,
                        'gworkspace/getSubscriptionPaidStatus',
                        idToken);
                    console.log(subStatusResp)

                    // const functionalityTier = determineUserFunctionalityFromUserDoc(subStatusResp.user);

                    setIsLoading(false);

                    let configObj = await getConfigFromBackend(); // set the html search strings for scraping the page
                    if (configObj) {
                        setConfig({
                            ...config,
                            ...configObj,
                        });
                    }
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

    const getConfigFromBackend = async () => {
        const resp = await backendCall({ app: CONSTANTS.APP_CODE }, 'config/getConfig');
        if (resp.success) return resp.params;
        else return null;
    }

    const handleError = (errorMsg) => {
        setIsLoading(false);
        setMessages({
            ...messages,
            errorMessage: errorMsg + ' Please contact tidisventures@gmail.com.',
        });
    }

    const handleCreateDoc = async () => {
        if (!docTitle.trim()) {
            handleError('Please enter a title for the document.');
            return;
        }
        setIsLoading(true);
        setNewDocInfo({ url: null, id: null }); // Reset previous info
        try {
            // The server function now returns an object { url, id }
            const docData = await serverFunctions.createGoogleDoc(docTitle);
            setNewDocInfo(docData); // Store the entire object in state
        } catch (error) {
            handleError(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return (
        <LoadingAnimation divHeight={"90vh"} height={40} width={40} color={null} addStyle={{}} subText={null} />
    )

    let topDivHeight = '80vh';
    if (controlsRef?.current) {
        topDivHeight = `calc(100vh - ${controlsRef.current.clientHeight}px)`;
    }

    return (
        <div className='container'>
            <div style={{ height: topDivHeight }}>
                {
                    messages.errorMessage ?
                        <Grid xs={12} container style={errorMsgStyle}>
                            {messages.errorMessage}
                        </Grid>
                        :
                        null
                }
                <div ref={controlsRef}>
                    <Grid item xs={12} className='w-full pt-1 flex justify-center'>
                        <div
                            role="button"
                            tabIndex={0} // Makes it focusable
                            onClick={handleCreateDoc} // Your existing function
                            className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors cursor-pointer select-none"
                        >
                            <PlusIcon className="h-5 w-5 pointer-events-none" /> {/* Added pointer-events-none to icon */}
                            <span className="pointer-events-none">New LOI Template</span> {/* Added pointer-events-none to text */}
                        </div>
                    </Grid>
                </div>
            </div>
        </div>
    )
}
export default SidebarContainer;