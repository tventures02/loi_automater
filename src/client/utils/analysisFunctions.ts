import CONSTANTS from './constants';
import { round2NearestHundreth } from './misc';

export function analyzeLTR(propertiesSheetData, anaSettings, anaMode) {
    try {
        const {
            pricesAndAddressesObj,
            orderedAddresses,
        } = propertiesSheetData;

        const {
            downPaymentP,
            downPaymentD,
            closingCostsD,
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
            rentalIncomeD,
            otherIncomeD,
            vacancyP,
        } = anaSettings;
        const ONE_HUND = 100;
        const MONTHS_PER_YEAR = 12;
    
        let anaOutput = {};
        let anaSheetOutput = []; // what gets written to the sheet
        for (let iProp = 0; iProp < orderedAddresses.length; iProp++) {
    
            const vacancy = rentalIncomeD * vacancyP / ONE_HUND;
            const rnm = repairsAndMaintD ? repairsAndMaintD : rentalIncomeD * repairsAndMaintP / ONE_HUND;
            const capex = capExD ? capExD : rentalIncomeD * capExP / ONE_HUND;
            const management = rentalIncomeD * managementFeesP / ONE_HUND;
            const price = pricesAndAddressesObj[orderedAddresses[iProp]].price;
            let down = downPaymentD ? downPaymentD : price * downPaymentP / ONE_HUND;
            const P = price - down; //principal
            const pointsAmount = P * points / ONE_HUND;
            const r = loanInterestRateP / MONTHS_PER_YEAR / ONE_HUND;
            const N = loanTermYears * MONTHS_PER_YEAR;
            let monthlyPnI = P * r / (1 - Math.pow(1 + r, -N));
    
            const balance = P;
            let propTax = propTaxesD ? propTaxesD : price * propTaxesP / ONE_HUND;
            propTax *= 1 / MONTHS_PER_YEAR;
            let insur = homeInsuranceD ? homeInsuranceD : price * homeInsuranceP / ONE_HUND;
            insur *= 1 / MONTHS_PER_YEAR;
            let totalOperatingExpenses = propTax + insur + hoaFeesD + rnm + vacancy + management + utilitiesD + otherExpensesD;
            let totalIncome =  rentalIncomeD + otherIncomeD;
            let monthlyNOI = totalIncome - totalOperatingExpenses;
            let totalExpenses = totalOperatingExpenses + capex + monthlyPnI;
            let cashFlow = monthlyNOI - totalExpenses;
            let totalInvestment = down + closingCostsD + pointsAmount;
            let cashOnCashReturn = 0;
            if (totalInvestment != 0) {
                cashOnCashReturn = (cashFlow * MONTHS_PER_YEAR) / totalInvestment;
            }
            else {
                cashOnCashReturn = 0;
            }
            cashOnCashReturn = round2NearestHundreth(cashOnCashReturn * ONE_HUND);
            const capRate = round2NearestHundreth(monthlyNOI * ONE_HUND * MONTHS_PER_YEAR / price); //cap rate in percent
            down = round2NearestHundreth(down);
            let percentDown = round2NearestHundreth(down * ONE_HUND / price);
            let principal = round2NearestHundreth(P);

            monthlyPnI = round2NearestHundreth(monthlyPnI);
            totalIncome = round2NearestHundreth(totalIncome);
            totalOperatingExpenses = round2NearestHundreth(totalOperatingExpenses);
            monthlyNOI = round2NearestHundreth(monthlyNOI); // no principal and interest, no capex
            totalExpenses = round2NearestHundreth(totalExpenses);
            cashFlow = round2NearestHundreth(cashFlow); // taking everything into account
            totalInvestment = round2NearestHundreth(totalInvestment);

            anaOutput[orderedAddresses[iProp]] = {
                down,
                percentDown,
                principal,
                loanInterestRateP,
                loanTermYears,
                monthlyPnI,
                totalIncome,
                totalOperatingExpenses,
                monthlyNOI, // no principal and interest, no capex
                totalExpenses,
                cashFlow, // taking everything into account
                totalInvestment,
                cashOnCashReturn,
                capRate,
            };

            anaSheetOutput.push([
                anaMode,
                down,
                percentDown,
                principal,
                loanInterestRateP,
                loanTermYears,
                monthlyPnI,
                totalIncome,
                totalOperatingExpenses,
                monthlyNOI, // no principal and interest, no capex
                totalExpenses,
                cashFlow, // taking everything into account
                totalInvestment,
                cashOnCashReturn,
                capRate,
            ]);
        }
console.log(anaOutput)
        return anaSheetOutput;
    } catch (error) {
        console.log(error)
        return null;
    }

}