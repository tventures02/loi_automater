import React, { useState, useEffect, useRef } from 'react';
import { serverFunctions } from '../../utils/serverFunctions';
import LoadingAnimation from "../../utils/LoadingAnimation";
import { backendCall } from '../../utils/server-calls';
import { Grid } from '@mui/material';
import CONSTANTS from '../../utils/constants';
import CTAWidget from './CTASideBar';
import { sendToAmplitude } from "../../utils/amplitude";
import { generateDataToServer } from '../../utils/misc';
import { User } from '../../utils/types';
import StickyHeaderStepper, { Step } from './StickyHeaderStepper';
import StickyFooter from './StickFooter';
import TemplateStepScreen from './TemplateStepScreen';
import MappingStepScreen from './MappingStepScreen';
import GenerateLOIsStepScreen from './GenerateLOIsStepScreen';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { DocInfo } from 'src/server/docs';
import SendCenterScreen from './SendCenterScreen';
import SendCenterSetup from './SendCenterSetup';

const errorMsgStyle = { marginBottom: "0.5rem", fontSize: ".75em", color: "red" };
const isDev = process.env.NODE_ENV.toLowerCase().includes('dev');

const SidebarContainer = () => {
    const [mode, setMode] = useState<"build" | "send">("build");
    const [isLoading, setIsLoading] = useState(true);

    // State for template step
    const [isGettingTemplates, setIsGettingTemplates] = useState(true);
    const [templates, setTemplates] = useState<DocInfo[]>([]);
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const [draft, setDraft] = useState<string>('');
    const [templateContent, setTemplateContent] = useState('');

    // States for mapping step
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [canContinue, setCanContinue] = useState({
        template: false,
        map: false,
        lois: false,
        send: false,
    });

    const [queueReady, setQueueReady] = useState<boolean>(false);
    const [creatingQueue, setCreatingQueue] = useState<boolean>(false);
    const [queueError, setQueueError] = useState<string | null>(null);

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
    const [currentStep, setCurrentStep] = useState<string>("template");
    const [isWorking, setIsWorking] = useState(false);

    const [headerHeight, setHeaderHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);

    // (optional) reflect errors/completion (example)
    const steps: Step[] = [
        { key: "template", label: "Template" },
        { key: "map", label: "Map" },
        { key: "lois", label: "LOIs" },
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
                    if (isDev) console.log(localUser)

                    if (localUser?.items?.loi?.docIds?.length > 0) {
                        setSelectedTemplate(localUser?.items?.loi?.docIds[0]);
                    }

                    let configObj = await getConfigFromBackend(); // set the html search strings for scraping the page
                    if (configObj) {
                        setConfig({
                            ...config,
                            ...configObj,
                        });
                    }

                    await getTemplates(localUser);
                } catch (error) {
                    console.log(error)
                    handleError('Error: Problem getting data during mounting.');
                }
                finally {
                    setIsLoading(false);
                    try {
                        const queueExists = await serverFunctions.queueExists();
                        if (queueExists) {
                            setQueueReady(true);
                        }
                    } catch (error) {}
                }
            };

            const getTemplates = async (user: User) => {
                try {
                    setIsGettingTemplates(true);
                    const docInfos = await serverFunctions.getGoogleDocNamesByIds(user?.items?.loi?.docIds);
                    if (isDev) console.log("docInfos", docInfos);

                    const validDocs = docInfos.filter(doc => doc.name).map(doc => ({ id: doc.id, name: doc.name }));
                    const invalidDocIds = docInfos.filter(doc => doc.error).map(doc => doc.id);

                    if (isDev) console.log("validDocs", validDocs);
                    if (isDev) console.log("invalidDocIds", invalidDocIds);

                    setTemplates(validDocs); // Show valid docs immediately
                    // If nothing selected yet, default to first
                    if (!selectedTemplate && validDocs.length > 0) {
                        setSelectedTemplate(validDocs[0].id);
                        fetchTemplateContent(validDocs[0].id);
                    }

                    // 3. If any are invalid, tell the backend to remove them
                    if (invalidDocIds.length > 0) {
                        if (isDev) console.log("Syncing: removing invalid IDs:", invalidDocIds);
                        const dataToServer = {
                            email: user.email,
                            user,
                            invalidDocIds,
                            verType: 'idToken',
                            source: CONSTANTS.APP_SOURCE,
                            app: CONSTANTS.APP_CODE,
                        }
                        await backendCall(dataToServer, 'loiApi/syncDocTemplates', user.idToken);
                    }
                } catch (err: any) {
                    handleError(err?.message || 'Error loading templates.');
                } finally {
                    setIsGettingTemplates(false);
                }
            }

            getData();
        }
        catch (e) {
            handleError(e.message);
        }
    }, []);

    const fetchTemplateContent = async (docId: string) => {
        if (!docId) {
            setTemplateContent('');
            setDraft('');
            return;
        }

        setIsLoadingContent(true);
        try {
            let text = await serverFunctions.getGoogleDocPlainText(docId);
            if (!text) {
                handleError('Error: Problem fetching template content. Please try again.');
                return;
            }
            text = text.trim().replace(/\n/, '');
            const templateContent_ = text || '';
            setTemplateContent(templateContent_);
            setDraft(templateContent_);
            if (templateContent_) {
                setCanContinue({ ...canContinue, template: true });
            }
        } catch (err: any) {
            handleError(err?.message || 'Error fetching template content.');
            setTemplateContent('');
            setDraft('');
        } finally {
            setIsLoadingContent(false);
        }
    };

    useEffect(() => {
        if (templateContent) {
            setCanContinue({ ...canContinue, template: true });
        }
    }, [templateContent]);

    useEffect(() => {
        setHeaderHeight(headerRef.current?.clientHeight ?? 0);
        setFooterHeight(footerRef.current?.clientHeight ?? 0);
    }, [mode, headerRef?.current, footerRef?.current]);

    useEffect(() => {
        if (mode !== "send") return;
        serverFunctions.queueExists?.()
            .then((exists: boolean) => {
                setQueueReady(!!exists);
            })
            .catch(() => setQueueReady(false));
    }, [mode]);

    // create on demand
    const ensureQueue = async () => {
        setCreatingQueue(true);
        setQueueError(null);
        try {
            const resp = await serverFunctions.queueEnsureSheet();
            if (!resp.name) {
                setQueueError("Could not create queue.");
            } else {
                setQueueReady(true);
            }
        } catch (e: any) {
            setQueueError(e?.message || "Could not create queue.");
        } finally {
            setCreatingQueue(false);
        }
    };

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
        map: "Continue to LOIs",
        lois: "Continue to send",
        send: "Send emails",
    };
    const secondaryLabelByStep: Record<string, string> = {
        template: "",
        map: "Back",
        lois: "Back",
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
        const order = ["template", "map", "lois", "send"];
        const idx = order.indexOf(currentStep);
        if (idx > 0) setCurrentStep(order[idx - 1] as "template" | "map" | "lois" | "send");
    };

    if (isLoading) return (
        <LoadingAnimation divHeight={"90vh"} height={40} width={40} color={null} addStyle={{}} subText={null} />
    )

    const middleHeight = `calc(100vh - ${headerHeight + footerHeight}px)`;

    console.log('sidebar render')

    return (
        < div className='container' >
            {/* Header */}
            < div ref={headerRef} >
                {mode === "build" ? (
                    <StickyHeaderStepper
                        steps={steps}
                        current={currentStep}
                        onStepChange={(key) => setCurrentStep(key as "template" | "map" | "lois" | "send")}
                        rightSlot={
                            <div className="flex items-center gap-2">
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setMode("send")}
                                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                                >
                                    Open Send Center
                                </div>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                                    onClick={() => window.open('https://support.google.com/docs', '_blank')}
                                >
                                    Help
                                </div>
                            </div>
                        }
                    />
                ) : (
                    // Minimal header bar for Send Center
                    <div className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
                        <div className="flex items-center justify-between px-3 py-2">
                            <div className="text-sm font-semibold text-gray-900">Send Center</div>
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setMode("build")}
                                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer"
                            >
                                Back to Builder
                            </div>
                        </div>
                    </div>
                )
                }
            </div >

            {/* Body */}
            < div style={{ height: middleHeight }} className='overflow-y-auto p-2 overflow-x-hidden' >
                {
                    messages.errorMessage ? (
                        <Grid xs={12} container style={errorMsgStyle}>
                            {messages.errorMessage}{" "}
                            <button onClick={() => setMessages({ ...messages, errorMessage: null })}>
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        </Grid>
                    ) : null
                }

                {/* Main content */}
                {mode === "send" && !queueReady ? (
                    <SendCenterSetup creating={creatingQueue} error={queueError} onCreate={ensureQueue} />
                ) : mode === "send" ? (
                    <SendCenterScreen />
                ) : (
                    <>
                        {currentStep === "template" && (
                            <TemplateStepScreen
                                user={user}
                                selectedTemplate={selectedTemplate}
                                handleError={handleError}
                                setUser={setUser}
                                setSelectedTemplate={setSelectedTemplate}
                                templateContent={templateContent}
                                setTemplateContent={setTemplateContent}
                                templates={templates}
                                setTemplates={setTemplates}
                                isGettingTemplates={isGettingTemplates}
                                isLoadingContent={isLoadingContent}
                                fetchTemplateContent={fetchTemplateContent}
                                draft={draft}
                                setDraft={setDraft}
                            />
                        )}

                        {currentStep === "map" && (
                            <MappingStepScreen
                                templateContent={templateContent}
                                initialMapping={mapping}
                                onMappingChange={setMapping}
                                onValidChange={(key, ok) => setCanContinue({ ...canContinue, [key]: ok })}
                            />
                        )}

                        {currentStep === "lois" && (
                            <GenerateLOIsStepScreen
                                mapping={mapping}
                                templateDocId={selectedTemplate}
                                templateContent={templateContent}
                                setCanContinue={setCanContinue}
                                canContinue={canContinue}
                                setQueueReady={setQueueReady}
                            />
                        )}

                        {currentStep === "send" && (
                            <SendCenterScreen />
                        )}
                    </>
                )}

            </div >

            {/* Footer only in Build mode */}
            {
                mode === "build" && (
                    <StickyFooter
                        ref={footerRef}
                        primaryLabel={primaryLabelByStep[currentStep]}
                        onPrimary={handlePrimary}
                        secondaryLabel={secondaryLabelByStep[currentStep] || undefined}
                        onSecondary={secondaryLabelByStep[currentStep] ? handleSecondary : undefined}
                        primaryDisabled={!canContinue[currentStep]}
                        primaryLoading={isWorking}
                        helperText={currentStep === "send" ? "We’ll skip rows without valid emails." : undefined}
                        leftSlot={null}
                        currentStep={currentStep}
                    />
                )
            }
        </div >
    )
}
export default SidebarContainer;