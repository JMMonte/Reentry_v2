import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

/**
 * Centralized gravity calculation module
 * Handles all gravitational force and acceleration computations
 */
export class GravityCalculator {
    /**
     * Compute gravitational acceleration on a body due to multiple gravitating bodies
     * @param {THREE.Vector3} position - Position of the body (km)
     * @param {Array} bodies - Array of gravitating bodies with position and mass
     * @param {Object} options - Additional options
     * @returns {THREE.Vector3} - Total gravitational acceleration (km/s²)
     */
    static computeAcceleration(position, bodies, options = {}) {
        const {
            excludeBodies = [],
            includeJ2 = false,
            centralBody = null
        } = options;

        const acceleration = new THREE.Vector3();

        // N-body gravitational forces
        for (const body of bodies) {
            if (excludeBodies.includes(body.naifId || body.id)) continue;

            const bodyPos = body.position instanceof THREE.Vector3 
                ? body.position 
                : new THREE.Vector3().fromArray(body.position);
            
            const r = bodyPos.clone().sub(position);
            const distance = r.length();

            if (distance > 0) {
                const mu = body.mu || (Constants.G * body.mass);
                const accelMag = mu / (distance * distance);
                acceleration.addScaledVector(r.normalize(), accelMag);
            }
        }

        // J2 perturbation for oblate bodies
        if (includeJ2 && centralBody && centralBody.J2) {
            const j2Accel = this.computeJ2Acceleration(position, centralBody);
            acceleration.add(j2Accel);
        }

        return acceleration;
    }

    /**
     * Compute J2 perturbation acceleration (oblateness effect)
     * @param {THREE.Vector3} position - Position relative to central body (km)
     * @param {Object} body - Central body with J2, radius, and mass
     * @returns {THREE.Vector3} - J2 acceleration (km/s²)
     */
    static computeJ2Acceleration(position, body) {
        if (!body.J2 || !body.radius) return new THREE.Vector3();

        const r = position.length();
        const mu = body.mu || (Constants.G * body.mass);
        const J2 = body.J2;
        const Re = body.radius;

        // Avoid singularity at center
        if (r < Re) return new THREE.Vector3();

        const x = position.x;
        const y = position.y;
        const z = position.z;
        const r2 = r * r;
        const r5 = r2 * r2 * r;
        const Re2 = Re * Re;

        // J2 acceleration components
        const factor = 1.5 * J2 * mu * Re2 / r5;
        const z2_r2 = (z * z) / r2;

        const ax = factor * x * (5 * z2_r2 - 1);
        const ay = factor * y * (5 * z2_r2 - 1);
        const az = factor * z * (5 * z2_r2 - 3);

        return new THREE.Vector3(ax, ay, az);
    }

    /**
     * Compute gravitational force between two bodies
     * @param {Object} body1 - First body with position and mass
     * @param {Object} body2 - Second body with position and mass
     * @returns {THREE.Vector3} - Gravitational force on body1 due to body2 (kg⋅km/s²)
     */
    static computeForce(body1, body2) {
        const pos1 = body1.position instanceof THREE.Vector3 
            ? body1.position 
            : new THREE.Vector3().fromArray(body1.position);
        const pos2 = body2.position instanceof THREE.Vector3 
            ? body2.position 
            : new THREE.Vector3().fromArray(body2.position);

        const r = pos2.clone().sub(pos1);
        const distance = r.length();

        if (distance === 0) return new THREE.Vector3();

        const forceMag = Constants.G * body1.mass * body2.mass / (distance * distance);
        return r.normalize().multiplyScalar(forceMag);
    }

    /**
     * Compute potential energy between two bodies
     * @param {Object} body1 - First body with position and mass
     * @param {Object} body2 - Second body with position and mass
     * @returns {number} - Gravitational potential energy (kg⋅km²/s²)
     */
    static computePotentialEnergy(body1, body2) {
        const pos1 = body1.position instanceof THREE.Vector3 
            ? body1.position 
            : new THREE.Vector3().fromArray(body1.position);
        const pos2 = body2.position instanceof THREE.Vector3 
            ? body2.position 
            : new THREE.Vector3().fromArray(body2.position);

        const distance = pos1.distanceTo(pos2);
        if (distance === 0) return 0;

        return -Constants.G * body1.mass * body2.mass / distance;
    }

    /**
     * Compute escape velocity from a body's surface
     * @param {Object} body - Body with mass and radius
     * @returns {number} - Escape velocity (km/s)
     */
    static computeEscapeVelocity(body) {
        if (!body.radius || !body.mass) return 0;
        return Math.sqrt(2 * Constants.G * body.mass / body.radius);
    }

    /**
     * Compute orbital velocity at a given distance
     * @param {Object} centralBody - Central body with mass
     * @param {number} distance - Distance from center (km)
     * @returns {number} - Circular orbital velocity (km/s)
     */
    static computeOrbitalVelocity(centralBody, distance) {
        if (distance <= 0) return 0;
        const mu = centralBody.mu || (Constants.G * centralBody.mass);
        return Math.sqrt(mu / distance);
    }

    /**
     * Compute sphere of influence radius
     * @param {Object} body - Body with mass
     * @param {Object} parent - Parent body with mass and orbital radius
     * @returns {number} - Sphere of influence radius (km)
     */
    static computeSOIRadius(body, parent) {
        if (!parent || !parent.mass) return Infinity;
        
        // For the body's orbit around parent
        const a = body.orbitalRadius || body.semiMajorAxis;
        if (!a) return 0;

        return a * Math.pow(body.mass / parent.mass, 0.4);
    }

    /**
     * Compute Hill sphere radius (similar to SOI but using exact formula)
     * @param {Object} body - Body with mass
     * @param {Object} parent - Parent body with mass
     * @param {number} a - Semi-major axis of body's orbit around parent
     * @param {number} e - Eccentricity of body's orbit
     * @returns {number} - Hill sphere radius (km)
     */
    static computeHillRadius(body, parent, a, e = 0) {
        if (!parent || !parent.mass) return Infinity;
        
        const massRatio = body.mass / (3 * parent.mass);
        return a * (1 - e) * Math.pow(massRatio, 1/3);
    }

    /**
     * Check if position is within a body's sphere of influence
     * @param {THREE.Vector3} position - Position to check (km)
     * @param {Object} body - Body with position and soiRadius
     * @returns {boolean} - True if within SOI
     */
    static isWithinSOI(position, body) {
        if (!body.soiRadius) return false;
        
        const bodyPos = body.position instanceof THREE.Vector3 
            ? body.position 
            : new THREE.Vector3().fromArray(body.position);
        
        const distance = position.distanceTo(bodyPos);
        return distance < body.soiRadius;
    }

    /**
     * Find the dominant gravitational body at a position
     * @param {THREE.Vector3} position - Position to check (km)
     * @param {Array} bodies - Array of bodies to check
     * @returns {Object|null} - Dominant body or null
     */
    static findDominantBody(position, bodies) {
        let dominantBody = null;
        let maxAcceleration = 0;

        for (const body of bodies) {
            const bodyPos = body.position instanceof THREE.Vector3 
                ? body.position 
                : new THREE.Vector3().fromArray(body.position);
            
            const r = position.distanceTo(bodyPos);
            if (r === 0) continue;

            const mu = body.mu || (Constants.G * body.mass);
            const acceleration = mu / (r * r);

            if (acceleration > maxAcceleration) {
                maxAcceleration = acceleration;
                dominantBody = body;
            }
        }

        return dominantBody;
    }
}