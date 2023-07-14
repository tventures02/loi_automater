const CONSTANTS = require('../client/utils/constants.js');

export const getUserEmail = () => {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = activeSpreadsheet.getSheetByName(CONSTANTS.SETTINGS_SHEETNAME);
    if (!settingsSheet) {
        makeSettingsSheet(false, null, activeSpreadsheet);
        let sheets = activeSpreadsheet.getSheets();
        activeSpreadsheet.setActiveSheet(sheets[0]);
    }
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

export const doLTRAna = (
    propertiesSheetData,
    anaSettings,
    anaMode,
    useAmounts,
) => {
    const {
        pricesAndAddressesObj,
        orderedAddresses,
    } = propertiesSheetData;
    console.log(anaSettings)

    let {
        downPaymentP,
        downPaymentD,
        closingCostsD,
        estRepairCostsD,
        otherLenderCostsD,
        loanInterestRateP,
        points,
        loanTermYears,
        propTaxesP,
        propTaxesD,
        homeInsuranceP,
        homeInsuranceD,
        repairsAndMaintP,
        repairsAndMaintD,
        capExP,
        capExD,
        managementFeesP,
        utilitiesD,
        hoaFeesD,
        otherExpensesD,
        rentalIncomeP,
        minRentD,
        maxRentD,
        otherIncomeD,
        vacancyP,
        minNightlyRateD,
        maxNightlyRateD,
        availableDaysPerYearForBooking,
        platformFeeP,
        cleaningCostD,
        cleaningChargeD,
        occupanyRateP,
    } = anaSettings;
    const ONE_HUND = 100;
    const MONTHS_PER_YEAR = 12;
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let anaResultsSheet = activeSpreadsheet.getSheetByName(CONSTANTS.ANA_RESULTS_SHEETNAME);
    activeSpreadsheet.setActiveSheet(anaResultsSheet);
    if (!anaResultsSheet) {
        anaResultsSheet = activeSpreadsheet.insertSheet().setName(CONSTANTS.ANA_RESULTS_SHEETNAME);
        activeSpreadsheet.setActiveSheet(anaResultsSheet);
        anaResultsSheet.setFrozenRows(1);
    }
    const sheets = activeSpreadsheet.getSheets();
    activeSpreadsheet.moveActiveSheet(sheets.length - 1);

    const {
        startCol,
        endCol,
    } = CONSTANTS.ANA_OUTPUT_RANGES.LTR;

    let row = 2;
    for (let iProp = 0; iProp < orderedAddresses.length; iProp++) {
        const {
            price,
            address,
        } = pricesAndAddressesObj[orderedAddresses[iProp]];
        rentalIncomeP = rentalIncomeP ? rentalIncomeP : 0;
        let rentalIncomeD = price * rentalIncomeP / ONE_HUND;
        if (rentalIncomeD > maxRentD) rentalIncomeD = maxRentD;
        if (rentalIncomeD < minRentD) rentalIncomeD = minRentD;
        const capex = useAmounts.capex ? capExD : rentalIncomeD * capExP / ONE_HUND;
        downPaymentP = downPaymentP ? downPaymentP : 0;
        downPaymentD = downPaymentD ? downPaymentD : 0;
        let down = useAmounts.downpayment ? downPaymentD : price * downPaymentP / ONE_HUND;
        propTaxesP = propTaxesP ? propTaxesP : 0;
        let propTax = useAmounts.propTax ? propTaxesD : price * propTaxesP / ONE_HUND;
        homeInsuranceP = homeInsuranceP ? homeInsuranceP : 0;
        let insur = useAmounts.insurance ? homeInsuranceD : price * homeInsuranceP / ONE_HUND;
        repairsAndMaintP = repairsAndMaintP ? repairsAndMaintP : 0;
        const rnm = useAmounts.rnm ? repairsAndMaintD : rentalIncomeD * repairsAndMaintP / ONE_HUND;
        loanInterestRateP = loanInterestRateP ? loanInterestRateP : 0;
        loanTermYears = loanTermYears ? loanTermYears : 30;
        
        //     slope = (maxRent - minRent) / (maxPrice - minPrice);
        //     intercept = maxRent - slope * maxPrice;
        //     rentalIncomeD = slope * price + intercept;

        otherIncomeD = otherIncomeD ? otherIncomeD : 0;
        utilitiesD = utilitiesD ? utilitiesD : 0;
        otherExpensesD = otherExpensesD ? otherExpensesD : 0;
        vacancyP = vacancyP ? vacancyP : 0;
        closingCostsD = closingCostsD ? closingCostsD : 0;
        managementFeesP = managementFeesP ? managementFeesP : 0;
        otherLenderCostsD = otherLenderCostsD ? otherLenderCostsD : 0;
        estRepairCostsD = estRepairCostsD ? estRepairCostsD : 0;

        anaResultsSheet.getRange(startCol + row + ':' + endCol + row)
            .setFormulas([[
                `=${down}`, // downpayment in dollars (F)
                `=F${row}/A${row}`, // downpayment in decimal (G)
                `=A${row}-F${row}`, // principal (H)
                `=${points ? points : 0}`, //(I)
                `=${loanInterestRateP / ONE_HUND}`, // loan interest rate in decimal (J)
                `=${loanTermYears}`, // (K)
                `=H${row}*(J${row}/${MONTHS_PER_YEAR})/(1-POW(1+(J${row}/${MONTHS_PER_YEAR}),-(K${row}*${MONTHS_PER_YEAR})))`, // (L) monthly PnI
                `=${rentalIncomeD}`, //(M)
                `=${otherIncomeD}`, //(N)
                `=${propTax}`, // (O)
                `=${insur}`, // (P)
                `=${rnm}`, // (Q)
                `=${hoaFeesD ? hoaFeesD : 0}`, // (R)
                `=${capex}`, // (S)
                `=${utilitiesD}+${otherExpensesD}+M${row}*${managementFeesP}/${ONE_HUND}`, //(T)
                `=O${row}/${MONTHS_PER_YEAR}+P${row}/${MONTHS_PER_YEAR}+Q${row}+R${row}+T${row}`, // (U)
                `=${vacancyP / ONE_HUND}`, //(V) vacancy %
                `=M${row}*(1-V${row})+N${row}-U${row}`, //(W) monthly noi
                `=U${row}+S${row}+L${row}`, // (X) total monthly expenses (U+capex+pni)
                `=M${row}*(1-V${row})+N${row}-X${row}`, // (Y) cash flow
                `=F${row}+${closingCostsD}+I${row}*H${row}/${ONE_HUND}+${estRepairCostsD}+${otherLenderCostsD}`, //(Z) total investment
                `=Y${row}*${MONTHS_PER_YEAR}/Z${row}`, //(AA) cash on cash return in decimal
                `=W${row}*${MONTHS_PER_YEAR}/A${row}`, //(AB) cap rate
            ]]);
            anaResultsSheet.getRange(`E${row}`).setValue([anaMode]);

            //Set price and address
            anaResultsSheet.getRange(`A${row}`).setValue([price]);
            anaResultsSheet.getRange(`B${row}`).setValue([address]);
        row++
    }
    anaResultsSheet.getRange(`A1:${endCol}1`).setValues([
        [
            'Price',
            'Address',
            '',
            '',
            'Analysis type',
            'Down payment ($)',
            'Down payment (%)',
            'Principal ($)',
            'Points',
            'Loan interest rate (%)',
            'Loan term (years)',
            'Monthly PI payment ($)',
            'Monthly rental revenue ($)',
            'Other monthly revenue ($)',
            'Annual property tax ($)',
            'Home insurance ($)',
            'Monthly repairs & maint. ($)',
            'Monthly HOA fees ($)',
            'Monthly Cap Ex ($)',
            'Other monthly operating expenses ($)',
            'Total monthly op. expenses ($)',
            'Vacancy (%)',
            'Monthly net operating income ($)',
            'Total monthly expenses ($)',
            'Monthly cash flow ($)',
            'Total initial investment ($)',
            'Annual cash-on-cash return (%)',
            'Cap rate (%)']
    ]).setFontWeight('bold').setFontSize(12);

    anaResultsSheet.getRange(`A1:B1`).setFontSize(12);

    const percentCols = ['G', 'J', 'V', 'AA', 'AB'];
    for (let i = 0; i < percentCols.length; i++) {
        anaResultsSheet.getRange(`${percentCols[i]}:${percentCols[i]}`).setNumberFormat("0.0%");
    }

    const fiatCols = ['A','F', 'H', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z'];
    for (let i = 0; i < fiatCols.length; i++) {
        anaResultsSheet.getRange(`${fiatCols[i]}:${fiatCols[i]}`).setNumberFormat("$###,###,##0");
    }

    // Get the number of columns in the sheet
    const numColumns = anaResultsSheet.getLastColumn();

    // Auto resize all columns
    for (let i = 3; i <= numColumns; i++) {
        anaResultsSheet.autoResizeColumn(i);
    }

    // Clear all conditional formatting rules in the sheet
    anaResultsSheet.clearConditionalFormatRules();

    // Get the range for column A
    const metricCols = ['AA', 'AB'];

    // Set the conditional formatting rules
    var rules = anaResultsSheet.getConditionalFormatRules();
    for (let i = 0; i < metricCols.length; i++) {
        const range = anaResultsSheet.getRange(`${metricCols[i]}2:${metricCols[i]}`);

        // Get the rule builder
        let ruleBuilder = SpreadsheetApp.newConditionalFormatRule();
        let rule = ruleBuilder
            .whenNumberLessThan(0)
            .setBackground("#cc4125")
            .setRanges([range])
            .build();
        rules.push(rule);

        rule = ruleBuilder.setGradientMaxpoint("#38761d").setGradientMinpoint('#ffffff')
            .setRanges([range])
            .build();
        rules.push(rule);
    }
    anaResultsSheet.setConditionalFormatRules(rules);
}


export const readAndParseSettingsValues = () => {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = activeSpreadsheet.getSheetByName(CONSTANTS.SETTINGS_SHEETNAME);
    const val = settingsSheet
        .getRange(CONSTANTS.SETTINGS.VALUES_RANGE).getValues();

    // Setting the sheet values to an object with the variable of the setting as the key
    // ie {
    //    downPaymentP: val[0][0],
    //    downPaymentD: val[1][0],
    //    ...
    // }
    let settingsValues = {};
    let iSetting = 0;
    const settingsKeysOrdered = CONSTANTS.SETTINGS.ORDERED_KEYS;
    const numSettingsCategories = settingsKeysOrdered.length;
    for (let i = 0; i < numSettingsCategories; i++) {
        const settingsVariables = CONSTANTS.SETTINGS.ANALYSIS_KEYS[settingsKeysOrdered[i]];
        for (let j = 0; j < settingsVariables.length; j++) {
            settingsValues[settingsVariables[j]] = val[iSetting][0];
            iSetting++;
        }
        iSetting += 2;
    }
    // console.log(settingsValues)
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
        tempSheet.getRange(CONSTANTS.HEADERS_RANGE).setValues([CONSTANTS.DEFAULT_LABELS]).setFontWeight('bold').setFontSize(12);
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