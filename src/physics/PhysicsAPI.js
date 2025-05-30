import * as THREE from 'three';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
// import { Constants } from '../utils/Constants.js';
import { ApsisCalculator } from './core/ApsisCalculator.js';

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
     * @param {number} mu - Gravitational parameter in km³/s²
     * @returns {Object} Orbital elements including a, e, i, lan, argp, nu, period
     */
    static calculateOrbitalElements(position, velocity, mu) {
        return PhysicsUtils.calculateDetailedOrbitalElements(position, velocity, mu);
    }

    /**
     * Calculate time to next periapsis
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter in km³/s²
     * @param {Date} currentTime - Current simulation time
     * @returns {Date} Time of next periapsis
     */
    static calculateNextPeriapsis(position, velocity, mu, currentTime) {
        const result = ApsisCalculator.findNextApsisAnalytical(
            position, velocity, mu, 'periapsis', currentTime
        );
        return result.time;
    }

    /**
     * Calculate time to next apoapsis
     * @param {THREE.Vector3} position - Current position in km
     * @param {THREE.Vector3} velocity - Current velocity in km/s
     * @param {number} mu - Gravitational parameter in km³/s²
     * @param {Date} currentTime - Current simulation time
     * @returns {Date} Time of next apoapsis
     */
    static calculateNextApoapsis(position, velocity, mu, currentTime) {
        const result = ApsisCalculator.findNextApsisAnalytical(
            position, velocity, mu, 'apoapsis', currentTime
        );
        return result.time;
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
        const r_ap = bodyRadius + targetApoapsis;
        const a_target = (r_pe + r_ap) / 2;
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
        
        // Velocities at current position
        // const v_circular = Math.sqrt(mu / r_current);
        const v_transfer_depart = Math.sqrt(mu * (2 / r_current - 1 / a_transfer));
        const v_transfer_arrive = Math.sqrt(mu * (2 / r_pe - 1 / a_transfer));
        const v_final = Math.sqrt(mu * (2 / r_pe - 1 / a_target));

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
        const prograde = velocity.clone().normalize();
        const radial = position.clone().normalize();
        const normal = new THREE.Vector3().crossVectors(radial, prograde).normalize();

        return new THREE.Vector3()
            .addScaledVector(prograde, localDV.x)
            .addScaledVector(normal, localDV.y)
            .addScaledVector(radial, localDV.z);
    }

    /**
     * Convert world delta-V to local coordinates
     * @param {THREE.Vector3} worldDV - Delta-V in world coordinates
     * @param {THREE.Vector3} position - Position vector
     * @param {THREE.Vector3} velocity - Velocity vector
     * @returns {THREE.Vector3} Delta-V in local frame (prograde, normal, radial)
     */
    static worldToLocalDeltaV(worldDV, position, velocity) {
        const prograde = velocity.clone().normalize();
        const radial = position.clone().normalize();
        const normal = new THREE.Vector3().crossVectors(radial, prograde).normalize();

        return new THREE.Vector3(
            worldDV.dot(prograde),
            worldDV.dot(normal),
            worldDV.dot(radial)
        );
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
        return Math.sqrt(vx * vx + vy * vy + vz * vz);
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
        const elements = this.calculateOrbitalElements(currentPosition, currentVelocity, mu);
        
        // Use existing PhysicsUtils method
        const { burnNode1, burnNode2 } = PhysicsUtils.calculateHohmannTransferNodes(
            r1, targetRadius, elements, mu
        );
        
        // Calculate transfer time
        const transferTime = Math.PI * Math.sqrt(Math.pow((r1 + targetRadius) / 2, 3) / mu);
        
        return {
            burn1: burnNode1,
            burn2: burnNode2,
            transferTime: transferTime
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
        const periapsisRadius = semiMajorAxis * (1 - eccentricity);
        const apoapsisRadius = semiMajorAxis * (1 + eccentricity);
        return {
            periapsis: periapsisRadius - bodyRadius,
            apoapsis: apoapsisRadius - bodyRadius,
            periapsisRadius: periapsisRadius,
            apoapsisRadius: apoapsisRadius
        };
    }

    /**
     * Convert altitudes to orbital elements
     * @param {number} periapsisAltitude - Periapsis altitude in km
     * @param {number} apoapsisAltitude - Apoapsis altitude in km
     * @param {number} bodyRadius - Central body radius in km
     * @returns {Object} Semi-major axis and eccentricity
     */
    static altitudesToOrbitalElements(periapsisAltitude, apoapsisAltitude, bodyRadius) {
        const rp = bodyRadius + periapsisAltitude;
        const ra = bodyRadius + apoapsisAltitude;
        const semiMajorAxis = (rp + ra) / 2;
        const eccentricity = (ra - rp) / (ra + rp);
        return {
            semiMajorAxis: semiMajorAxis,
            eccentricity: eccentricity
        };
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
}