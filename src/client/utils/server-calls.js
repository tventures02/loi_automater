export function backendCall(dataToServer, endpoint) {
    return fetch(process.env.REACT_APP_TV_BACKEND + endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
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

