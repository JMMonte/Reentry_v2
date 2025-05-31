/**
 * ApsisCalculations - Pure Mathematical Apsis Calculations
 * 
 * This module provides pure mathematical functions for calculating periapsis and apoapsis
 * information with zero external dependencies. No Three.js, no Date objects, no UI concerns.
 * 
 * All functions work with:
 * - Position/velocity as simple arrays [x, y, z] 
 * - Time as numbers (seconds)
 * - Pure mathematical operations only
 */

import { PhysicsConstants } from './PhysicsConstants.js';

export class ApsisCalculations {
    /**
     * Calculate periapsis and apoapsis radii from orbital elements
     * @param {Object} elements - Orbital elements {semiMajorAxis, eccentricity}
     * @returns {Object} - {periapsisRadius, apoapsisRadius} in km
     */
    static calculateApsisRadii(elements) {
        const { semiMajorAxis, eccentricity } = elements;
        
        if (eccentricity >= 1.0) {
            // Hyperbolic orbit - only periapsis exists
            return {
                periapsisRadius: semiMajorAxis * (eccentricity - 1),
                apoapsisRadius: Infinity
            };
        }
        
        return {
            periapsisRadius: semiMajorAxis * (1 - eccentricity),
            apoapsisRadius: semiMajorAxis * (1 + eccentricity)
        };
    }

    /**
     * Calculate time offset to next apsis occurrence
     * @param {number} currentTrueAnomaly - Current true anomaly in radians
     * @param {string} apsisType - 'periapsis' or 'apoapsis'
     * @param {number} period - Orbital period in seconds
     * @param {number} eccentricity - Orbital eccentricity
     * @returns {number} - Time offset to next apsis in seconds
     */
    static calculateApsisTimeOffset(currentTrueAnomaly, apsisType, period, eccentricity) {
        if (eccentricity >= 1.0 && apsisType === 'apoapsis') {
            return Infinity; // No apoapsis for hyperbolic orbits
        }

        let targetTrueAnomaly;
        if (apsisType === 'periapsis') {
            targetTrueAnomaly = 0; // Periapsis is at true anomaly = 0
        } else {
            targetTrueAnomaly = Math.PI; // Apoapsis is at true anomaly = π
        }

        // Calculate angular difference
        let angleDiff = targetTrueAnomaly - currentTrueAnomaly;
        
        // Ensure we get the NEXT occurrence (positive time offset)
        if (angleDiff <= 0) {
            angleDiff += 2 * Math.PI;
        }

        // Convert angular difference to time using Kepler's laws
        // For elliptical orbits, we need to account for varying orbital velocity
        if (eccentricity < 1.0) {
            // Convert true anomaly difference to mean anomaly difference
            const currentEccentricAnomaly = this._trueToEccentricAnomaly(currentTrueAnomaly, eccentricity);
            const targetEccentricAnomaly = this._trueToEccentricAnomaly(targetTrueAnomaly, eccentricity);
            
            let meanAnomalyDiff = (targetEccentricAnomaly - eccentricity * Math.sin(targetEccentricAnomaly)) -
                                 (currentEccentricAnomaly - eccentricity * Math.sin(currentEccentricAnomaly));
            
            if (meanAnomalyDiff <= 0) {
                meanAnomalyDiff += 2 * Math.PI;
            }
            
            return (meanAnomalyDiff / (2 * Math.PI)) * period;
        } else {
            // Hyperbolic case - simplified calculation
            return (angleDiff / (2 * Math.PI)) * period;
        }
    }

    /**
     * Calculate position vector at apsis
     * @param {Object} elements - Orbital elements
     * @param {string} apsisType - 'periapsis' or 'apoapsis'
     * @param {number} mu - Gravitational parameter (km³/s²)
     * @returns {Array} - Position vector [x, y, z] in km
     */
    static calculateApsisPosition(elements, apsisType, mu) {
        const { semiMajorAxis, eccentricity, inclination, argumentOfPeriapsis, longitudeOfAscendingNode } = elements;
        
        // Calculate apsis radius
        let radius;
        let trueAnomaly;
        
        if (apsisType === 'periapsis') {
            radius = semiMajorAxis * (1 - eccentricity);
            trueAnomaly = 0;
        } else {
            if (eccentricity >= 1.0) {
                return [Infinity, Infinity, Infinity]; // No apoapsis for hyperbolic orbits
            }
            radius = semiMajorAxis * (1 + eccentricity);
            trueAnomaly = Math.PI;
        }

        // Position in orbital plane (periapsis direction is +x)
        const x_orbital = radius * Math.cos(trueAnomaly);
        const y_orbital = radius * Math.sin(trueAnomaly);
        const z_orbital = 0;

        // Rotation matrices to transform from orbital plane to reference frame
        const cosOmega = Math.cos(longitudeOfAscendingNode);
        const sinOmega = Math.sin(longitudeOfAscendingNode);
        const cosI = Math.cos(inclination);
        const sinI = Math.sin(inclination);
        const cosW = Math.cos(argumentOfPeriapsis);
        const sinW = Math.sin(argumentOfPeriapsis);

        // Combined rotation matrix elements
        const r11 = cosOmega * cosW - sinOmega * sinW * cosI;
        const r12 = -cosOmega * sinW - sinOmega * cosW * cosI;
        const r13 = sinOmega * sinI;
        
        const r21 = sinOmega * cosW + cosOmega * sinW * cosI;
        const r22 = -sinOmega * sinW + cosOmega * cosW * cosI;
        const r23 = -cosOmega * sinI;
        
        const r31 = sinW * sinI;
        const r32 = cosW * sinI;
        const r33 = cosI;

        // Transform to reference frame
        const x = r11 * x_orbital + r12 * y_orbital + r13 * z_orbital;
        const y = r21 * x_orbital + r22 * y_orbital + r23 * z_orbital;
        const z = r31 * x_orbital + r32 * y_orbital + r33 * z_orbital;

        return [x, y, z];
    }

    /**
     * Calculate velocity vector at apsis
     * @param {Object} elements - Orbital elements
     * @param {string} apsisType - 'periapsis' or 'apoapsis'
     * @param {number} mu - Gravitational parameter (km³/s²)
     * @returns {Array} - Velocity vector [vx, vy, vz] in km/s
     */
    static calculateApsisVelocity(elements, apsisType, mu) {
        const { semiMajorAxis, eccentricity, inclination, argumentOfPeriapsis, longitudeOfAscendingNode } = elements;
        
        // Calculate apsis radius and velocity magnitude
        let radius;
        let trueAnomaly;
        
        if (apsisType === 'periapsis') {
            radius = semiMajorAxis * (1 - eccentricity);
            trueAnomaly = 0;
        } else {
            if (eccentricity >= 1.0) {
                return [0, 0, 0]; // No apoapsis for hyperbolic orbits
            }
            radius = semiMajorAxis * (1 + eccentricity);
            trueAnomaly = Math.PI;
        }

        // Velocity magnitude at apsis (vis-viva equation)
        const velocityMagnitude = Math.sqrt(mu * (2 / radius - 1 / semiMajorAxis));

        // At apsis points, velocity is perpendicular to radius vector
        // For periapsis: velocity is in +y direction of orbital plane
        // For apoapsis: velocity is in -y direction of orbital plane
        const vx_orbital = 0;
        const vy_orbital = apsisType === 'periapsis' ? velocityMagnitude : -velocityMagnitude;
        const vz_orbital = 0;

        // Same rotation matrices as position calculation
        const cosOmega = Math.cos(longitudeOfAscendingNode);
        const sinOmega = Math.sin(longitudeOfAscendingNode);
        const cosI = Math.cos(inclination);
        const sinI = Math.sin(inclination);
        const cosW = Math.cos(argumentOfPeriapsis);
        const sinW = Math.sin(argumentOfPeriapsis);

        const r11 = cosOmega * cosW - sinOmega * sinW * cosI;
        const r12 = -cosOmega * sinW - sinOmega * cosW * cosI;
        const r13 = sinOmega * sinI;
        
        const r21 = sinOmega * cosW + cosOmega * sinW * cosI;
        const r22 = -sinOmega * sinW + cosOmega * cosW * cosI;
        const r23 = -cosOmega * sinI;
        
        const r31 = sinW * sinI;
        const r32 = cosW * sinI;
        const r33 = cosI;

        // Transform to reference frame
        const vx = r11 * vx_orbital + r12 * vy_orbital + r13 * vz_orbital;
        const vy = r21 * vx_orbital + r22 * vy_orbital + r23 * vz_orbital;
        const vz = r31 * vx_orbital + r32 * vy_orbital + r33 * vz_orbital;

        return [vx, vy, vz];
    }

    /**
     * Get comprehensive apsis information for an orbit
     * @param {Object} elements - Orbital elements
     * @param {number} mu - Gravitational parameter (km³/s²)
     * @param {number} currentTrueAnomaly - Current true anomaly in radians
     * @param {number} period - Orbital period in seconds
     * @returns {Object} - Complete apsis information
     */
    static getApsisInformation(elements, mu, currentTrueAnomaly, period) {
        const radii = this.calculateApsisRadii(elements);
        
        const result = {
            periapsis: {
                radius: radii.periapsisRadius,
                altitude: radii.periapsisRadius - (elements.centralBodyRadius || 0),
                position: this.calculateApsisPosition(elements, 'periapsis', mu),
                velocity: this.calculateApsisVelocity(elements, 'periapsis', mu),
                timeOffset: this.calculateApsisTimeOffset(currentTrueAnomaly, 'periapsis', period, elements.eccentricity)
            }
        };

        // Only add apoapsis for elliptical orbits
        if (elements.eccentricity < 1.0) {
            result.apoapsis = {
                radius: radii.apoapsisRadius,
                altitude: radii.apoapsisRadius - (elements.centralBodyRadius || 0),
                position: this.calculateApsisPosition(elements, 'apoapsis', mu),
                velocity: this.calculateApsisVelocity(elements, 'apoapsis', mu),
                timeOffset: this.calculateApsisTimeOffset(currentTrueAnomaly, 'apoapsis', period, elements.eccentricity)
            };
        }

        return result;
    }

    /**
     * Private helper: Convert true anomaly to eccentric anomaly
     * @private
     */
    static _trueToEccentricAnomaly(trueAnomaly, eccentricity) {
        const cosE = (eccentricity + Math.cos(trueAnomaly)) / (1 + eccentricity * Math.cos(trueAnomaly));
        const sinE = Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(trueAnomaly) / (1 + eccentricity * Math.cos(trueAnomaly));
        return Math.atan2(sinE, cosE);
    }

    /**
     * Validate orbital elements for apsis calculations
     * @param {Object} elements - Orbital elements to validate
     * @returns {Object} - {isValid: boolean, errors: string[]}
     */
    static validateElements(elements) {
        const errors = [];
        const required = ['semiMajorAxis', 'eccentricity'];
        
        for (const field of required) {
            if (typeof elements[field] !== 'number' || !isFinite(elements[field])) {
                errors.push(`Invalid ${field}: must be a finite number`);
            }
        }

        if (elements.semiMajorAxis <= 0) {
            errors.push('semiMajorAxis must be positive');
        }

        if (elements.eccentricity < 0) {
            errors.push('eccentricity must be non-negative');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}