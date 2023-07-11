import { Grid, Button, Paper } from "@mui/material";
import { serverFunctions } from './serverFunctions';
let alertStyle = { 'marginBottom': '.1em', 'borderRadius': '4px', 'padding': '0.3em 0 0.3em 0', 'border': `0px`, 'backgroundColor': CONSTANTS.LIGHT_RED_BERRY, 'color': `${CONSTANTS.DARK_RED_BERRY}`, 'fontSize': '.75em', 'alignItems': 'center', 'justifyContent': 'center', 'display': 'flex', 'width': '100%' };
import CONSTANTS from './constants';

const linkStyle = { "cursor": "pointer", "textDecoration": "underline", "color": "blue", fontWeight: "bold" }
function CTA({ message, singleLineCTA, styleOverride, ctaText = null }) {
    const gridStyle = {
        "textAlign": "center", "margin": "auto"
    }

    let msg = message.msg;

    if (!msg) msg = 'Please purchase this add-on to have access to premium features!';
    let CTA = (
        <Button style={{ "margin": "auto", "marginTop": '1em' }}
            size="small"
            variant="contained"
            color="primary"
            onClick={() => {
                // serverFunctions.showActivationModal()
            }
            }>See pricing</Button>
    );
    if (singleLineCTA) {
        if (styleOverride) alertStyle = { ...alertStyle, ...styleOverride };
        return (
            <Paper style={alertStyle} variant="outlined">
                <span>
                    {msg} <b><a onClick={() => {
                        // serverFunctions.showActivationModal()
                    }
                    } style={linkStyle}>
                        {ctaText ? ctaText : CONSTANTS.VIEW_ACT_CTA}
                    </a></b>
                </span>
            </Paper>
        )
    }
    return (
        <Grid container>
            <Grid xs={12} style={gridStyle}>
                {msg}
            </Grid>
            <Grid xs={12} style={gridStyle}>
                {CTA}
            </Grid>
        </Grid>
    )

}

export default CTA;
