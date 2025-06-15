import { PhysicsVector3 } from '../utils/PhysicsVector3.js';
import { PhysicsConstants } from './PhysicsConstants.js';

/**
 * Centralized gravity calculation module
 * Handles all gravitational force and acceleration computations
 * Now optimized to work with CelestialBody instances
 */
export class GravityCalculator {
    /**
     * Compute gravitational acceleration on a body due to multiple gravitating bodies
     * @param {PhysicsVector3} position - Position of the body (km)
     * @param {Array} bodies - Array of CelestialBody instances or legacy body objects
     * @param {Object} options - Additional options
     * @returns {PhysicsVector3} - Total gravitational acceleration (km/s²)
     */
    static computeAcceleration(position, bodies, options = {}) {
        const {
            excludeBodies = [],
            includeJ2 = false,
            centralBody = null
        } = options;

        const acceleration = new PhysicsVector3();

        // N-body gravitational forces
        for (const body of bodies) {
            if (excludeBodies.includes(body.naifId || body.id)) continue;

            // Handle both CelestialBody instances and legacy objects
            const bodyPos = body.position instanceof PhysicsVector3
                ? body.position
                : PhysicsVector3.fromArray(body.position);

            const r = bodyPos.clone().sub(position);
            const distance = r.length();

            if (distance > 0) {
                // Use CelestialBody GM property if available, otherwise fallback
                const mu = body.GM || body.mu || (PhysicsConstants.PHYSICS.G * body.mass);
                const accelMag = mu / (distance * distance);
                acceleration.addScaledVector(r.normalize(), accelMag);
            }
        }

        // J2 perturbation for oblate bodies
        if (includeJ2 && centralBody) {
            let j2Accel;
            if (typeof centralBody.computeJ2Acceleration === 'function') {
                // Use CelestialBody method
                j2Accel = centralBody.computeJ2Acceleration(position);
            } else if (centralBody.J2) {
                // Fallback to legacy computation
                j2Accel = this.computeJ2Acceleration(position, centralBody);
            }
            if (j2Accel) {
                acceleration.add(j2Accel);
            }
        }

        return acceleration;
    }

    /**
     * Compute J2 perturbation acceleration (oblateness effect)
     * @param {PhysicsVector3} position - Position relative to central body (km)
     * @param {Object} body - Central body with J2, radius, and mass
     * @returns {PhysicsVector3} - J2 acceleration (km/s²)
     */
    static computeJ2Acceleration(position, body) {
        if (!body.J2 || !body.radius) return new PhysicsVector3();

        const r = position.length();
        const mu = body.mu || (PhysicsConstants.PHYSICS.G * body.mass);
        const J2 = body.J2;
        const Re = body.radius;

        // Avoid singularity at center
        if (r < Re) return new PhysicsVector3();

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

        return new PhysicsVector3(ax, ay, az);
    }

    /**
     * Compute gravitational force between two bodies
     * @param {Object|CelestialBody} body1 - First body with position and mass
     * @param {Object|CelestialBody} body2 - Second body with position and mass
     * @returns {PhysicsVector3} - Gravitational force on body1 due to body2 (kg⋅km/s²)
     */
    static computeForce(body1, body2) {
        const pos1 = body1.position instanceof PhysicsVector3
            ? body1.position
            : PhysicsVector3.fromArray(body1.position);
        const pos2 = body2.position instanceof PhysicsVector3
            ? body2.position
            : PhysicsVector3.fromArray(body2.position);

        const r = pos2.clone().sub(pos1);
        const distance = r.length();

        if (distance === 0) return new PhysicsVector3();

        const mass1 = body1.mass || 0;
        const mass2 = body2.mass || 0;
        const forceMag = PhysicsConstants.PHYSICS.G * mass1 * mass2 / (distance * distance);
        return r.normalize().multiplyScalar(forceMag);
    }

    /**
     * Compute potential energy between two bodies
     * @param {Object} body1 - First body with position and mass
     * @param {Object} body2 - Second body with position and mass
     * @returns {number} - Gravitational potential energy (kg⋅km²/s²)
     */
    static computePotentialEnergy(body1, body2) {
        const pos1 = body1.position instanceof PhysicsVector3
            ? body1.position
            : PhysicsVector3.fromArray(body1.position);
        const pos2 = body2.position instanceof PhysicsVector3
            ? body2.position
            : PhysicsVector3.fromArray(body2.position);

        const distance = pos1.distanceTo(pos2);
        if (distance === 0) return 0;

        return -PhysicsConstants.PHYSICS.G * body1.mass * body2.mass / distance;
    }

    /**
     * Compute escape velocity from a body's surface or given distance
     * @param {Object|number} bodyOrGM - Body with mass/GM or GM value directly
     * @param {number} distance - Distance from center (km, optional - uses body.radius if not provided)
     * @returns {number} - Escape velocity (km/s)
     */
    static computeEscapeVelocity(bodyOrGM, distance = null) {
        let mu, r;

        if (typeof bodyOrGM === 'number') {
            mu = bodyOrGM;
            if (!distance) {
                console.warn('[GravityCalculator] Distance required when GM is passed directly');
                return 0;
            }
            r = distance;
        } else {
            mu = bodyOrGM.GM || bodyOrGM.mu || (PhysicsConstants.PHYSICS.G * bodyOrGM.mass);
            r = distance || bodyOrGM.radius;
        }

        if (!mu || mu <= 0 || !r || r <= 0) return 0;
        return Math.sqrt(2 * mu / r);
    }

    /**
     * Compute circular orbital velocity at a given distance
     * @param {Object|number} centralBodyOrGM - Central body with mass/GM or GM value directly
     * @param {number} distance - Distance from center (km)
     * @returns {number} - Circular orbital velocity (km/s)
     */
    static computeOrbitalVelocity(centralBodyOrGM, distance) {
        if (distance <= 0) return 0;

        let mu;
        if (typeof centralBodyOrGM === 'number') {
            mu = centralBodyOrGM; // GM passed directly
        } else {
            mu = centralBodyOrGM.GM || centralBodyOrGM.mu || (PhysicsConstants.PHYSICS.G * centralBodyOrGM.mass);
        }

        if (!mu || mu <= 0) {
            console.warn('[GravityCalculator] Invalid gravitational parameter for orbital velocity calculation');
            return 0;
        }

        return Math.sqrt(mu / distance);
    }

    /**
     * Compute orbital velocity for multiple orbit types using vis-viva equation
     * @param {Object|number} centralBodyOrGM - Central body or GM value
     * @param {number} semiMajorAxis - Semi-major axis (km)
     * @param {number} eccentricity - Orbital eccentricity (0-1)
     * @param {number} currentRadius - Current distance from center (km, optional)
     * @returns {Object} - Velocity components {circular, apoapsis, periapsis, current?}
     */
    static computeOrbitalVelocities(centralBodyOrGM, semiMajorAxis, eccentricity = 0, currentRadius = null) {
        let mu;
        if (typeof centralBodyOrGM === 'number') {
            mu = centralBodyOrGM;
        } else {
            mu = centralBodyOrGM.GM || centralBodyOrGM.mu || (PhysicsConstants.PHYSICS.G * centralBodyOrGM.mass);
        }

        if (!mu || mu <= 0 || semiMajorAxis <= 0) {
            return { circular: 0, apoapsis: 0, periapsis: 0 };
        }

        const result = {
            circular: Math.sqrt(mu / semiMajorAxis),
            apoapsis: 0,
            periapsis: 0
        };

        if (eccentricity >= 0 && eccentricity < 1) {
            const ra = semiMajorAxis * (1 + eccentricity); // Apoapsis radius
            const rp = semiMajorAxis * (1 - eccentricity); // Periapsis radius

            // Vis-viva equation: v = sqrt(mu * (2/r - 1/a))
            result.apoapsis = Math.sqrt(mu * (2 / ra - 1 / semiMajorAxis));
            result.periapsis = Math.sqrt(mu * (2 / rp - 1 / semiMajorAxis));
        }

        if (currentRadius && currentRadius > 0) {
            result.current = Math.sqrt(mu * (2 / currentRadius - 1 / semiMajorAxis));
        }

        return result;
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
        return a * (1 - e) * Math.pow(massRatio, 1 / 3);
    }

    /**
     * Check if position is within a body's sphere of influence
     * @param {PhysicsVector3} position - Position to check (km)
     * @param {Object} body - Body with position and soiRadius
     * @returns {boolean} - True if within SOI
     */
    static isWithinSOI(position, body) {
        if (!body.soiRadius) return false;

        const bodyPos = body.position instanceof PhysicsVector3
            ? body.position
            : PhysicsVector3.fromArray(body.position);

        const distance = position.distanceTo(bodyPos);
        return distance < body.soiRadius;
    }

    /**
     * Find the dominant gravitational body at a position
     * @param {PhysicsVector3} position - Position to check (km)
     * @param {Array} bodies - Array of bodies to check
     * @returns {Object|null} - Dominant body or null
     */
    static findDominantBody(position, bodies) {
        let dominantBody = null;
        let maxAcceleration = 0;

        for (const body of bodies) {
            const bodyPos = body.position instanceof PhysicsVector3
                ? body.position
                : PhysicsVector3.fromArray(body.position);

            const r = position.distanceTo(bodyPos);
            if (r === 0) continue;

            const mu = body.mu || (PhysicsConstants.PHYSICS.G * body.mass);
            const acceleration = mu / (r * r);

            if (acceleration > maxAcceleration) {
                maxAcceleration = acceleration;
                dominantBody = body;
            }
        }

        return dominantBody;
    }
}