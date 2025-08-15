// @ts-ignore
import React, { useState } from 'react';
import { generatePricingPageUrl } from '../../utils/misc';
import LoadingAnimation from '../../utils/LoadingAnimation';
import { serverFunctions } from '../../utils/serverFunctions';

const styles = {
    container: {
        textAlign: 'center' as 'center',
        padding: '50px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        maxWidth: '500px',
        margin: 'auto',
    },
    header: {
        color: '#333',
        marginBottom: '20px',
    },
    paragraph: {
        color: '#555',
        fontSize: '16px',
        lineHeight: '1.6',
        marginBottom: '30px',
        textAlign: 'start',
    },
    button: {
        backgroundColor: '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        padding: '10px 20px',
        fontSize: '18px',
        cursor: 'pointer',
        outline: 'none',
    }
};

const PricingPageModal = ({ title, copy, ctaText }) => {
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        try {
            setLoading(true);
            const url = `https://chromewebstore.google.com/detail/z-real-estate-scraper-for/jdidjlghecfpaedabjinjfpdlcioeklo`;
            window.open(url, '_blank');
        } catch (e) {
        }
        setLoading(false);
    }

    if (loading) return <LoadingAnimation />

    return (
        <div style={styles.container}>
            <h1 style={styles.header}>🚀 Import data from Zillow</h1>
            {/* @ts-ignore */}
            <p style={styles.paragraph}>
                Get hundreds of property listings from Zillow to analyze with one click directly to your Google Sheets.
            </p>
            <button
                style={styles.button}
                onClick={handleClick}>
                Try it now!
            </button>
        </div>
    );
};

export default PricingPageModal;
