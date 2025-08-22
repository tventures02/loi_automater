import {
    onInstall,
    onOpen,
    showGenTemplate,
    openSidebar,
    showActivationModal,
} from './ui';

import {
    getUserEmail,
    getUserData,
    getInitData,
} from './sheets';

import {
    createGoogleDoc,
    getGoogleDocNamesByIds,
    getGoogleDocPlainText,
    getPreviewRowValues,
    preflightGenerateLOIs,
    generateLOIsAndWriteSheet,
    queueEnsureSheet,
    queueExists,
    getSendSummary,
    sendNextBatch,
    queueList,
    queueStatus,
    getSheetNames,
    getActiveSheetName,
    queueClearAll,
} from './docs';

// Public functions must be exported as named exports
export {
    onInstall,
    onOpen,
    showGenTemplate,    
    openSidebar,
    createGoogleDoc,
    showActivationModal,
    getUserEmail,
    getUserData,
    getInitData,
    getGoogleDocNamesByIds,
    getGoogleDocPlainText,
    getPreviewRowValues,
    preflightGenerateLOIs,
    generateLOIsAndWriteSheet,
    queueEnsureSheet,
    queueExists,
    getSendSummary,
    sendNextBatch,
    queueList,
    queueStatus,
    getSheetNames,
    getActiveSheetName,
    queueClearAll,
};
