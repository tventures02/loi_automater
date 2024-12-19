import amplitude from 'amplitude-js';
import CONSTANTS from './constants';
import { determineUserFunctionalityFromUserDoc } from './misc';

export const initAmplitude = () => {
    amplitude.getInstance().init(process.env.REACT_APP_AMPLITUDE_API_KEY);
};

export const setAmplitudeUserId = email => {
    amplitude.getInstance().setUserId(email);
};

export const sendAmplitudeData = (eventType, eventProperties) => {
    amplitude.getInstance().logEvent(eventType, eventProperties);
};

export const setAmplitudeUserData = userProperties => {
    amplitude.getInstance().setUserProperties(userProperties)
};

export const amplitudeDataHandler = async (userEmail = false, amplitudeData, userHasPaid) => {
    try {
        initAmplitude();
        if (userEmail !== false && userEmail) setAmplitudeUserId(userEmail);
        setAmplitudeUserData({ 'addOnPurchased': userHasPaid });
        sendAmplitudeData(amplitudeData.eventName, amplitudeData.eventProperties);
    } catch (e) {
        console.log(e);
    }
};

export const sendToAmplitude = (eventName, eventProperties = null, user) => {
    // Send to Amplitude
    try {
        let dataToAmp = {
            eventName,
            eventProperties: null,
        };
        if (eventProperties) {
            dataToAmp.eventProperties = eventProperties;
        }

        amplitudeDataHandler(user.email, dataToAmp, false);
    }
    catch (e) { }
}