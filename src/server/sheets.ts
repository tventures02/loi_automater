const CONSTANTS = require('../client/utils/constants.js');

const getSheets = () => SpreadsheetApp.getActive().getSheets();

const getActiveSheetName = () => SpreadsheetApp.getActive().getSheetName();

export const getSheetsData = () => {
  const activeSheetName = getActiveSheetName();
  return getSheets().map((sheet, index) => {
    const name = sheet.getName();
    return {
      name,
      index,
      isActive: name === activeSheetName,
    };
  });
};

export const addSheet = (sheetTitle) => {
  SpreadsheetApp.getActive().insertSheet(sheetTitle);
  return getSheetsData();
};

export const deleteSheet = (sheetIndex) => {
  const sheets = getSheets();
  SpreadsheetApp.getActive().deleteSheet(sheets[sheetIndex]);
  return getSheetsData();
};

export const setActiveSheet = (sheetName) => {
  SpreadsheetApp.getActive().getSheetByName(sheetName).activate();
  return getSheetsData();
};

export const getUserEmail = () => {
    return Session.getActiveUser().getEmail(); // requires permissions update in appsscript.json (https://developers.google.com/apps-script/concepts/scopes)
}

export const readPricesAndAddresses = () => {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const anaSheet = activeSpreadsheet.getSheetByName(CONSTANTS.ANA_SHEETNAME);
    const values = anaSheet
        .getRange('A2:B101').getValues();
    let pricesAndAddressesObj = {};
    let orderedAddresses = [];
    for (let i = 0; i < values.length; i++) {
        const priceFloat = parseFloat(values[i][0]);
        const address = values[i][1];
        if (address && priceFloat) {
            pricesAndAddressesObj[address] = {
                price: priceFloat,
                address,
                index: i,
            };
            orderedAddresses.push(address);
        }
    }
    return {
        pricesAndAddressesObj,
        orderedAddresses
    }
}

export const outputAnaResults = (anaSheetOutput) => {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const anaSheet = activeSpreadsheet.getSheetByName(CONSTANTS.ANA_SHEETNAME);
    const dataLen = anaSheetOutput.length;
    console.log(anaSheetOutput)
    anaSheet.getRange(`E2:S${dataLen + 1}`).setValues(anaSheetOutput);
    anaSheet.getRange(`E1:S1`).setValues([
        ['Analysis type',
        'Down payment ($)',
        'Down payment (%)',
        'Principal ($)',
        'Loan interest rate (%)',
        'Loan term (years)',
        'Monthly PI payment ($)',
        'Total monthly revenue ($)',
        'Total monthly op. expenses ($)',
        'Monthly net operating income ($)',
        'Total monthly expenses ($)',
        'Monthly cash flow ($)',
        'Total initial investment ($)',
        'Annual cash on cash return (%)',
        'Cap rate (%)']
    ]).setFontWeight('bold');
}


export const readAndParseSettingsValues = () => {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = activeSpreadsheet.getSheetByName(CONSTANTS.SETTINGS_SHEETNAME);
    const values = settingsSheet
        .getRange(CONSTANTS.SETTINGS.VALUES_RANGE).getValues();
    const settingsValues = {
        downPaymentP: values[0][0], downPaymentD: values[1][0], closingCostsD: values[2][0],
        loanInterestRateP: values[5][0], points: values[6][0], loanTermYears: values[7][0],
        propTaxesP: values[10][0], propTaxesD: values[11][0],
        homeInsuranceP: values[12][0], homeInsuranceD: values[13][0],
        repairsAndMaintP: values[14][0], repairsAndMaintD: values[15][0],
        capExP: values[16][0], capExD: values[17][0],
        managementFeesP: values[18][0],
        utilitiesD: values[19][0],
        hoaFeesD: values[20][0],
        otherExpensesD: values[21][0],
        rentalIncomeD: values[24][0], otherIncomeD: values[25][0], vacancyP: values[26][0],
        nightlyRateD: values[29][0], availableDaysPerYearForBooking: values[30][0], platformFeeP: values[31][0], cleaningCostD: values[32][0], cleaningChargeD: values[33][0], occupanyRateP: values[34][0],
        annualIncomeGrowthP: values[37][0], annualExpGrowthP: values[38][0]
    };
    const keys = Object.keys(settingsValues);
    for (let i = 0; i < keys.length; i++) {
        if (settingsValues[keys[i]] === '') settingsValues[keys[i]] = null;              
    }
    return settingsValues;
}

export const generateTemplateScript = () => {
    try {
        const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

        // Delete all spreadsheets and insert one
        let tempSheet = activeSpreadsheet.insertSheet();
        activeSpreadsheet.setActiveSheet(tempSheet);
        activeSpreadsheet.moveActiveSheet(0);
        let sheets = activeSpreadsheet.getSheets();
        let settingsSheetExists = false;
        if (sheets.length > 1) {
            for (let i = sheets.length - 1; i > 0; i--) {
                if (sheets[i].getName() == CONSTANTS.SETTINGS_SHEETNAME) {
                    settingsSheetExists = true;
                }
                else activeSpreadsheet.deleteSheet(sheets[i]);
            }
        }
        sheets[0].setName("Sheet1");

        makeSettingsSheet(settingsSheetExists, tempSheet, activeSpreadsheet);

        tempSheet = sheets[0];
        tempSheet.setName(CONSTANTS.ANA_SHEETNAME);
        tempSheet.getRange(CONSTANTS.HEADERS_RANGE).setValues([CONSTANTS.DEFAULT_LABELS]).setFontWeight('bold');
        tempSheet.setFrozenRows(1);

        activeSpreadsheet.setActiveSheet(sheets[0]);
        return {
            success: true,
            message: "Successfully generated template."
        }

    } catch (error) {
        console.log(error)
        return {
            success: false,
            message: error.message,
        }
    }
}

export const makeSettingsSheet = (settingsSheetExists, tempSheet, activeSpreadsheet) => {
            // Construct settings sheet
            if (!settingsSheetExists) {
                tempSheet = activeSpreadsheet.insertSheet();
                tempSheet.setName(CONSTANTS.SETTINGS_SHEETNAME);
            }
            activeSpreadsheet.setActiveSheet(activeSpreadsheet.getSheetByName(CONSTANTS.SETTINGS_SHEETNAME));
            tempSheet = SpreadsheetApp.getActiveSheet();
            if (tempSheet) {
                tempSheet.setColumnWidth(1, 370);
                const settingsKeys = Object.keys(CONSTANTS.SETTINGS.LABELS);
                const numSettingsCategories = settingsKeys.length;
                let row = 2;
                for (let i = 0; i < numSettingsCategories; i++) {
                    const key = settingsKeys[i];
                    tempSheet.getRange(`A${row}`).setValue(CONSTANTS.SETTINGS.LABELS[key]).setFontWeight('bold');
                    row++
                    const labels = CONSTANTS.SETTINGS[key];
                    const endRow = labels.length + row - 1;
                    const labelsRange = `A${row}:A${endRow}`;
                    tempSheet.getRange(labelsRange).setValues(labels);

                    const values = CONSTANTS.SETTINGS.VALUES[key];
                    const valuesRange = `B${row}:B${endRow}`;
                    tempSheet.getRange(valuesRange).setValues(values);
                    row = endRow + 2;
                }
                tempSheet.getRange('A1').setValue(CONSTANTS.SETTINGS_NOTE).setFontColor('red').setFontWeight('bold').setFontSize(12);
            }
}