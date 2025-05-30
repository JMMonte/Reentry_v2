import * as THREE from 'three';
import { integrateRK45 } from '../integrators/OrbitalIntegrators.js';
import { GravityCalculator } from './GravityCalculator.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';

/**
 * ApsisCalculator - Handles periapsis and apoapsis calculations
 * 
 * This module provides methods for finding orbital apsides (periapsis and apoapsis)
 * using both analytical and numerical methods.
 */
export class ApsisCalculator {
    /**
     * Find the next periapsis or apoapsis using numerical integration
     * More accurate than analytical methods when perturbations are present
     * 
     * @param {THREE.Vector3} position - Initial position in km
     * @param {THREE.Vector3} velocity - Initial velocity in km/s
     * @param {Array} bodies - Array of gravitating bodies for perturbation calculations
     * @param {string} type - 'periapsis' or 'apoapsis'
     * @param {Object} options - Additional options
     * @param {number} options.maxTime - Maximum time to search (seconds)
     * @param {number} options.timeStep - Integration time step (seconds)
     * @param {number} options.tolerance - Tolerance for apsis detection
     * @returns {Object|null} Apsis data or null if not found
     */
    static findNextApsisNumerical(position, velocity, bodies, type = 'periapsis', options = {}) {
        const {
            maxTime = 86400,  // 1 day default
            timeStep = 10,     // 10 seconds default
            tolerance = 1e-6
        } = options;

        let t = 0;
        let dt = timeStep;
        let pos = position.clone();
        let vel = velocity.clone();
        let lastR = pos.length();
        let wasDecreasing = null;
        let apsisData = null;

        // Track orbital elements for the apsis
        let lastPos = pos.clone();
        let lastVel = vel.clone();

        while (t < maxTime && !apsisData) {
            // Create acceleration function including all perturbations
            const accelerationFunc = (p) => {
                return GravityCalculator.computeAcceleration(p, bodies);
            };

            // Integrate one step
            const state = integrateRK45(pos, vel, accelerationFunc, dt, {
                absTol: tolerance,
                relTol: tolerance
            });

            pos = state.position;
            vel = state.velocity;
            t += dt;

            const r = pos.length();

            // Check for apsis passage
            if (wasDecreasing !== null) {
                const foundPeriapsis = type === 'periapsis' && wasDecreasing && r > lastR;
                const foundApoapsis = type === 'apoapsis' && !wasDecreasing && r < lastR;

                if (foundPeriapsis || foundApoapsis) {
                    // Interpolate for better accuracy
                    const rDiff = r - lastR;
                    const fraction = Math.abs(lastR - r) / (Math.abs(lastR - r) + Math.abs(rDiff));
                    const apsisTime = t - dt * (1 - fraction);
                    
                    // Interpolate position and velocity
                    const apsisPos = lastPos.clone().lerp(pos, fraction);
                    const apsisVel = lastVel.clone().lerp(vel, fraction);

                    apsisData = {
                        time: apsisTime,
                        position: apsisPos,
                        velocity: apsisVel,
                        radius: apsisPos.length(),
                        type: type
                    };
                }
            }

            wasDecreasing = r < lastR;
            lastR = r;
            lastPos.copy(pos);
            lastVel.copy(vel);
        }

        return apsisData;
    }

    /**
     * Find the next periapsis or apoapsis using analytical methods
     * Faster but assumes two-body dynamics (no perturbations)
     * 
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter (km³/s²)
     * @param {string} type - 'periapsis' or 'apoapsis'
     * @param {Date} currentTime - Current simulation time
     * @returns {Object} Apsis data
     */
    static findNextApsisAnalytical(position, velocity, mu, type = 'periapsis', currentTime) {
        const elements = PhysicsUtils.calculateDetailedOrbitalElements(position, velocity, mu);
        
        // Get current true anomaly in radians
        const f0 = THREE.MathUtils.degToRad(elements.trueAnomaly);
        const e = elements.eccentricity;
        
        // Calculate current mean anomaly
        const M0 = PhysicsUtils.meanAnomalyFromTrueAnomaly(f0, e);
        
        // Target mean anomaly (0 for periapsis, π for apoapsis)
        const targetM = type === 'periapsis' ? 0 : Math.PI;
        
        // Calculate time to target
        const T = elements.period;
        const n = 2 * Math.PI / T;  // Mean motion
        
        // Time difference accounting for orbit wrapping
        let dM = targetM - M0;
        if (dM <= 0) {
            dM += 2 * Math.PI;
        }
        
        const dt = dM / n;
        const apsisTime = new Date(currentTime.getTime() + dt * 1000);
        
        // Calculate position at apsis
        const targetTrueAnomaly = type === 'periapsis' ? 0 : Math.PI;
        const r = elements.semiMajorAxis * (1 - e * e) / (1 + e * Math.cos(targetTrueAnomaly));
        
        return {
            time: apsisTime,
            radius: r,
            altitude: r - elements.bodyRadius,
            type: type,
            elements: elements
        };
    }

    /**
     * Find both periapsis and apoapsis data for current orbit
     * 
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter (km³/s²)
     * @param {number} bodyRadius - Central body radius in km
     * @returns {Object} Object containing periapsis and apoapsis data
     */
    static calculateApsides(position, velocity, mu, bodyRadius = 0) {
        const elements = PhysicsUtils.calculateDetailedOrbitalElements(position, velocity, mu, bodyRadius);
        
        const a = elements.semiMajorAxis;
        const e = elements.eccentricity;
        
        // Calculate radii
        const periapsisRadius = a * (1 - e);
        const apoapsisRadius = a * (1 + e);
        
        return {
            periapsis: {
                radius: periapsisRadius,
                altitude: periapsisRadius - bodyRadius,
                velocity: Math.sqrt(mu * (2 / periapsisRadius - 1 / a))
            },
            apoapsis: {
                radius: apoapsisRadius,
                altitude: apoapsisRadius - bodyRadius,
                velocity: Math.sqrt(mu * (2 / apoapsisRadius - 1 / a))
            },
            elements: elements
        };
    }

    /**
     * Calculate time since last periapsis
     * 
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter (km³/s²)
     * @returns {number} Time since periapsis in seconds
     */
    static timeSincePeriapsis(position, velocity, mu) {
        const elements = PhysicsUtils.calculateDetailedOrbitalElements(position, velocity, mu);
        const f = THREE.MathUtils.degToRad(elements.trueAnomaly);
        const e = elements.eccentricity;
        const M = PhysicsUtils.meanAnomalyFromTrueAnomaly(f, e);
        const n = 2 * Math.PI / elements.period;
        
        return M / n;
    }

    /**
     * Check if orbit will impact the body surface
     * 
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter (km³/s²)
     * @param {number} bodyRadius - Body radius in km
     * @param {number} atmosphereHeight - Atmosphere height in km
     * @returns {Object} Impact data or null
     */
    static checkForImpact(position, velocity, mu, bodyRadius, atmosphereHeight = 0) {
        const apsides = this.calculateApsides(position, velocity, mu, bodyRadius);
        const impactRadius = bodyRadius + atmosphereHeight;
        
        if (apsides.periapsis.radius < impactRadius) {
            // Calculate time to impact
            const elements = apsides.elements;
            const e = elements.eccentricity;
            
            // Find true anomaly at impact radius
            const p = elements.semiMajorAxis * (1 - e * e);
            const cosNu = (p / impactRadius - 1) / e;
            
            if (Math.abs(cosNu) <= 1) {
                const nu = Math.acos(cosNu);
                const M = PhysicsUtils.meanAnomalyFromTrueAnomaly(nu, e);
                const currentM = PhysicsUtils.meanAnomalyFromTrueAnomaly(
                    THREE.MathUtils.degToRad(elements.trueAnomaly), 
                    e
                );
                
                let dM = M - currentM;
                if (dM < 0) dM += 2 * Math.PI;
                
                const n = 2 * Math.PI / elements.period;
                const timeToImpact = dM / n;
                
                return {
                    willImpact: true,
                    timeToImpact: timeToImpact,
                    impactRadius: impactRadius,
                    periapsisAltitude: apsides.periapsis.altitude
                };
            }
        }
        
        return {
            willImpact: false,
            periapsisAltitude: apsides.periapsis.altitude
        };
    }
}

export default ApsisCalculator;