/**
 * Format a number with specified decimal places
 * @param {number|null|undefined} num - The number to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted number or 'N/A' if invalid
 */
export const formatNumber = (num, decimals = 2) => {
    if (num === undefined || num === null || isNaN(num)) return 'N/A';
    return typeof num === 'number' ? num.toFixed(decimals) : String(num);
};

/**
 * Format a large number with appropriate units (K, M, B)
 * @param {number} num - The number to format
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted number with units
 */
export const formatLargeNumber = (num, decimals = 1) => {
    if (num === undefined || num === null || isNaN(num)) return 'N/A';

    const absNum = Math.abs(num);

    if (absNum >= 1e9) {
        return (num / 1e9).toFixed(decimals) + 'B';
    } else if (absNum >= 1e6) {
        return (num / 1e6).toFixed(decimals) + 'M';
    } else if (absNum >= 1e3) {
        return (num / 1e3).toFixed(decimals) + 'K';
    }

    return num.toFixed(decimals);
};

/**
 * Format scientific notation for very small/large numbers
 * @param {number} num - The number to format
 * @param {number} precision - Number of significant digits (default: 3)
 * @returns {string} Scientific notation string
 */
export const formatScientific = (num, precision = 3) => {
    if (num === undefined || num === null || isNaN(num)) return 'N/A';
    return Number(num).toExponential(precision);
}; 