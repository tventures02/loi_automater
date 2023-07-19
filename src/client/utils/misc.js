import CONSTANTS from '../utils/constants';

export function constructHTMLData(data) {
    if (data) {
        return "<div id='mydata_htmlservice' style='display:none;'>" + Utilities.base64Encode(JSON.stringify(data)) + "</div>"
    }
    return '';
}

export function round2NearestHundreth(num) {
    return Math.round(num * 100) / 100;
}

export function generateDataToServer(email, addOnPurchaseTier, appCode, appVariant, preventAddingUserToDb = false) {
    return {
        email,
        addOnPurchaseTier,
        app: appCode,
        preventAddingUserToDb,
        appVariant,
    };
}

export function determineUserFunctionalityFromUserDoc(user) {
    // NONE = has not paid, FULL_FUNC = paid for tier0 (full func) but can upgrade, FULL_FUNC_SUB = full func due to active subscription
    const {
        NONE,
        FULL_FUNC,
        FULL_FUNC_SUB,
    } = CONSTANTS.FUNC_TIERS;
    const stripePaymentMethodsLen = user.stripe_payment_methods.length;
    if (stripePaymentMethodsLen === 1) return NONE;
    else if (stripePaymentMethodsLen > 1 && !user.subscriptionId) {
        return FULL_FUNC;
    }
    else if (user.subscriptionId) return FULL_FUNC_SUB;
}

export function getSubArray(arr, element) {
    var index = arr.indexOf(element);

    if (index !== -1) {
      return arr.slice(index);
    } else {
      return [];
    }
  }

export function isRunningOnClientSide() {
    return typeof (window) !== "undefined";
}

// This function handles Google App script server errors (as seen from the Google cloud platform error reporting) and returns a pertinent message.
export function serverFunctionErrorHandler(errorMsg) {
    let responseMsgObj = {
        text: "Uh oh! Something unexpected happened: " + errorMsg + " Please try to fix the error or contact support at tidisventures@gmail.com.",
        linkText: '',
        link: '',
        errorMsg,
    };

    errorMsg = errorMsg.toLowerCase();
    try {
        if (errorMsg.includes('permission') || errorMsg.includes('authorization')) {
            responseMsgObj = {
                text: "Uh oh! You are experiencing a permissions issue related to being logged into multiple Google accounts. This is a known Google bug and not related to this add-on. Please see ",
                linkText: 'our support page for a fix.',
                link: 'https://tidisventures.com/google-workspace-addon-support',
                errorMsg,
            };
        }
        return responseMsgObj;
    }
    catch (e) {
        return responseMsgObj;
    }

}

export function parseHTMLData() {
    try {
        const dataEncoded = document.getElementById("mydata_htmlservice").innerHTML;
        return JSON.parse(atob(dataEncoded));
    }
    catch (e) {
        return {};
    }
}

