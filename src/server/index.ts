import {
    onInstall,
    onOpen,
    showGenTemplate,
    openSidebar,
} from './ui';

import {
    getSheetsData,
    addSheet,
    deleteSheet,
    setActiveSheet,
    generateTemplateScript,
    getUserEmail,
    readAndParseSettingsValues,
    readPricesAndAddresses,
} from './sheets';

// Public functions must be exported as named exports
export {
    onInstall,
    onOpen,
    showGenTemplate,
    openSidebar,
    getSheetsData,
    addSheet,
    deleteSheet,
    setActiveSheet,
    generateTemplateScript,
    getUserEmail,
    readAndParseSettingsValues,
    readPricesAndAddresses,
};
