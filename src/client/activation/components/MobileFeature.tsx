import Check from "@mui/icons-material/Check";
import React from "react";
// import { sendToAmplitude } from "../../utils/amplitude";
import CONSTANTS from '../../utils/constants';

function MobileFeature({email}) {
    const spanStyle = { "fontSize": ".75em", "display": "flex", "alignItems": "center" };
    return (
        <div style={{ marginTop: "10px" }}>
            <div style={{ "display": "flex", paddingBottom: ".35em" }}>
                <Check style={{ "fontSize": "1.2rem", "marginBottom": ".2em" }} />
                <span style={spanStyle}>
                    Unlimited, ad-free use of the Flashcard Lab mobile app forever
                </span>
            </div>
            {/* https://play.google.com/intl/en_us/badges/ */}
            <div style={{ textAlign: "center" }}>
                <a onClick={() => {
                    // sendToAmplitude(CONSTANTS.AMPLITUDE.CLICKED_MOBILE_LINK, {}, email, false)
                }
            }
                    href='https://play.google.com/store/apps/details?id=com.tidisventures.flashcardlabmobile&pcampaignid=pcampaignidMKT-Other-global-all-co-prtnr-py-PartBadge-Mar2515-1'>
                    <img alt='Get it on Google Play' src='https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png' style={{ width: '13.2em' }} /></a>
            </div>
        </div>
    )
}

export default MobileFeature;