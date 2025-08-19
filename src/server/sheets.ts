const CONSTANTS = require('../client/utils/constants.js');

export const getUserEmail = () => {
    // // @ts-ignore
    // console.log(ad)
    return Session.getActiveUser().getEmail(); // requires permissions update in appsscript.json (https://developers.google.com/apps-script/concepts/scopes)       
}

export const getUserData = () => {
    var idToken = ScriptApp.getIdentityToken();
    var body = idToken.split('.')[1];
    var decoded = Utilities.newBlob(Utilities.base64Decode(body)).getDataAsString();
    var payload = JSON.parse(decoded);
    var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
    // Logger.log(payload);
    return {
        email: payload.email,
        aud: payload.aud,
        idToken,
        sheetId,
    }; // requires permissions update in appsscript.json (https://developers.google.com/apps-script/concepts/scopes)
}

export const getInitData = () => {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    // Get all sheets in the spreadsheet
    var sheets = activeSpreadsheet.getSheets();

    // Initialize an empty array to hold the sheet names
    var sheetNames = [];

    // Loop through each sheet and push its name to the array
    for (var i = 0; i < sheets.length; i++) {
        var sheetName = sheets[i].getName();
        if (sheetName !== CONSTANTS.ANA_RESULTS_SHEETNAME &&
            sheetName !== CONSTANTS.SETTINGS_SHEETNAME) {
            sheetNames.push(sheetName);
        }
    }

    var idToken = ScriptApp.getIdentityToken();
    var body = idToken.split('.')[1];
    var decoded = Utilities.newBlob(Utilities.base64Decode(body)).getDataAsString();
    var payload = JSON.parse(decoded);

    return {
        email: Session.getActiveUser().getEmail(), // requires permissions update in appsscript.json (https://developers.google.com/apps-script/concepts/scopes)
        sheetNames,
        idToken,
        aud: payload.aud,
    }
}
