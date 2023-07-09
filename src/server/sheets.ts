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


        tempSheet = sheets[0];
        tempSheet.setName(CONSTANTS.ANA_SHEETNAME);
        tempSheet.getRange(CONSTANTS.HEADERS_RANGE).setValues([CONSTANTS.DEFAULT_LABELS]).setFontWeight('bold');
        tempSheet.setFrozenRows(1);

        // Construct settings sheet
        if (!settingsSheetExists) {
            tempSheet = activeSpreadsheet.insertSheet();
            tempSheet.setName(CONSTANTS.SETTINGS_SHEETNAME);
        }
        activeSpreadsheet.setActiveSheet(activeSpreadsheet.getSheetByName(CONSTANTS.SETTINGS_SHEETNAME));
        tempSheet = SpreadsheetApp.getActiveSheet();
        if (tempSheet) {
            console.log('here')
            tempSheet.setColumnWidth(1, 300);
            const settingsKeys = Object.keys(CONSTANTS.SETTINGS.RANGES);
            const numSettingsCategories = settingsKeys.length;
            for (let i = 0; i < numSettingsCategories; i++) {
                const key = settingsKeys[i];
                const label = CONSTANTS.SETTINGS.LABELS[key];
                tempSheet.getRange(CONSTANTS.SETTINGS.RANGES[key].LABEL).setValue(label).setFontWeight('bold');
                const values = CONSTANTS.SETTINGS[key];
                tempSheet.getRange(CONSTANTS.SETTINGS.RANGES[key].VALUES).setValues(values);
            }
            tempSheet.getRange('A1').setValue(CONSTANTS.SETTINGS_NOTE).setFontColor('red').setFontWeight('bold').setFontSize(12);
        }

        activeSpreadsheet.setActiveSheet(sheets[0]);
        return {
            success: true,
            message: "Successful generation of vocab lists."
        }

    } catch (error) {
        console.log(error)
        return {
            success: false,
            message: error.message,
        }
    }
}