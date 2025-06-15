/**
 * MathUtils - Pure mathematical utility functions
 * 
 * Provides common mathematical operations without any dependency on Three.js
 * or other rendering libraries. Use this instead of THREE.MathUtils in physics code.
 */

export const MathUtils = {
    /**
     * Convert degrees to radians
     */
    degToRad: (degrees) => degrees * (Math.PI / 180),

    /**
     * Convert radians to degrees
     */
    radToDeg: (radians) => radians * (180 / Math.PI),

    /**
     * Clamp a value between min and max
     */
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),

    /**
     * Linear interpolation between a and b
     */
    lerp: (a, b, t) => a + (b - a) * t,

    /**
     * Check if a number is power of 2
     */
    isPowerOfTwo: (value) => (value & (value - 1)) === 0 && value !== 0,

    /**
     * Round to nearest power of 2
     */
    nearestPowerOfTwo: (value) => Math.pow(2, Math.round(Math.log(value) / Math.LN2)),

    /**
     * Next power of 2
     */
    nextPowerOfTwo: (value) => Math.pow(2, Math.ceil(Math.log(value) / Math.LN2)),

    /**
     * Previous power of 2
     */
    prevPowerOfTwo: (value) => Math.pow(2, Math.floor(Math.log(value) / Math.LN2)),

    /**
     * Generate a random float between min and max
     */
    randFloat: (min, max) => min + Math.random() * (max - min),

    /**
     * Generate a random integer between min and max (inclusive)
     */
    randInt: (min, max) => Math.floor(min + Math.random() * (max - min + 1)),

    /**
     * Smooth step function
     */
    smoothstep: (min, max, x) => {
        if (x <= min) return 0;
        if (x >= max) return 1;
        x = (x - min) / (max - min);
        return x * x * (3 - 2 * x);
    },

    /**
     * Smoother step function
     */
    smootherstep: (min, max, x) => {
        if (x <= min) return 0;
        if (x >= max) return 1;
        x = (x - min) / (max - min);
        return x * x * x * (x * (x * 6 - 15) + 10);
    },

    /**
     * Map a value from one range to another
     */
    mapLinear: (x, a1, a2, b1, b2) => b1 + (x - a1) * (b2 - b1) / (a2 - a1),

    /**
     * Euclidean modulo (always positive)
     */
    euclideanModulo: (n, m) => ((n % m) + m) % m,

    /**
     * Check if value is finite
     */
    isFinite: (value) => Number.isFinite(value),

    /**
     * Safe acos that clamps input to valid range
     */
    safeAcos: (x) => Math.acos(Math.max(-1, Math.min(1, x))),

    /**
     * Safe asin that clamps input to valid range
     */
    safeAsin: (x) => Math.asin(Math.max(-1, Math.min(1, x))),

    /**
     * Safe sqrt that returns 0 for negative values
     */
    safeSqrt: (x) => Math.sqrt(Math.max(0, x)),

    /**
     * Normalize angle to [0, 2π] range
     */
    normalizeAngle: (angle) => {
        const twoPi = 2 * Math.PI;
        return angle - twoPi * Math.floor(angle / twoPi);
    },

    /**
     * Normalize angle to [-π, π] range
     */
    normalizeAngleSigned: (angle) => {
        const pi = Math.PI;
        const twoPi = 2 * pi;
        angle = angle % twoPi;
        if (angle > pi) angle -= twoPi;
        if (angle < -pi) angle += twoPi;
        return angle;
    },

    /**
     * Calculate the shortest angular distance between two angles
     */
    angleDifference: (a, b) => {
        const diff = b - a;
        const pi = Math.PI;
        const twoPi = 2 * pi;
        return ((diff + pi) % twoPi) - pi;
    },

    /**
     * Calculate 3D vector magnitude
     */
    magnitude3D: (x, y, z) => Math.sqrt(x * x + y * y + z * z),

    /**
     * Calculate squared magnitude (faster when you don't need exact distance)
     */
    magnitude3DSquared: (x, y, z) => x * x + y * y + z * z,

    /**
     * Constants for common values
     */
    PI: Math.PI,
    TWO_PI: 2 * Math.PI,
    HALF_PI: Math.PI / 2,
    DEG_TO_RAD: Math.PI / 180,
    RAD_TO_DEG: 180 / Math.PI
};

// Default export for convenience
export default MathUtils; 