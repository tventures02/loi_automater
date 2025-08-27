import CONSTANTS from '../utils/constants';
const isDev = process.env.REACT_APP_TV_BACKEND.includes('localhost');

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
    if (!user || !user.stripe_payment_methods) return NONE;
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


export const generatePricingPageUrl = async (emailIn = '', token = '', getUserData) => {
    const baseUrl = isDev ? 'http://localhost:3000/' : 'https://tidisventures.com/';
    const appSlug = 'z-real-estate-calculator';

    try {
        const tokenIsExpired = !token || !emailIn ? true : checkTokenExpiration(token);
        if (isDev) {
            console.log('generate pricing page link')
            console.log('token has expired: ' + tokenIsExpired);
        }

        if (!tokenIsExpired) {
            return `${baseUrl}purchase/${appSlug}?email=${emailIn}&verType=idToken&token=${token}&appVariant=gwscalc`;
        }

        const {
            email,
            idToken,
        } = await getUserData();

        if (!email || !idToken) return `${baseUrl}purchase/${appSlug}?appVariant=gwscalc`;

        return `${baseUrl}purchase/${appSlug}?email=${email}&verType=idToken&token=${idToken}&appVariant=gwscalc`        
    } catch (error) {
        return `${baseUrl}purchase/${appSlug}?appVariant=gwscalc`;
    }
}

export const returnNewIdTokenIfNecessary = async (token, getUserData) => {
    try {
        const tokenIsExpired = !token ? true : checkTokenExpiration(token);
        if (isDev) {
            console.log('checking idtoken for new generation if needed')
            console.log('token has expired: ' + tokenIsExpired);
        }

        if (!tokenIsExpired) {
            return token;
        }

        const {
            idToken,
        } = await getUserData();

        return idToken;
    } catch (error) {
        return token;
    }
}

function decodeGoogleIdToken(idToken) {
    try {
        // Step 1: Split the token by dots
        const tokenParts = idToken.split('.');

        if (tokenParts.length !== 3) {
            return null
        }

        // Step 2: Decode the payload (the second part)
        const payload = tokenParts[1];
        const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));

        // Step 3: Parse the payload JSON
        const payloadObject = JSON.parse(decodedPayload);
        if (isDev) {
            console.log('decodeGoogleIdToken Func')
            console.log(payloadObject)
        }
        return payloadObject;
    } catch (error) {
        return null;
    }
}

function checkTokenExpiration(idToken) {
    const decodedToken = decodeGoogleIdToken(idToken);
    if (!decodedToken || !decodedToken.exp) return true;

    // The exp value is in seconds since Unix epoch, get the current time in seconds
    const currentTime = Math.floor(Date.now() / 1000);

    // Check if the token is expired
    return decodedToken.exp <= currentTime; // Returns true if expired
}


export const colLabel = (n) => { let s = ''; while (n) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / CONSTANTS.MAX_LETTER_NUMBER); } return s; };