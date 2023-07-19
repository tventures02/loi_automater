import React from 'react';
const LTRToolTipMsg = () => {
    return (
        <div style={{ fontSize: '1.2em' }}>
            <div>Check below to manually input rents for each property in Column C of the sheet.</div>
            <br /><br />
            <div>If not, monthly rental income here is presented as a percentage of home value to allow for estimating MULTIPLE, differently-priced properties.</div>
            <br /><br />
            <div>This percent is multipled to the home value to estimate the monthly rent and is bound by the min and max rent values.</div>
            <br /><br />
            <div>To use just a single monthly rental income amount, just set the min and max rent values to the same number.</div>
        </div>
    )
}
export default LTRToolTipMsg;