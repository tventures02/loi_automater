import React, { useState } from 'react';
const isDev = process.env.REACT_APP_TV_BACKEND.includes('localhost');

const CTAWidget = () => {
    const styles = {
        container: {
            maxWidth: '284px',
            backgroundColor: '#007bff', // Appealing blue background
            color: '#fff',
            padding: '10px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontFamily: 'Arial, sans-serif',
            marginTop: '10px',
        },
        headline: {
            fontSize: '1.2em',
            marginBottom: '10px',
            textAlign: 'center',
        },
        subtext: {
            fontSize: '1em',
            marginBottom: '20px',
            textAlign: 'center',
        },
        button: {
            backgroundColor: '#fff',
            color: '#007bff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'background-color 0.3s, color 0.3s',
            textDecoration: 'none',
        },
        buttonHover: {
            backgroundColor: '#e7f3ff', // Lighter blue for hover
            color: '#007bff',
        },
        testimonial: {
            fontSize: '0.9em',
            fontStyle: 'italic',
            marginTop: '15px',
            textAlign: 'center',
        },
    };
    
    // Simple hover effect using state
    const [isHovered, setIsHovered] = useState(false);

    const handlePricingPageClick = async () => {
        try {
            const url = `https://chromewebstore.google.com/detail/z-real-estate-scraper-for/jdidjlghecfpaedabjinjfpdlcioeklo`;
            window.open(url, '_blank');
        } catch (error) {
            if (isDev) console.log(error);
        }
    }

    return (
        // @ts-ignore
        <div style={styles.container}>
            {/* @ts-ignore */}
            <div style={styles.headline}>🚀 Import data from Zillow</div>
            {/* @ts-ignore */}
            <div style={styles.subtext}>
                Get hundreds of property listings from Zillow to analyze with one click directly to your Google Sheets.
            </div>
            <a
                onClick={handlePricingPageClick}
                style={{
                    ...styles.button,
                    ...(isHovered ? styles.buttonHover : {}),
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                Try it now!
            </a>
        </div>
    );
};

export default CTAWidget;
