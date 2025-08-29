import * as CONSTANTS from './constants';

export function backendCall(dataToServer, endpoint, idToken = null) {

    let headers = {
        'Content-Type': 'application/json',
    };
    if (!dataToServer.verType) dataToServer.verType = 'idToken';
    if (!dataToServer.source) dataToServer.source = CONSTANTS.APP_SOURCE_CODE;
    if (idToken) {
        headers = {
            ...headers,
            'Access-Control-Allow-Origin': '*', //TODO: remove when deploying
            'Authorization': `Bearer ${idToken}`,
        };
    }

    return fetch(process.env.REACT_APP_TV_BACKEND + endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(dataToServer)
    }).then(function (result) {
        return result.json();
    }).catch((e) => {
        return {
            success: false,
            errorMsg: e.message,
        }
    });
}
