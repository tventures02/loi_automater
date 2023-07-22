const CONSTANTS = require('../client/utils/constants.js');
const {
    NONE,
    FULL_FUNC,
    FULL_FUNC_SUB,
} = CONSTANTS.FUNC_TIERS;

export const getUserEmail = () => {
    // // @ts-ignore
    // console.log(ad)
    return Session.getActiveUser().getEmail(); // requires permissions update in appsscript.json (https://developers.google.com/apps-script/concepts/scopes)       
}

export const getInitData = () => {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = activeSpreadsheet.getSheetByName(CONSTANTS.SETTINGS_SHEETNAME);
    if (!settingsSheet) {
        makeSettingsSheet(false, null, activeSpreadsheet);
        let sheets = activeSpreadsheet.getSheets();
        activeSpreadsheet.setActiveSheet(sheets[0]);
    }

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

    return {
        email: Session.getActiveUser().getEmail(), // requires permissions update in appsscript.json (https://developers.google.com/apps-script/concepts/scopes)
        sheetNames,
    }
}

export const readPricesAndAddresses = (selectedSheet, anaMode: string, useAmounts) => {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const anaSheet = activeSpreadsheet.getSheetByName(selectedSheet);
    let lastRow = anaSheet.getLastRow();
    if (lastRow > 1000 ) lastRow = 1000;
    const values = anaSheet
        .getRange(`A2:B${lastRow}`).getValues();
    let pricesAndAddressesObj = {};
    let orderedAddresses = [];
    const fnfAna = anaMode === CONSTANTS.ANALYSIS_MODES[3];
    let arvs = [];
    let arvsRaw = null;
    let rentsFromSheet = [];
    let rentsFromSheetRaw = null;
    if (fnfAna) {
        arvsRaw = anaSheet.getRange(`C2:C${lastRow}`).getValues();
    }
    if (useAmounts.colCRents) {
        rentsFromSheetRaw = anaSheet.getRange(`C2:C${lastRow}`).getValues();
    }
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
            if (fnfAna) {
                arvs.push(arvsRaw[i][0]);
            }
            if (useAmounts.colCRents) {
                rentsFromSheet.push(rentsFromSheetRaw[i][0]);
            }
        }
    }
    return {
        pricesAndAddressesObj,
        orderedAddresses,
        arvs,
        rentsFromSheet,
    }
}

export const doAna = (
    propertiesSheetData,
    anaSettings,
    anaMode,
    useAmounts,
    functionalityTier,
) => {
    const {
        pricesAndAddressesObj,
        orderedAddresses,
        arvs,
        rentsFromSheet,
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
        avgStayDuration,
        desiredProfitD,
        purchaseClosingCostD,
        repairCostsD,
        holdingCostsD,
        holdingTimeMonths,
        agentCommissionP,
        fnfSaleClosingCostsD,
    } = anaSettings;
    const ONE_HUND = 100;
    const MONTHS_PER_YEAR = 12;
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let anaResultsSheet = activeSpreadsheet.getSheetByName(CONSTANTS.ANA_RESULTS_SHEETNAME);
    if (!anaResultsSheet) {
        anaResultsSheet = activeSpreadsheet.insertSheet().setName(CONSTANTS.ANA_RESULTS_SHEETNAME);
        activeSpreadsheet.setActiveSheet(anaResultsSheet);
        anaResultsSheet.setFrozenRows(1);
    }
    activeSpreadsheet.setActiveSheet(anaResultsSheet);
    const sheets = activeSpreadsheet.getSheets();
    activeSpreadsheet.moveActiveSheet(sheets.length - 1);
    // Get the range of all cells in the sheet
    anaResultsSheet.getDataRange().setNumberFormat('General');
    anaResultsSheet.clear();

    let {
        startCol,
        endCol,
    } = CONSTANTS.ANA_OUTPUT_RANGES.LTR;

    const userHasNotPaid = functionalityTier === NONE;
    const numProperties = userHasNotPaid ? 2 : orderedAddresses.length;
    if (userHasNotPaid) useAmounts.colCRents = false;

    let slope = 0;
    let intercept = 0;
    let minPrice = 999999999999;
    let maxPrice = 0;
    if (anaMode === CONSTANTS.ANALYSIS_MODES[2]) {
        for (let iProp = 0; iProp < numProperties; iProp++) {
            const {
                price,
            } = pricesAndAddressesObj[orderedAddresses[iProp]];
            if (price > maxPrice) maxPrice = price;
            if (price < minPrice) minPrice = price;
        }
        if (maxPrice !== minPrice) {
            slope = (maxNightlyRateD - minNightlyRateD) / (maxPrice - minPrice);
            intercept = maxNightlyRateD - slope * maxPrice;
        }
        else {
            intercept = (maxNightlyRateD + minNightlyRateD) / 2;
        }
    }

    let row = 2;
    for (let iProp = 0; iProp < numProperties; iProp++) {
        const {
            price,
            address,
        } = pricesAndAddressesObj[orderedAddresses[iProp]];
        rentalIncomeP = rentalIncomeP ? rentalIncomeP : 0;
        let rentalIncomeD = price * rentalIncomeP / ONE_HUND;
        if (rentalIncomeD > maxRentD) rentalIncomeD = maxRentD;
        if (rentalIncomeD < minRentD) rentalIncomeD = minRentD;

        if (useAmounts.colCRents) {
            rentalIncomeD = rentsFromSheet[iProp];
        }
        rentalIncomeD = Math.round(rentalIncomeD);
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

        otherIncomeD = otherIncomeD ? otherIncomeD : 0;
        utilitiesD = utilitiesD ? utilitiesD : 0;
        otherExpensesD = otherExpensesD ? otherExpensesD : 0;
        vacancyP = vacancyP ? vacancyP : 0;
        closingCostsD = closingCostsD ? closingCostsD : 0;
        managementFeesP = managementFeesP ? managementFeesP : 0;
        otherLenderCostsD = otherLenderCostsD ? otherLenderCostsD : 0;
        estRepairCostsD = estRepairCostsD ? estRepairCostsD : 0;

        let commonCalcs = [
            `=${down}`, // downpayment in dollars (F)
            `=F${row}/A${row}`, // downpayment in decimal (G)
            `=A${row}-F${row}`, // principal (H)
            `=${points ? points : 0}`, //(I)
            `=${loanInterestRateP / ONE_HUND}`, // loan interest rate in decimal (J)
            `=${loanTermYears}`, // (K)
            `=H${row}*(J${row}/${MONTHS_PER_YEAR})/(1-POW(1+(J${row}/${MONTHS_PER_YEAR}),-(K${row}*${MONTHS_PER_YEAR})))`, // (L) monthly PnI
        ];

        const commonExps = [
            `=${propTax}`,
            `=${insur}`,
        ];

        let calcs = [];
        switch (anaMode) {
            case CONSTANTS.ANALYSIS_MODES[1]:
                calcs = [
                    `=${rentalIncomeD}`, //(M)
                    `=${otherIncomeD}`, //(N)
                    ...commonExps, // O & P
                    `=${rnm}`, // (Q)
                    `=${hoaFeesD ? hoaFeesD : 0}`, // (R)
                    `=${capex}`, // (S) 
                    `=${utilitiesD}+${otherExpensesD}+M${row}*${managementFeesP}/${ONE_HUND}`, //(T)
                    `=O${row}/${MONTHS_PER_YEAR}+P${row}/${MONTHS_PER_YEAR}+Q${row}+R${row}+S${row}+T${row}`, // (U) propTax + insur +rnm + hoa + capex+ other expenses summed
                    `=${vacancyP / ONE_HUND}`, //(V) vacancy %
                    `=M${row}*(1-V${row})+N${row}-U${row}`, //(W) monthly noi
                    `=U${row}+L${row}`, // (X) total monthly expenses (U+pni)
                    `=M${row}*(1-V${row})+N${row}-X${row}`, // (Y) cash flow
                    `=F${row}+${closingCostsD}+I${row}*H${row}/${ONE_HUND}+${estRepairCostsD}+${otherLenderCostsD}`, //(Z) total investment
                    `=Y${row}*${MONTHS_PER_YEAR}/Z${row}`, //(AA) cash on cash return in decimal
                    `=W${row}*${MONTHS_PER_YEAR}/A${row}`, //(AB) cap rate
                ];
                break;
            case CONSTANTS.ANALYSIS_MODES[2]:
                let resultantNightlyRate = Math.round(slope * price + intercept);
                if (useAmounts.colCRents) {
                    resultantNightlyRate = rentsFromSheet[iProp];
                }
                startCol = CONSTANTS.ANA_OUTPUT_RANGES.STR.startCol;
                endCol = CONSTANTS.ANA_OUTPUT_RANGES.STR.endCol;
                calcs = [
                    `=${resultantNightlyRate}`, //(M)
                    `=${availableDaysPerYearForBooking}`, //(N)
                    `=${occupanyRateP / ONE_HUND}`, //(O)
                    `=${platformFeeP / ONE_HUND}`, //(P)
                    `=${cleaningChargeD}`, //(Q)
                    `=${avgStayDuration}`, //(R)
                    `=FLOOR(N${row}*O${row})`, //(S) nights booked
                    `=FLOOR(S${row}/R${row})`, //(T) # of annual bookings
                    `=T${row}*R${row}`, //(U) actual nights paid for per year
                    `=U${row}*M${row}+Q${row}*T${row}`, //(V) total annual rev
                    // Expenses
                    `=${cleaningCostD}`, //(W) cleaning cost per booking
                    `=W${row}*T${row}`, //(X) total annual cleaning costs
                    `=V${row}*P${row}`, //(Y) approx annual fees paid to platform
                    ...commonExps, // (Z & AA)
                    `=${rnm}`, // (AB) $
                    `=${hoaFeesD ? hoaFeesD : 0}`, // (AC) $
                    `=${capex}`, // (AD) $
                    `=V${row}*${managementFeesP}/${ONE_HUND}`, // (AE) annual management fees
                    `=(${utilitiesD}+${otherExpensesD})*${MONTHS_PER_YEAR}`, // (AF) other annual expenses
                    `=X${row}+Y${row}+Z${row}+AA${row}+(AB${row}+AC${row}+AD${row})*${MONTHS_PER_YEAR}+AE${row}+AF${row}`, // (AG) total annual operating expenses
                    // Metrics
                    `=V${row}-AG${row}`, //(AH) annual noi
                    `=AG${row}+L${row}*${MONTHS_PER_YEAR}`, // (AI) total annual expenses (AG+pni)
                    `=V${row}-AI${row}`, // (AJ) annual cash flow
                    `=F${row}+${closingCostsD}+I${row}*H${row}/${ONE_HUND}+${estRepairCostsD}+${otherLenderCostsD}`, //(AK) total investment
                    `=AJ${row}/AK${row}`, //(AL) annual cash on cash return in decimal
                    `=AH${row}/A${row}`, //(AM) cap rate
                ];
                break;
            case CONSTANTS.ANALYSIS_MODES[3]:
                commonCalcs = [];
                startCol = CONSTANTS.ANA_OUTPUT_RANGES.FNF.startCol;
                endCol = CONSTANTS.ANA_OUTPUT_RANGES.FNF.endCol;
                calcs = [
                    `=${arvs[iProp]}`, //(C)
                    ``, //(D)
                    ``, //(E)
                    `=${purchaseClosingCostD}`, //(F)
                    `=${repairCostsD}`, //(G)
                    `=${holdingCostsD}`, //(H) per month
                    `=${holdingTimeMonths}`, //(I)
                    `=H${row}*I${row}`, //(J) total holding costs
                    `=${fnfSaleClosingCostsD}`, //(K)
                    `=${agentCommissionP}/${ONE_HUND}`, //(L) percent
                    `=C${row}*L${row}`, //(M) // real estate agent sale fees
                    `=${desiredProfitD}`, //(N) desired profit
                    `=F${row}+G${row}+J${row}+K${row}+M${row}`, //(O) total costs
                    `=C${row}-O${row}-N${row}`, //(P) maximum purchase price (arv - total costs - desired profit)
                    `=O${row}+P${row}`, //(Q) total investment
                    `=IF(P${row}>0,P${row}/A${row},0)`, //(R) max purchase price to sale price ratio
                    `=IF(P${row}>0,N${row}/Q${row},0)`, //(S) immediate ROI based on no loans or leverage
                    `=C${row}-F${row}-G${row}-K${row}-M${row}-H${row}*45/31-P${row}`, //(T) profit if sold at 45 days
                    `=C${row}-F${row}-G${row}-K${row}-M${row}-H${row}*90/31-P${row}`, //(U) profit if sold at 45 days
                    `=C${row}-F${row}-G${row}-K${row}-M${row}-H${row}*270/31-P${row}`, //(V) profit if sold at 45 days
                ];

                break;
            default:
                break;
        }

        anaResultsSheet.getRange(startCol + row + ':' + endCol + row)
            .setFormulas([[
                ...commonCalcs,
                ...calcs,
            ]]);
        anaResultsSheet.getRange(`E${row}`).setValue([anaMode]);

        //Set price and address
        anaResultsSheet.getRange(`A${row}`).setValue([price]);
        anaResultsSheet.getRange(`B${row}`).setValue([address]);
        row++
    }

    const commonHeaders = [
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
    ];

    switch (anaMode) {
        case CONSTANTS.ANALYSIS_MODES[1]:
            anaResultsSheet.getRange(`A1:${endCol}1`).setValues([
                [
                    ...commonHeaders,
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
            let percentCols = ['G', 'J', 'V', 'AA', 'AB'];
            for (let i = 0; i < percentCols.length; i++) {
                anaResultsSheet.getRange(`${percentCols[i]}:${percentCols[i]}`).setNumberFormat("0.0%");
            }
        
            let fiatCols = ['A', 'F', 'H', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z'];
            for (let i = 0; i < fiatCols.length; i++) {
                anaResultsSheet.getRange(`${fiatCols[i]}:${fiatCols[i]}`).setNumberFormat("$###,###,##0");
            }
            break;
        case CONSTANTS.ANALYSIS_MODES[2]:
            anaResultsSheet.getRange(`A1:${endCol}1`).setValues([
                [
                    ...commonHeaders,
                    'Nightly rate charged ($)',
                    'Available nights for booking per year',
                    'Occupancy rate (%)',
                    'Platform fee (%)',
                    'Cleaning charge per booking ($)',
                    'Average stay duration (nights)',
                    'Nights booked per year',
                    'Number of annual bookings',
                    'Actual nights booked per year',
                    'Total annual revenue ($)',
                    'Cleaning cost per booking ($)',
                    'Annual cleaning costs ($)',
                    'Est. annual platform fees ($)',
                    'Annual property tax ($)',
                    'Home insurance ($)',
                    'Monthly repairs & maint. ($)',
                    'Monthly HOA fees ($)',
                    'Monthly Cap Ex ($)',
                    'Est. annual management fees ($)',
                    'Other annual expenses ($)',
                    'Total annual op. expenses ($)',
                    'Annual net operating income ($)',
                    'Total annual expenses ($)',
                    'Annual cash flow ($)',
                    'Total initial investment ($)',
                    'Annual cash-on-cash return (%)',
                    'Cap rate (%)']
            ]).setFontWeight('bold').setFontSize(12);
            percentCols = ['G', 'J', 'O', 'P', 'AL', 'AM'];
            for (let i = 0; i < percentCols.length; i++) {
                anaResultsSheet.getRange(`${percentCols[i]}:${percentCols[i]}`).setNumberFormat("0.0%");
            }

            fiatCols = ['A', 'F', 'H', 'L', 'M', 'Q', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK',];
            for (let i = 0; i < fiatCols.length; i++) {
                anaResultsSheet.getRange(`${fiatCols[i]}:${fiatCols[i]}`).setNumberFormat("$###,###,##0");
            }
            break;

        case CONSTANTS.ANALYSIS_MODES[3]:
            anaResultsSheet.getRange(`A1:${endCol}1`).setValues([
                [
                    'Price',
                    'Address',
                    'After repair value ($)', //C
                    '',
                    'Analysis type',
                    'Purchase closing costs ($)', //F
                    'Est. rehab costs ($)', //G
                    'Monthly holding costs ($/month)', // H
                    'Total holding time (months)',
                    'Total holding costs ($)', //J
                    'Sale closing costs ($)', // K
                    'Real estate agent fees at sale (%)', //L
                    'Agent fees at sale ($)', //M
                    'Desired profit ($)', //N
                    'Total expenses ($)', //O
                    'Max. allowable offer ($)',//P
                    'Total investment ($)',//Q
                    'Max. allowable offer to sale price ratio', //R
                    'ROI at time of sale (%)', //S
                    'Profit if sold in 45 days ($)', //T
                    'Profit if sold in 90 days ($)', //U
                    'Profit if sold in 270 days ($)',//V

                ]
            ]).setFontWeight('bold').setFontSize(12);

            percentCols = ['L', 'S'];
            for (let i = 0; i < percentCols.length; i++) {
                anaResultsSheet.getRange(`${percentCols[i]}:${percentCols[i]}`).setNumberFormat("0.0%");
            }

            fiatCols = ['A', 'C', 'F', 'G', 'H', 'J', 'K', 'M', 'N', 'O', 'P', 'T', 'U', 'V', 'Q'];
            for (let i = 0; i < fiatCols.length; i++) {
                anaResultsSheet.getRange(`${fiatCols[i]}:${fiatCols[i]}`).setNumberFormat("$###,###,##0");
            }
            break;
        default:
            break;

    }

    anaResultsSheet.getRange(`A1:B1`).setFontSize(12);

    // Get the number of columns in the sheet
    const numColumns = anaResultsSheet.getLastColumn();

    // Auto resize all columns
    for (let i = 3; i <= numColumns; i++) {
        anaResultsSheet.autoResizeColumn(i);
    }

    // Clear all conditional formatting rules in the sheet
    anaResultsSheet.clearConditionalFormatRules();

    row++;
    anaResultsSheet.getRange(`A${row}`).setFontSize(8).setFontColor("#980000").setValue(CONSTANTS.DISCLAIMER);

    if (anaMode === CONSTANTS.ANALYSIS_MODES[3]) return;

    // Get the range for column A
    let metricCols = ['AA', 'AB'];
    if (anaMode === CONSTANTS.ANALYSIS_MODES[2]) {
        metricCols = ['AL', 'AM'];
    }

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

    // Settings sheet stuff
    let tempSheet = activeSpreadsheet.getSheetByName(CONSTANTS.SETTINGS_SHEETNAME);
    if (!tempSheet) {
        makeSettingsSheet(false, tempSheet, activeSpreadsheet);
    }

    activeSpreadsheet.setActiveSheet(anaResultsSheet);
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

    const flags = settingsSheet
        .getRange(CONSTANTS.SETTINGS.FLAG_RANGES).getValues();
    const useAmountFlags = {
        downpayment: flags[0][0],
        propTax: flags[1][0],
        insurance: flags[2][0],
        rnm: flags[3][0],
        capex: flags[4][0],
        colCRents: flags[5][0],
    }

    return {
        settingsValues,
        useAmountFlags,
    }
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
        tempSheet.getRange(CONSTANTS.SETTINGS.FLAG_LABEL_RANGES).setValues([['Use downpayment $ amount'],['Use property tax $ amount'],['Use insurance $ amount'],['Use repairs/maintanence $ amount'],['Use capex $ amount'],['Manually input rent']]);
        tempSheet.getRange(CONSTANTS.SETTINGS.FLAG_RANGES).setValues([['FALSE'],['FALSE'],['FALSE'],['FALSE'],['FALSE'],['FALSE']]);
    }
}

export function writeToSettings(anaSettings, useAmounts) {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const settingsSheet = activeSpreadsheet.getSheetByName(CONSTANTS.SETTINGS_SHEETNAME);
    let row = 3;
    const orderedKeys = CONSTANTS.SETTINGS.ORDERED_KEYS;
    for (let i = 0; i < orderedKeys.length; i++) {

        const settingsVariables = CONSTANTS.SETTINGS.ANALYSIS_KEYS[orderedKeys[i]];
        for (let j = 0; j < settingsVariables.length; j++) {
            settingsSheet.getRange(`B${row}`).setValue([anaSettings[settingsVariables[j]]]);
            row++;
        }
        row += 2;
    }

    let useAmountFlags = [['FALSE'],['FALSE'],['FALSE'],['FALSE'],['FALSE'],];
    useAmountFlags[0] = [useAmounts.downpayment ? 'TRUE' : 'FALSE'];
    useAmountFlags[1] = [useAmounts.propTax ? 'TRUE' : 'FALSE'];
    useAmountFlags[2] = [useAmounts.insurance ? 'TRUE' : 'FALSE'];
    useAmountFlags[3] = [useAmounts.rnm ? 'TRUE' : 'FALSE'];
    useAmountFlags[4] = [useAmounts.capex ? 'TRUE' : 'FALSE'];
    useAmountFlags[5] = [useAmounts.colCRents ? 'TRUE' : 'FALSE'];
    settingsSheet.getRange(CONSTANTS.SETTINGS.FLAG_RANGES).setValues(useAmountFlags);
}