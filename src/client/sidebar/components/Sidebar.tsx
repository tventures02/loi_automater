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
import { User } from '../../utils/types';
import StickyHeaderStepper, { Step } from './StickyHeaderStepper';
import StickyFooter from './StickFooter';
import TemplateStepScreen from './TemplateStepScreen';

const errorMsgStyle = { marginBottom: "0.5rem", fontSize: ".75em", color: "red" };

const SidebarContainer = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [docTitle, setDocTitle] = useState('LOI Template');
    const [newDocInfo, setNewDocInfo] = useState({ url: null, id: null });
    const controlsRef = useRef(null);
    const footerRef = useRef(null);
    const [messages, setMessages] = useState({
        trialMessage: 'This free version limits analyzing up to 2 properties at a time.',
        statusMessage: null,
        errorMessage: null,
    });
    const [user, setUser] = useState<User>({
        email: '',
        stripe_payment_methods: [],
        subscriptionId: '',
        subscriptionStatusActive: true,
        addOnPurchaseTier: 'tier0',
        idToken: null,
        _id: '',
        items: {
            loi: {
                docIds: [],
            }
        }
    });
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [currentStep, setCurrentStep] = useState<string>("template");
    const [isWorking, setIsWorking] = useState(false);
    const [canContinue, setCanContinue] = useState(true); // wire to your validation

    // (optional) lock navigation to current & previous only
    const canGo = (target: string, curr: string) => {
        const order = ["template", "map", "pdfs", "send"];
        return order.indexOf(target) <= order.indexOf(curr);
    };

    // (optional) reflect errors/completion (example)
    const steps: Step[] = [
        { key: "template", label: "Template" },
        { key: "map", label: "Map" },
        { key: "pdfs", label: "PDFs" },
        { key: "send", label: "Send" },
    ];
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
                    sendToAmplitude(CONSTANTS.AMPLITUDE.OPEN_SIDEBAR, null, { email: data.email });

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
                    if (!subStatusResp.success) {
                        handleError('Error: Problem getting subscription paid status.');
                        return;
                    }

                    const userHasPaid = subStatusResp.user?.stripe_payment_methods?.length > 1;

                    const localUser = {
                        ...user,
                        ...subStatusResp.user,
                        idToken,
                        subscriptionStatusActive: subStatusResp.subscriptionStatusActive,
                        userHasPaid,
                    };
                    setUser(localUser);
                    console.log(localUser)

                    if (user?.items?.loi?.docIds?.length > 0) {
                        setSelectedTemplate(user?.items?.loi?.docIds[0]);
                    }

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
                finally {
                    setIsLoading(false);
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

    const handleTemplateSelection = (event) => {
        if (event.target.value === 'new') {
            handleCreateDoc();
            return;
        }
        setSelectedTemplate(event.target.value);
        // You can add logic here to act on the selection,
        // for example, load the template's content.
        console.log("Selected Template:", event.target.value);
    };

    // Example CTA labels by step
    const primaryLabelByStep: Record<string, string> = {
        template: "Continue to mapping",
        map: "Generate PDFs",
        pdfs: "Continue to send",
        send: "Send emails",
    };
    const secondaryLabelByStep: Record<string, string> = {
        template: "",
        map: "Back",
        pdfs: "Back",
        send: "Back",
    };

    const handlePrimary = async () => {
        // TODO: implement per-step actions
        setIsWorking(true);
        try {
            // ...your logic
            // setCurrentStep(nextStep);
        } finally {
            setIsWorking(false);
        }
    };

    const handleSecondary = () => {
        const order = ["template", "map", "pdfs", "send"];
        const idx = order.indexOf(currentStep);
        if (idx > 0) setCurrentStep(order[idx - 1]);
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
            <div ref={controlsRef}>
                <StickyHeaderStepper
                    title="LOI Builder"
                    steps={steps}
                    current={currentStep}
                    onStepChange={setCurrentStep}
                    canNavigateToStep={canGo}
                    rightSlot={null}
                />
            </div>




            <div style={{ height: topDivHeight }}>
                {
                    messages.errorMessage ?
                        <Grid xs={12} container style={errorMsgStyle}>
                            {messages.errorMessage}
                        </Grid>
                        :
                        null
                }
                <TemplateStepScreen
                    user={user}
                    selectedTemplate={selectedTemplate}
                    handleTemplateSelection={handleTemplateSelection}
                    handleCreateDoc={handleCreateDoc}
                />
            </div>




            {/* Sticky Footer */}
            <StickyFooter
                ref={footerRef}
                primaryLabel={primaryLabelByStep[currentStep]}
                onPrimary={handlePrimary}
                secondaryLabel={secondaryLabelByStep[currentStep] || undefined}
                onSecondary={secondaryLabelByStep[currentStep] ? handleSecondary : undefined}
                primaryDisabled={!canContinue}
                primaryLoading={isWorking}
                helperText={
                    currentStep === "send"
                        ? "We’ll skip rows without valid emails."
                        : undefined
                }
                leftSlot={
                    currentStep === "pdfs"
                        ? <span>Output: /Drive/LOI Outputs/Today</span>
                        : currentStep === "map"
                            ? <span>4 placeholders · 4 mapped</span>
                            : null
                }
            />
        </div>
    )
}
export default SidebarContainer;