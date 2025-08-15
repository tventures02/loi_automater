import React from 'react';
import Loader from "react-loader-spinner";
const LoadingAnimation = ({ divHeight, height, width, color, addStyle, subText }) => {
    let divHeight_ = divHeight ? divHeight : "100vh";
    let height_ = height ? height : 50;
    let width_ = width ? width : 50;
    let color_ = color ? color : 'green';

    let loadingStyle = { "width": "100%", "height": divHeight_, "display": "flex" };
    if (addStyle) {
        loadingStyle = { ...loadingStyle, ...addStyle };
    }
    return (
        <div style={loadingStyle}>
            <Loader
                color={color_}
                type="Oval"
                height={height_}
                width={width_}
                style={{ "margin": "auto" }}
            />
            {subText ?
                <div style={{ "fontSize": ".9em" }}>{subText}</div> : null
            }
        </div>
    )
};

export default LoadingAnimation;
