import React, { useState, useEffect, useRef } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
import LoadingAnimation from "../../utils/LoadingAnimation";
import { backendCall } from '../../utils/server-calls';
import { Grid, MenuItem, TextField } from '@mui/material';
import CONSTANTS from '../../utils/constants';
import CTAWidget from './CTASideBar';
import { sendToAmplitude } from "../../utils/amplitude";
import { generateDataToServer } from '../../utils/misc';
import { User } from '../../utils/types';
import StickyHeaderStepper, { Step } from './StickyHeaderStepper';
import StickyFooter from './StickFooter';
import TemplateStepScreen from './TemplateStepScreen';
import MappingStepScreen from './MappingStepScreen';
import GenerateStepScreen from './GenerateStepScreen';
import SendStepScreen from './SendStepScreen';

const errorMsgStyle = { marginBottom: "0.5rem", fontSize: ".75em", color: "red" };

const SidebarContainer = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [docTitle, setDocTitle] = useState('LOI Template');
    const headerRef = useRef(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const [messages, setMessages] = useState({
        trialMessage: '',
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
    const [currentStep, setCurrentStep] =
        useState<string>("template");
    const [isWorking, setIsWorking] = useState(false);


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

    const stepOrder = React.useMemo(() => steps.map(s => s.key), [steps]);

    const handlePrimary = async () => {
        setIsWorking(true);
        try {
            setCurrentStep(prev => {
                const idx = stepOrder.indexOf(prev);
                const nextIdx = idx >= 0 ? Math.min(idx + 1, stepOrder.length - 1) : 0;
                return stepOrder[nextIdx];
            });
        } finally {
            setIsWorking(false);
        }
    };


    const handleSecondary = () => {
        const order = ["template", "map", "pdfs", "send"];
        const idx = order.indexOf(currentStep);
        if (idx > 0) setCurrentStep(order[idx - 1] as "template" | "map" | "pdfs" | "send");
    };

    if (isLoading) return (
        <LoadingAnimation divHeight={"90vh"} height={40} width={40} color={null} addStyle={{}} subText={null} />
    )

    let middleHeight = "80vh";
    if (headerRef?.current || footerRef?.current) {
        const h = headerRef.current?.clientHeight ?? 0;
        const f = footerRef.current?.clientHeight ?? 0;
        middleHeight = `calc(100vh - ${h + f}px)`;
    }
    return (
        <div className='container'>
            <div ref={headerRef}>
                <StickyHeaderStepper
                    steps={steps}
                    current={currentStep}
                    onStepChange={(key) => setCurrentStep(key as "template" | "map" | "pdfs" | "send")}
                    rightSlot={
                        <button
                            type="button"
                            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                            onClick={() => window.open('https://support.google.com/docs', '_blank')}
                        >
                            Help
                        </button>

                    }
                />
            </div>


            <div style={{ height: middleHeight }} className='overflow-y-auto p-2'>
                {
                    messages.errorMessage ?
                        <Grid xs={12} container style={errorMsgStyle}>
                            {messages.errorMessage}
                        </Grid>
                        :
                        null
                }
                {currentStep === "template" && (
                    <TemplateStepScreen
                        user={user}
                        selectedTemplate={selectedTemplate}
                        handleError={handleError}
                        setUser={setUser}
                        setSelectedTemplate={setSelectedTemplate}   
                    />
                )}
                {currentStep === "map" && <MappingStepScreen />}
                {currentStep === "pdfs" && <GenerateStepScreen />}
                {currentStep === "send" && <SendStepScreen />}
            </div>


            {/* Sticky Footer */}
            <StickyFooter
                ref={footerRef}
                primaryLabel={primaryLabelByStep[currentStep]}
                onPrimary={handlePrimary}
                secondaryLabel={secondaryLabelByStep[currentStep] || undefined}
                onSecondary={secondaryLabelByStep[currentStep] ? handleSecondary : undefined}
                primaryDisabled={false}
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