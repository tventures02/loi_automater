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
};
