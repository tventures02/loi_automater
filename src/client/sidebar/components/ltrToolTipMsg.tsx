import React from 'react';
const LTRToolTipMsg = (props) => {
    const text = props.userHasPaid ? 'If not, m' : 'M';
    return (
        <div style={{ fontSize: '1.2em' }}>
            {
                props.userHasPaid ?
                    <>
                        <div>Check below to manually input rents for each property in Column C of the sheet.</div>
                        <br /><br />
                    </>
                    :
                    null
            }
            <div>{text}onthly rental income here is presented as a percentage of home value to allow for estimating MULTIPLE, differently-priced properties.</div>
            <br /><br />
            <div>This percent is multipled to the home value to estimate the monthly rent and is bound by the min and max rent values.</div>
            <br /><br />
            <div>To use just a single monthly rental income amount, just set the min and max rent values to the same number.</div>
        </div>
    )
}
export default LTRToolTipMsg;