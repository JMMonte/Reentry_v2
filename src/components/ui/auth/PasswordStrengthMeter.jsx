import React from 'react';
import PropTypes from 'prop-types';

export function getPasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (password.length >= 12) score++;
    if (score <= 1) return { label: 'Weak', color: '#e53e3e', width: '33%' };
    if (score === 2 || score === 3) return { label: 'Medium', color: '#d69e2e', width: '66%' };
    return { label: 'Strong', color: '#38a169', width: '100%' };
}

export function PasswordStrengthMeter({ password }) {
    if (!password) return <div style={{ height: 18, marginTop: 2, marginBottom: 2 }} />;
    const { label, color, width } = getPasswordStrength(password);
    return (
        <div style={{ marginTop: 2, marginBottom: 2 }}>
            <div style={{ height: 6, width: '100%', background: '#222', borderRadius: 4, marginBottom: 3 }}>
                <div style={{ height: 6, width, background: color, borderRadius: 4, transition: 'width 0.3s, background 0.3s' }} />
            </div>
            <span style={{ color, fontSize: 12, fontWeight: 500 }}>Password strength: {label}</span>
        </div>
    );
}
PasswordStrengthMeter.propTypes = {
    password: PropTypes.string.isRequired
}; 