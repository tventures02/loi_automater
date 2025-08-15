import React from 'react';
const STRToolTipMsg = (props) => {
    const text = props.userHasPaid ? 'If not, t' : 'T';
    return (
        <div style={{ fontSize: '1.2em' }}>
            {
                props.userHasPaid || true ?
                    <>
                        <div>Check below to manually input nightly rates for each property in Column C of the sheet.</div>
                        <br /><br />
                    </>
                    :
                    null
            }
            <div>{text}he min and max nightly rate incomes presented here allow for estimating MULTIPLE, differently-priced properties.</div>
            <br /><br />
            <div>The min and max rates are applied to the lowest and highest priced properties for sale. The rates for the properties in between the min and max prices are scaled accordingly. </div>
            <br /><br />
            <div>To use just a single nightly rate, just set the min and max values to the same number.</div>
        </div>
    )
}
export default STRToolTipMsg;