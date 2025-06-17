import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

export function getPasswordStrength(password) {
    if (!password) return { score: 0, label: 'Enter a password' };

    let score = 0;

    // Length check
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Character variety checks
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    return { score, label: labels[Math.min(score, labels.length - 1)] };
}

export const PasswordStrengthMeter = React.memo(function PasswordStrengthMeter({ password }) {
    // Memoized password strength calculation
    const strength = useMemo(() => getPasswordStrength(password), [password]);

    // Memoized color calculation
    const color = useMemo(() => {
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a', '#15803d'];
        return colors[Math.min(strength.score, colors.length - 1)];
    }, [strength.score]);

    // Memoized width calculation
    const width = useMemo(() => `${(strength.score / 5) * 100}%`, [strength.score]);

    return (
        <div className="mt-2">
            <div className="flex justify-between text-xs mb-1">
                <span>Password strength</span>
                <span style={{ color }}>{strength.label}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ width, backgroundColor: color }}
                />
            </div>
        </div>
    );
});

PasswordStrengthMeter.propTypes = {
    password: PropTypes.string.isRequired,
}; 