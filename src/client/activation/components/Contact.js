import { Grid, Divider, Button } from '@mui/material';
import CONSTANTS from '../../utils/constants';
import '../css/utility.css';

function Contact(props) {
    return (
        <Grid container>
            <Grid xs={9} style={{ margin: "auto", marginTop: "20px", "textAlign": "center", "color": "#666666", "fontSize": ".8em" }}>
                <div>
                    <b>We do not store your credit card information. Please see our <a className="no-underline font-link-blue" href={CONSTANTS.PRIVACY_PAGE}>privacy policy</a>'s. If you have any questions or issues, please email
                        <a className="no-underline font-link-blue" href="mailto:
            tidisventure@gmail.com">{" "}tidisventure@gmail.com{"."}</a>
                    </b>
                </div>
            </Grid>
        </Grid>
    )
}

export default Contact;
