import { Grid, Button, Paper} from "@mui/material";
import { serverFunctions } from './serverFunctions';
import { generatePricingPageUrl } from '../utils/misc';
let alertStyle = { 'marginBottom': '.2em', 'borderRadius': '4px', 'padding': '0.3em 0.3em', 'border': `0px`, 'backgroundColor': '#FFCBCB', 'color': `${CONSTANTS.DARK_RED_BERRY}`, 'fontSize': '.75em', 'alignItems': 'center', 'justifyContent': 'center', 'display': 'flex', 'width': '100%' };
import CONSTANTS from './constants';
const isDev = process.env.REACT_APP_TV_BACKEND.includes('localhost');
function CTA({
    message,
    singleLineCTA,
    styleOverride,
    email = null,
    token = null,
}) {
    const gridStyle = {
        "textAlign": "center", "margin": "auto"
    }
    const handlePricingPageClick = async () => {
        try {
            const url = await generatePricingPageUrl(email, token, serverFunctions.getUserData);
            if (isDev) {
                console.log(url);
                console.log(email)
                console.log(token)
            }
            window.open(url, '_blank');
        } catch (error) {
            if (isDev) console.log(error);
        }
    }

    let msg = message.msg;

    if (!msg) msg = 'Please purchase this add-on to have access to premium features!';
    let CTA = (
        <Button style={{ "margin": "auto", "marginTop": '1em' }}
            size="small"
            variant="contained"
            color="primary"
            onClick={handlePricingPageClick}>See pricing</Button>
    );
    if (singleLineCTA) {
        if (styleOverride) alertStyle = { ...alertStyle, ...styleOverride };
        return (
            <Paper style={alertStyle} variant="outlined">
                <span>
                    {msg} <b><a onClick={handlePricingPageClick} style={{ "cursor": "pointer", "textDecoration": "underline", color: "#1456FF" }}>{CONSTANTS.VIEW_ACT_CTA}</a></b>
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
