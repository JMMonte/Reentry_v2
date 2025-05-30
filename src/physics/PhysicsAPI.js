import * as THREE from 'three';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { Constants } from '../utils/Constants.js';
import { ApsisCalculator } from './core/ApsisCalculator.js';
import { OrbitalMechanics } from './core/OrbitalMechanics.js';

/**
 * PhysicsAPI - Clean interface for physics calculations
 * 
 * This module provides a unified API for all physics calculations needed by the UI,
 * keeping the physics logic separate from UI concerns. All methods are pure functions
 * that take inputs and return results without side effects.
 */
export class PhysicsAPI {
    /**
     * Calculate orbital elements from position and velocity
     * @param {THREE.Vector3} position - Position vector in km
     * @param {THREE.Vector3} velocity - Velocity vector in km/s
     * @param {number|Object} muOrBody - Gravitational parameter (km³/s²) or central body object
     * @param {number} bodyRadius - Central body radius for altitude calculations (km, optional)
     * @returns {Object} Orbital elements including a, e, i, lan, argp, nu, period
     */
    static calculateOrbitalElements(position, velocity, muOrBody, bodyRadius = 0) {
        // Use centralized OrbitalMechanics implementation
        return OrbitalMechanics.calculateOrbitalElements(position, velocity, muOrBody, bodyRadius);
    }
    
    /**
     * Get gravitational parameter for a body
     * @param {number|string|Object} bodyIdentifier - Body object, NAIF ID, or name
     * @returns {number} Gravitational parameter in km³/s²
     */
    static getGravitationalParameter(bodyIdentifier) {
        return OrbitalMechanics.getGravitationalParameter(bodyIdentifier);
    }
    
    /**
     * Calculate circular velocity at a given radius
     * @param {Object|number} centralBodyOrGM - Central body object or GM value
     * @param {number} radius - Distance from center in km
     * @returns {number} Circular velocity in km/s
     */
    static calculateCircularVelocity(centralBodyOrGM, radius) {
        return OrbitalMechanics.calculateCircularVelocity(centralBodyOrGM, radius);
    }
    
    /**
     * Get body rotation period
     * @param {Object} body - Body object
     * @returns {number} Rotation period in seconds
     */
    static getBodyRotationPeriod(body) {
        // Already stored in body config
        return body.rotationPeriod || Constants.siderialDay;
    }
    
    /**
     * Get body rotation rate
     * @param {Object} body - Body object
     * @returns {number} Rotation rate in rad/s
     */
    static getBodyRotationRate(body) {
        const period = this.getBodyRotationPeriod(body);
        return (2 * Math.PI) / Math.abs(period);
    }

    /**
     * Calculate time to next periapsis
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number|Object} muOrBody - Gravitational parameter or central body
     * @param {Date} currentTime - Current simulation time
     * @returns {Date} Time of next periapsis
     */
    static calculateNextPeriapsis(position, velocity, muOrBody, currentTime) {
        return OrbitalMechanics.calculateNextApsis(position, velocity, muOrBody, 'periapsis', currentTime);
    }

    /**
     * Calculate time to next apoapsis
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number|Object} muOrBody - Gravitational parameter or central body
     * @param {Date} currentTime - Current simulation time
     * @returns {Date} Time of next apoapsis
     */
    static calculateNextApoapsis(position, velocity, muOrBody, currentTime) {
        return OrbitalMechanics.calculateNextApsis(position, velocity, muOrBody, 'apoapsis', currentTime);
    }

    /**
     * Calculate Hohmann transfer parameters
     * @param {Object} params - Transfer parameters
     * @returns {Object} Transfer details including delta-V values and burn times
     */
    static calculateHohmannTransfer(params) {
        const {
            currentPosition,
            currentVelocity,
            targetPeriapsis,  // km above surface
            targetApoapsis,   // km above surface
            targetInclination,  // degrees
            targetLAN,       // degrees
            // targetArgP,      // degrees
            bodyRadius,      // km
            mu              // km³/s²
        } = params;

        // Calculate target orbital elements
        const r_pe = bodyRadius + targetPeriapsis;
        // const r_ap = bodyRadius + targetApoapsis;
        // const a_target = (r_pe + r_ap) / 2;
        // const e_target = (r_ap - r_pe) / (r_ap + r_pe);

        // Calculate current orbital elements
        const currentElements = this.calculateOrbitalElements(currentPosition, currentVelocity, mu);

        // Calculate plane change angle
        const planeChangeAngle = this.calculatePlaneChangeAngle(
            currentElements.inclination,
            currentElements.longitudeOfAscendingNode,
            targetInclination,
            targetLAN
        );

        // Calculate transfer orbit parameters
        const r_current = currentPosition.length();
        const v_current = currentVelocity.length();
        
        // Transfer orbit semi-major axis (Hohmann)
        const a_transfer = (r_current + r_pe) / 2;
        
        // Use centralized orbital mechanics for velocity calculations
        const velocities = OrbitalMechanics.calculateHohmannTransfer({
            centralBody: { GM: mu },
            currentRadius: r_current,
            targetRadius: r_pe
        });
        
        const v_transfer_depart = velocities.velocities.transferDeparture;
        const v_transfer_arrive = velocities.velocities.transferArrival;
        const v_final = OrbitalMechanics.calculateCircularVelocity(mu, r_pe);

        // Delta-V calculations
        const dv1 = Math.abs(v_transfer_depart - v_current);
        const dv2_orbital = Math.abs(v_final - v_transfer_arrive);
        
        // Plane change delta-V (if needed)
        const dv2_plane = 2 * v_final * Math.sin(THREE.MathUtils.degToRad(planeChangeAngle) / 2);
        
        // Combined maneuver at arrival
        const dv2 = Math.sqrt(dv2_orbital * dv2_orbital + dv2_plane * dv2_plane);

        // Transfer time
        const transferTime = Math.PI * Math.sqrt(Math.pow(a_transfer, 3) / mu);

        return {
            deltaV1: dv1,
            deltaV2: dv2,
            totalDeltaV: dv1 + dv2,
            transferTime: transferTime,
            planeChangeAngle: planeChangeAngle,
            burn1: {
                magnitude: dv1,
                direction: 'prograde'
            },
            burn2: {
                magnitude: dv2,
                orbitalComponent: dv2_orbital,
                planeChangeComponent: dv2_plane
            }
        };
    }

    /**
     * Calculate plane change angle between two orbits
     * @param {number} inc1 - Inclination 1 in degrees
     * @param {number} lan1 - LAN 1 in degrees
     * @param {number} inc2 - Inclination 2 in degrees
     * @param {number} lan2 - LAN 2 in degrees
     * @returns {number} Plane change angle in degrees
     */
    static calculatePlaneChangeAngle(inc1, lan1, inc2, lan2) {
        const i1 = THREE.MathUtils.degToRad(inc1);
        const o1 = THREE.MathUtils.degToRad(lan1);
        const i2 = THREE.MathUtils.degToRad(inc2);
        const o2 = THREE.MathUtils.degToRad(lan2);

        // Angular momentum unit vectors
        const h1 = new THREE.Vector3(
            Math.sin(o1) * Math.sin(i1),
            -Math.cos(o1) * Math.sin(i1),
            Math.cos(i1)
        );
        const h2 = new THREE.Vector3(
            Math.sin(o2) * Math.sin(i2),
            -Math.cos(o2) * Math.sin(i2),
            Math.cos(i2)
        );

        const dotProduct = THREE.MathUtils.clamp(h1.dot(h2), -1, 1);
        return THREE.MathUtils.radToDeg(Math.acos(dotProduct));
    }

    /**
     * Convert local delta-V to world coordinates
     * @param {THREE.Vector3} localDV - Delta-V in local frame (prograde, normal, radial)
     * @param {THREE.Vector3} position - Position vector
     * @param {THREE.Vector3} velocity - Velocity vector
     * @returns {THREE.Vector3} Delta-V in world coordinates
     */
    static localToWorldDeltaV(localDV, position, velocity) {
        return OrbitalMechanics.localToWorldDeltaV(localDV, position, velocity);
    }

    /**
     * Convert world delta-V to local coordinates
     * @param {THREE.Vector3} worldDV - Delta-V in world coordinates
     * @param {THREE.Vector3} position - Position vector
     * @param {THREE.Vector3} velocity - Velocity vector
     * @returns {THREE.Vector3} Delta-V in local frame (prograde, normal, radial)
     */
    static worldToLocalDeltaV(worldDV, position, velocity) {
        return OrbitalMechanics.worldToLocalDeltaV(worldDV, position, velocity);
    }

    /**
     * Find optimal burn time for a maneuver
     * @param {Object} params - Parameters for finding burn time
     * @returns {Date} Optimal burn time
     */
    static findOptimalBurnTime(params) {
        const {
            currentPosition,
            currentVelocity,
            targetArgP,
            mu,
            currentTime
        } = params;

        const elements = this.calculateOrbitalElements(currentPosition, currentVelocity, mu);
        const e = elements.eccentricity;
        const f0 = THREE.MathUtils.degToRad(elements.trueAnomaly);
        const M0 = PhysicsUtils.meanAnomalyFromTrueAnomaly(f0, e);
        
        // Target true anomaly
        const fTarget = THREE.MathUtils.degToRad(targetArgP || 0);
        
        // Solve for corresponding eccentric anomaly
        const sqrtTerm = Math.sqrt((1 - e) / (1 + e));
        const Et = 2 * Math.atan(sqrtTerm * Math.tan(fTarget / 2));
        const Mt = Et - e * Math.sin(Et);
        
        // Compute time until target mean anomaly
        const T = elements.period;
        const n = 2 * Math.PI / T;
        const dM = ((Mt - M0) + 2 * Math.PI) % (2 * Math.PI);
        const dt = dM / n;
        
        return new Date(currentTime.getTime() + dt * 1000);
    }

    /**
     * Predict orbit after maneuver
     * @param {Object} params - Maneuver parameters
     * @returns {Object} Predicted orbital elements
     */
    static predictManeuverOrbit(params) {
        const {
            position,
            velocity,
            deltaV,
            mu
        } = params;

        // Apply delta-V
        const newVelocity = velocity.clone().add(deltaV);
        
        // Calculate new orbital elements
        return this.calculateOrbitalElements(position, newVelocity, mu);
    }

    /**
     * Calculate delta-V magnitude
     * @param {number} vx - X component
     * @param {number} vy - Y component  
     * @param {number} vz - Z component
     * @returns {number} Magnitude
     */
    static calculateDeltaVMagnitude(vx, vy, vz) {
        return OrbitalMechanics.calculateDeltaVMagnitude(vx, vy, vz);
    }

    /**
     * Calculate apsides (periapsis and apoapsis) for current orbit
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter in km³/s²
     * @param {number} bodyRadius - Central body radius in km
     * @returns {Object} Apsides data
     */
    static calculateApsides(position, velocity, mu, bodyRadius = 0) {
        return ApsisCalculator.calculateApsides(position, velocity, mu, bodyRadius);
    }

    /**
     * Check if orbit will impact body surface
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter in km³/s²
     * @param {number} bodyRadius - Body radius in km
     * @param {number} atmosphereHeight - Atmosphere height in km
     * @returns {Object} Impact data
     */
    static checkOrbitImpact(position, velocity, mu, bodyRadius, atmosphereHeight = 0) {
        return ApsisCalculator.checkForImpact(position, velocity, mu, bodyRadius, atmosphereHeight);
    }

    /**
     * Get state vectors at a specific time in the future
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter in km³/s²
     * @param {number} deltaTime - Time offset in seconds
     * @returns {Object} State vectors {position, velocity}
     */
    static getStateAtTime(position, velocity, mu, deltaTime) {
        const elements = this.calculateOrbitalElements(position, velocity, mu);
        const newPosition = PhysicsUtils.getPositionAtTime(elements, deltaTime);
        // For now, return position only - velocity calculation can be added if needed
        return { position: newPosition };
    }

    /**
     * Get state vectors at a specific true anomaly
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter in km³/s²
     * @param {number} targetAnomaly - Target true anomaly in degrees
     * @returns {Object} State vectors {position, velocity}
     */
    static getStateAtAnomaly(position, velocity, mu, targetAnomaly) {
        const elements = this.calculateOrbitalElements(position, velocity, mu);
        const targetAnomalyRad = THREE.MathUtils.degToRad(targetAnomaly);
        
        // Convert elements to format expected by PhysicsUtils
        const els = {
            h: elements.specificAngularMomentum,
            e: elements.eccentricity,
            i: THREE.MathUtils.degToRad(elements.inclination),
            omega: THREE.MathUtils.degToRad(elements.longitudeOfAscendingNode),
            w: THREE.MathUtils.degToRad(elements.argumentOfPeriapsis)
        };
        
        return PhysicsUtils.calculateStateVectorsAtAnomaly(els, targetAnomalyRad, mu);
    }

    /**
     * Calculate Hohmann transfer nodes with burn information
     * @param {THREE.Vector3} currentPosition - Current position in km
     * @param {THREE.Vector3} currentVelocity - Current velocity in km/s
     * @param {number} targetRadius - Target orbit radius in km
     * @param {number} mu - Gravitational parameter in km³/s²
     * @returns {Object} Transfer nodes with delta-V and timing
     */
    static calculateHohmannTransferNodes(currentPosition, currentVelocity, targetRadius, mu) {
        const r1 = currentPosition.length();
        const r2 = targetRadius;
        
        // Calculate transfer orbit semi-major axis
        const a_transfer = (r1 + r2) / 2;
        
        // Calculate velocities
        const v1_circular = Math.sqrt(mu / r1);  // Current circular velocity
        const v2_circular = Math.sqrt(mu / r2);  // Target circular velocity
        
        // Transfer orbit velocities
        const v1_transfer = Math.sqrt(mu * (2/r1 - 1/a_transfer));  // Departure velocity
        const v2_transfer = Math.sqrt(mu * (2/r2 - 1/a_transfer));  // Arrival velocity
        
        // Delta-V calculations
        const dv1 = Math.abs(v1_transfer - v1_circular);  // First burn
        const dv2 = Math.abs(v2_circular - v2_transfer);  // Second burn
        
        // Transfer time (half period of transfer ellipse)
        const transferTime = Math.PI * Math.sqrt(Math.pow(a_transfer, 3) / mu);
        
        // Create burn nodes
        const burnNode1 = {
            deltaV: dv1,
            direction: r2 > r1 ? 'prograde' : 'retrograde',
            position: currentPosition.clone(),
            velocity: currentVelocity.clone(),
            anomaly: 0  // At current position
        };
        
        const burnNode2 = {
            deltaV: dv2,
            direction: r2 > r1 ? 'prograde' : 'retrograde',
            // Position and velocity would need orbital propagation to determine
            anomaly: Math.PI  // 180 degrees later in transfer orbit
        };
        
        return {
            burn1: burnNode1,
            burn2: burnNode2,
            transferTime: transferTime,
            totalDeltaV: dv1 + dv2
        };
    }

    /**
     * Convert between orbital elements and altitude representation
     * @param {number} semiMajorAxis - Semi-major axis in km
     * @param {number} eccentricity - Eccentricity (0-1)
     * @param {number} bodyRadius - Central body radius in km
     * @returns {Object} Periapsis and apoapsis altitudes
     */
    static orbitalElementsToAltitudes(semiMajorAxis, eccentricity, bodyRadius) {
        return OrbitalMechanics.orbitalElementsToApsides(semiMajorAxis, eccentricity, bodyRadius);
    }

    /**
     * Convert altitudes to orbital elements
     * @param {number} periapsisAltitude - Periapsis altitude in km
     * @param {number} apoapsisAltitude - Apoapsis altitude in km
     * @param {number} bodyRadius - Central body radius in km
     * @returns {Object} Semi-major axis and eccentricity
     */
    static altitudesToOrbitalElements(periapsisAltitude, apoapsisAltitude, bodyRadius) {
        return OrbitalMechanics.apsidesToOrbitalElements(periapsisAltitude, apoapsisAltitude, bodyRadius);
    }

    /**
     * Calculate execution time for a maneuver
     * @param {Date} currentTime - Current simulation time
     * @param {string} timeMode - Time mode ('offset', 'datetime', 'nextPeriapsis', etc.)
     * @param {Object} params - Time parameters
     * @returns {Date} Execution time
     */
    static computeExecutionTime(currentTime, timeMode, params) {
        if (timeMode === 'offset') {
            const secs = parseFloat(params.offsetSec) || 0;
            return new Date(currentTime.getTime() + secs * 1000);
        } else if (timeMode === 'datetime') {
            const newTime = new Date(currentTime);
            newTime.setUTCHours(params.hours);
            newTime.setUTCMinutes(params.minutes);
            newTime.setUTCSeconds(params.seconds);
            newTime.setUTCMilliseconds(params.milliseconds || 0);
            return newTime;
        }
        // Handle other modes as needed
        return currentTime;
    }

    /**
     * Calculate delta-V between two orbits at a specific anomaly
     * @param {THREE.Vector3} currentPosition - Current position
     * @param {THREE.Vector3} currentVelocity - Current velocity
     * @param {THREE.Vector3} targetPosition - Target position
     * @param {THREE.Vector3} targetVelocity - Target velocity
     * @param {number} mu - Gravitational parameter
     * @param {number} anomaly - True anomaly in degrees
     * @returns {number} Delta-V magnitude
     */
    static calculateDeltaVAtAnomaly(currentPosition, currentVelocity, targetPosition, targetVelocity, mu, anomaly) {
        const currentElements = this.calculateOrbitalElements(currentPosition, currentVelocity, mu);
        const targetElements = this.calculateOrbitalElements(targetPosition, targetVelocity, mu);
        
        // Convert to format expected by PhysicsUtils
        const curEls = {
            h: currentElements.specificAngularMomentum,
            e: currentElements.eccentricity,
            i: THREE.MathUtils.degToRad(currentElements.inclination),
            omega: THREE.MathUtils.degToRad(currentElements.longitudeOfAscendingNode),
            w: THREE.MathUtils.degToRad(currentElements.argumentOfPeriapsis)
        };
        
        const tgtEls = {
            h: targetElements.specificAngularMomentum,
            e: targetElements.eccentricity,
            i: THREE.MathUtils.degToRad(targetElements.inclination),
            omega: THREE.MathUtils.degToRad(targetElements.longitudeOfAscendingNode),
            w: THREE.MathUtils.degToRad(targetElements.argumentOfPeriapsis)
        };
        
        return PhysicsUtils.calculateDeltaVAtAnomaly(curEls, tgtEls, THREE.MathUtils.degToRad(anomaly), mu);
    }

    /**
     * Calculate orbital period from position and velocity
     * @param {THREE.Vector3|Array} position - Position vector in km
     * @param {THREE.Vector3|Array} velocity - Velocity vector in km/s
     * @param {number|Object} muOrBody - Gravitational parameter (km³/s²) or central body
     * @returns {number} Orbital period in seconds (returns 0 for non-elliptical orbits)
     */
    static calculateOrbitalPeriod(position, velocity, muOrBody) {
        return OrbitalMechanics.calculateOrbitalPeriod(position, velocity, muOrBody);
    }

    /**
     * Calculate orbital period from semi-major axis using Kepler's Third Law
     * @param {number} semiMajorAxis - Semi-major axis in km
     * @param {number|Object} muOrBody - Gravitational parameter (km³/s²) or central body
     * @returns {number} Orbital period in seconds
     */
    static calculateOrbitalPeriodFromSMA(semiMajorAxis, muOrBody) {
        const mu = typeof muOrBody === 'number' 
            ? muOrBody 
            : this.getGravitationalParameter(muOrBody);
        
        // Kepler's Third Law: T = 2π√(a³/GM)
        return 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu);
    }
}