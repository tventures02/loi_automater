import {
    onInstall,
    onOpen,
    showGenTemplate,
    openSidebar,
    showActivationModal,
} from './ui';

import {
    generateTemplateScript,
    getInitData,
    readAndParseSettingsValues,
    readPricesAndAddresses,
    doAna,
    writeToSettings,
    getUserEmail,
} from './sheets';

// Public functions must be exported as named exports
export {
    onInstall,
    onOpen,
    showGenTemplate,
    openSidebar,
    generateTemplateScript,
    getInitData,
    readAndParseSettingsValues,
    readPricesAndAddresses,
    doAna,
    writeToSettings,
    showActivationModal,
    getUserEmail,
};
