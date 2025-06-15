import { AtmosphericModels } from '../core/AtmosphericModels.js';
import { GravityCalculator } from '../core/GravityCalculator.js';
import { UnifiedSatellitePropagator } from '../core/UnifiedSatellitePropagator.js';
import { stateToKeplerian } from '../utils/KeplerianUtils.js';
import { PhysicsConstants } from '../core/PhysicsConstants.js';
import { MathUtils } from '../utils/MathUtils.js';
import { PhysicsVector3 } from '../utils/PhysicsVector3.js';

/**
 * Centralized orbital integration methods for the simulation
 * Consolidates RK4, RK45, Euler, and other integration schemes
 */

// Store active timeout IDs for cleanup
const activeTimeouts = new Set();

/**
 * Cleanup function to clear all active timeouts
 */
export function cleanupTimeouts() {
    activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    activeTimeouts.clear();
}

// Working vector pools to avoid GC pressure
const _vectorPool = {
    positions: Array.from({ length: 8 }, () => new PhysicsVector3()),
    velocities: Array.from({ length: 8 }, () => new PhysicsVector3()),
    accelerations: Array.from({ length: 4 }, () => new PhysicsVector3()),
    ks: Array.from({ length: 8 }, () => new PhysicsVector3()),
    // Additional working vectors for RK45
    workVecs: Array.from({ length: 20 }, () => new PhysicsVector3())
};

/**
 * 4th-order Runge-Kutta (RK4) integration with optimized memory allocation
 * Uses pre-allocated vector pools to eliminate GC pressure in integration loops
 * 
 * @param {Vector3} position - Current position (km)
 * @param {Vector3} velocity - Current velocity (km/s)
 * @param {Function} accelerationFunc - Function that computes acceleration given state
 * @param {number} dt - Time step (seconds)
 * @returns {{position: Vector3, velocity: Vector3}} - New state
 */
export function integrateRK4(position, velocity, accelerationFunc, dt) {
    // Get pooled vectors
    const [pos0, pos1, pos2, pos3] = _vectorPool.positions;
    const [vel0, vel1, vel2, vel3] = _vectorPool.velocities;
    const [acc0, acc1, acc2, acc3] = _vectorPool.accelerations;
    const [k1p, k1v, k2p, k2v, k3p, k3v, k4p, k4v] = _vectorPool.ks;

    // Initialize with input values
    pos0.copy(position);
    vel0.copy(velocity);

    // k1
    acc0.copy(accelerationFunc(pos0, vel0));
    k1v.copy(acc0).multiplyScalar(dt);
    k1p.copy(vel0).multiplyScalar(dt);

    // k2
    pos1.copy(pos0).addScaledVector(k1p, 0.5);
    vel1.copy(vel0).addScaledVector(k1v, 0.5);
    acc1.copy(accelerationFunc(pos1, vel1));
    k2v.copy(acc1).multiplyScalar(dt);
    k2p.copy(vel1).multiplyScalar(dt);

    // k3
    pos2.copy(pos0).addScaledVector(k2p, 0.5);
    vel2.copy(vel0).addScaledVector(k2v, 0.5);
    acc2.copy(accelerationFunc(pos2, vel2));
    k3v.copy(acc2).multiplyScalar(dt);
    k3p.copy(vel2).multiplyScalar(dt);

    // k4
    pos3.copy(pos0).add(k3p);
    vel3.copy(vel0).add(k3v);
    acc3.copy(accelerationFunc(pos3, vel3));
    k4v.copy(acc3).multiplyScalar(dt);
    k4p.copy(vel3).multiplyScalar(dt);

    // Combine steps (reuse pos0 and vel0 as output)
    pos0.copy(position)
        .addScaledVector(k1p, 1 / 6)
        .addScaledVector(k2p, 1 / 3)
        .addScaledVector(k3p, 1 / 3)
        .addScaledVector(k4p, 1 / 6);

    vel0.copy(velocity)
        .addScaledVector(k1v, 1 / 6)
        .addScaledVector(k2v, 1 / 3)
        .addScaledVector(k3v, 1 / 3)
        .addScaledVector(k4v, 1 / 6);

    // Return new PhysicsVector3s with the computed values
    return { position: pos0.clone(), velocity: vel0.clone() };
}

/**
 * Adaptive Runge-Kutta 4/5 (Dormand-Prince) integration with error control
 * 
 * @param {PhysicsVector3} position - Current position (km)
 * @param {PhysicsVector3} velocity - Current velocity (km/s)
 * @param {Function} accelerationFunc - Function that computes acceleration
 * @param {number} targetTime - Target integration time (seconds)
 * @param {Object} options - Integration options
 * @returns {{position: PhysicsVector3, velocity: PhysicsVector3, actualTime: number}}
 */
export function integrateRK45(position, velocity, accelerationFunc, targetTime, options = {}) {
    const {
        absTol = 1e-6,
        relTol = 1e-6,
        minStep = 1e-6,
        maxStep = 60,
        sensitivityScale = 1
    } = options;

    let t = 0;
    let dt = Math.min(maxStep, targetTime * 0.1);

    // Use working vectors from pool
    const pos = _vectorPool.workVecs[0].copy(position);
    const vel = _vectorPool.workVecs[1].copy(velocity);

    // Pre-allocate all working vectors
    const k1p = _vectorPool.workVecs[2];
    const k1v = _vectorPool.workVecs[3];
    const k2p = _vectorPool.workVecs[4];
    const k2v = _vectorPool.workVecs[5];
    const k3p = _vectorPool.workVecs[6];
    const k3v = _vectorPool.workVecs[7];
    const k4p = _vectorPool.workVecs[8];
    const k4v = _vectorPool.workVecs[9];
    const k5p = _vectorPool.workVecs[10];
    const k5v = _vectorPool.workVecs[11];
    const k6p = _vectorPool.workVecs[12];
    const k6v = _vectorPool.workVecs[13];
    const k7p = _vectorPool.workVecs[14];
    const k7v = _vectorPool.workVecs[15];

    const pos2 = _vectorPool.workVecs[16];
    const vel2 = _vectorPool.workVecs[17];
    const pos3 = _vectorPool.workVecs[18];
    const vel3 = _vectorPool.workVecs[19];

    // Additional working vectors for stages 4-6
    const pos4 = _vectorPool.positions[0];
    const vel4 = _vectorPool.velocities[0];
    const pos5 = _vectorPool.positions[1];
    const vel5 = _vectorPool.velocities[1];
    const pos6 = _vectorPool.positions[2];
    const vel6 = _vectorPool.velocities[2];

    // Working vectors for final calculations
    const newPos4 = _vectorPool.positions[3];
    const newVel4 = _vectorPool.velocities[3];
    const newPos5 = _vectorPool.positions[4];
    const newVel5 = _vectorPool.velocities[4];
    const posError = _vectorPool.positions[5];
    const velError = _vectorPool.velocities[5];

    // Dormand-Prince coefficients
    const a21 = 1 / 5;
    const a31 = 3 / 40, a32 = 9 / 40;
    const a41 = 44 / 45, a42 = -56 / 15, a43 = 32 / 9;
    const a51 = 19372 / 6561, a52 = -25360 / 2187, a53 = 64448 / 6561, a54 = -212 / 729;
    const a61 = 9017 / 3168, a62 = -355 / 33, a63 = 46732 / 5247, a64 = 49 / 176, a65 = -5103 / 18656;

    const b1 = 35 / 384, b3 = 500 / 1113, b4 = 125 / 192, b5 = -2187 / 6784, b6 = 11 / 84;
    const b1s = 5179 / 57600, b3s = 7571 / 16695, b4s = 393 / 640, b5s = -92097 / 339200, b6s = 187 / 2100, b7s = 1 / 40;

    while (t < targetTime) {
        if (t + dt > targetTime) dt = targetTime - t;

        // RK45 stages - reuse working vectors
        // Stage 1
        k1v.copy(accelerationFunc(pos, vel));
        k1p.copy(vel);

        // Stage 2
        pos2.copy(pos).addScaledVector(k1p, a21 * dt);
        vel2.copy(vel).addScaledVector(k1v, a21 * dt);
        k2v.copy(accelerationFunc(pos2, vel2));
        k2p.copy(vel2);

        // Stage 3
        pos3.copy(pos)
            .addScaledVector(k1p, a31 * dt)
            .addScaledVector(k2p, a32 * dt);
        vel3.copy(vel)
            .addScaledVector(k1v, a31 * dt)
            .addScaledVector(k2v, a32 * dt);
        k3v.copy(accelerationFunc(pos3, vel3));
        k3p.copy(vel3);

        // Stage 4
        pos4.copy(pos)
            .addScaledVector(k1p, a41 * dt)
            .addScaledVector(k2p, a42 * dt)
            .addScaledVector(k3p, a43 * dt);
        vel4.copy(vel)
            .addScaledVector(k1v, a41 * dt)
            .addScaledVector(k2v, a42 * dt)
            .addScaledVector(k3v, a43 * dt);
        k4v.copy(accelerationFunc(pos4, vel4));
        k4p.copy(vel4);

        // Stage 5
        pos5.copy(pos)
            .addScaledVector(k1p, a51 * dt)
            .addScaledVector(k2p, a52 * dt)
            .addScaledVector(k3p, a53 * dt)
            .addScaledVector(k4p, a54 * dt);
        vel5.copy(vel)
            .addScaledVector(k1v, a51 * dt)
            .addScaledVector(k2v, a52 * dt)
            .addScaledVector(k3v, a53 * dt)
            .addScaledVector(k4v, a54 * dt);
        k5v.copy(accelerationFunc(pos5, vel5));
        k5p.copy(vel5);

        // Stage 6
        pos6.copy(pos)
            .addScaledVector(k1p, a61 * dt)
            .addScaledVector(k2p, a62 * dt)
            .addScaledVector(k3p, a63 * dt)
            .addScaledVector(k4p, a64 * dt)
            .addScaledVector(k5p, a65 * dt);
        vel6.copy(vel)
            .addScaledVector(k1v, a61 * dt)
            .addScaledVector(k2v, a62 * dt)
            .addScaledVector(k3v, a63 * dt)
            .addScaledVector(k4v, a64 * dt)
            .addScaledVector(k5v, a65 * dt);
        k6v.copy(accelerationFunc(pos6, vel6));
        k6p.copy(vel6);

        // 4th order solution (note: b2 = 0 in Dormand-Prince)
        newPos4.copy(pos)
            .addScaledVector(k1p, b1 * dt)
            .addScaledVector(k3p, b3 * dt)
            .addScaledVector(k4p, b4 * dt)
            .addScaledVector(k5p, b5 * dt)
            .addScaledVector(k6p, b6 * dt);

        newVel4.copy(vel)
            .addScaledVector(k1v, b1 * dt)
            .addScaledVector(k3v, b3 * dt)
            .addScaledVector(k4v, b4 * dt)
            .addScaledVector(k5v, b5 * dt)
            .addScaledVector(k6v, b6 * dt);

        // 5th order solution for error estimation
        k7v.copy(accelerationFunc(pos6, vel6));
        k7p.copy(vel6);

        newPos5.copy(pos)
            .addScaledVector(k1p, b1s * dt)
            .addScaledVector(k3p, b3s * dt)
            .addScaledVector(k4p, b4s * dt)
            .addScaledVector(k5p, b5s * dt)
            .addScaledVector(k6p, b6s * dt)
            .addScaledVector(k7p, b7s * dt);

        newVel5.copy(vel)
            .addScaledVector(k1v, b1s * dt)
            .addScaledVector(k3v, b3s * dt)
            .addScaledVector(k4v, b4s * dt)
            .addScaledVector(k5v, b5s * dt)
            .addScaledVector(k6v, b6s * dt)
            .addScaledVector(k7v, b7s * dt);

        // Error estimation
        posError.copy(newPos5).sub(newPos4);
        velError.copy(newVel5).sub(newVel4);

        const posErrorMag = posError.length();
        const velErrorMag = velError.length();

        // Scale errors by tolerance
        const posScale = absTol + relTol * Math.max(pos.length(), newPos4.length());
        const velScale = absTol + relTol * Math.max(vel.length(), newVel4.length());

        const error = Math.max(posErrorMag / posScale, velErrorMag / velScale) * sensitivityScale;

        if (error <= 1.0 || dt <= minStep) {
            // Accept step
            pos.copy(newPos4);
            vel.copy(newVel4);
            t += dt;
        }

        // Adjust step size
        if (error > 0) {
            const factor = Math.max(0.1, Math.min(5.0, 0.9 * Math.pow(1.0 / error, 0.2)));
            dt = MathUtils.clamp(dt * factor, minStep, maxStep);
        }

        // Safety check
        if (dt < minStep) {
            console.warn(`[OrbitalIntegrators] Step size too small: ${dt}`);
            break;
        }
    }

    return { position: pos.clone(), velocity: vel.clone(), actualTime: t };
}

/**
 * Simple Euler integration
 * @param {PhysicsVector3} position - Current position
 * @param {PhysicsVector3} velocity - Current velocity
 * @param {Function} accelerationFunc - Acceleration function
 * @param {number} dt - Time step
 * @returns {{position: PhysicsVector3, velocity: PhysicsVector3}}
 */
export function integrateEuler(position, velocity, accelerationFunc, dt) {
    const acceleration = accelerationFunc(position, velocity);

    // Use working vectors to avoid allocations
    const newPosition = _vectorPool.workVecs[0].copy(position).addScaledVector(velocity, dt);
    const newVelocity = _vectorPool.workVecs[1].copy(velocity).addScaledVector(acceleration, dt);

    return { position: newPosition.clone(), velocity: newVelocity.clone() };
}

/**
 * Verlet integration
 * @param {PhysicsVector3} position - Current position
 * @param {PhysicsVector3} prevPosition - Previous position
 * @param {Function} accelerationFunc - Acceleration function
 * @param {number} dt - Time step
 * @returns {{position: PhysicsVector3, velocity: PhysicsVector3}}
 */
export function integrateVerlet(position, prevPosition, accelerationFunc, dt) {
    const acceleration = accelerationFunc(position, null);

    // Use working vectors
    const newPosition = _vectorPool.workVecs[0].copy(position)
        .multiplyScalar(2)
        .sub(prevPosition)
        .addScaledVector(acceleration, dt * dt);

    const velocity = _vectorPool.workVecs[1].copy(newPosition).sub(prevPosition).divideScalar(2 * dt);

    return { position: newPosition.clone(), velocity: velocity.clone() };
}

/**
 * Leapfrog integration
 * @param {PhysicsVector3} position - Current position
 * @param {PhysicsVector3} velocity - Current velocity
 * @param {Function} accelerationFunc - Acceleration function
 * @param {number} dt - Time step
 * @returns {{position: PhysicsVector3, velocity: PhysicsVector3}}
 */
export function integrateLeapfrog(position, velocity, accelerationFunc, dt) {
    const acceleration = accelerationFunc(position, velocity);

    // Use working vectors
    const newVelocity = _vectorPool.workVecs[0].copy(velocity).addScaledVector(acceleration, dt);
    const newPosition = _vectorPool.workVecs[1].copy(position).addScaledVector(newVelocity, dt);

    return { position: newPosition.clone(), velocity: newVelocity.clone() };
}

// Vector conversion pools to avoid allocations
const _conversionVectorPool = Array.from({ length: 4 }, () => new PhysicsVector3());
let _poolIndex = 0;

/**
 * Helper function to convert array-based state to Vector3 using object pool
 */
export function arrayToVector3(arr) {
    const vec = _conversionVectorPool[_poolIndex];
    _poolIndex = (_poolIndex + 1) % _conversionVectorPool.length;
    return vec.set(arr[0], arr[1], arr[2]);
}

/**
 * Helper function to convert Vector3 to array (optimized)
 */
export function vector3ToArray(vec) {
    return [vec.x, vec.y, vec.z];
}

/**
 * Reset vector pools to avoid memory leaks
 */
export function resetVectorPools() {
    _vectorPool.positions.forEach(v => v.set(0, 0, 0));
    _vectorPool.velocities.forEach(v => v.set(0, 0, 0));
    _vectorPool.accelerations.forEach(v => v.set(0, 0, 0));
    _vectorPool.ks.forEach(v => v.set(0, 0, 0));
    _vectorPool.workVecs.forEach(v => v.set(0, 0, 0));
    _conversionVectorPool.forEach(v => v.set(0, 0, 0));
    _poolIndex = 0;
    // Vectors are reused, so no need to recreate
}

/**
 * Analyze orbit type and propagation parameters
 * @param {Object} satellite - Satellite state with position, velocity, centralBodyNaifId
 * @param {Object} centralBody - Central body with mass property
 * @param {number} G - Gravitational constant
 * @returns {Object} { type: 'elliptical'|'parabolic'|'hyperbolic', period, duration, points }
 */
export function analyzeOrbit(satellite, centralBody, G) {
    // Handle both Vector3 and array formats
    const r = satellite.position.toArray ? satellite.position.clone() : PhysicsVector3.fromArray(satellite.position);
    const v = satellite.velocity.toArray ? satellite.velocity.clone() : PhysicsVector3.fromArray(satellite.velocity);
    const mu = G * centralBody.mass;

    // Calculate orbital energy
    const rMag = r.length();
    const vMag = v.length();
    const specificEnergy = (vMag * vMag / 2) - (mu / rMag);

    // Calculate eccentricity vector
    const h = new PhysicsVector3().crossVectors(r, v);
    const eVec = new PhysicsVector3()
        .crossVectors(v, h)
        .divideScalar(mu)
        .sub(r.clone().divideScalar(rMag));
    const eccentricity = eVec.length();

    let type, period;

    if (eccentricity < 1.0) {
        // Elliptical orbit (includes circular)
        type = 'elliptical';
        const a = -mu / (2 * specificEnergy);
        period = 2 * Math.PI * Math.sqrt(a * a * a / mu);
    } else if (eccentricity === 1.0) {
        // Parabolic orbit (exactly 1.0)
        type = 'parabolic';
        period = Infinity;
    } else {
        // Hyperbolic orbit
        type = 'hyperbolic';
        period = Infinity;
    }

    return { type, period, eccentricity, specificEnergy };
}

/**
 * Calculate propagation parameters for orbit visualization
 * @param {Object} orbitParams - Result from analyzeOrbit()
 * @param {number} orbitPeriods - Number of orbital periods to propagate
 * @param {number} pointsPerPeriod - Number of points per orbital period
 * @param {boolean} needsExtension - Whether this is extending existing orbit
 * @param {Object} cached - Cached orbit data if extending
 * @returns {Object} { maxDuration, timeStep }
 */
export function calculatePropagationParameters(orbitParams, orbitPeriods, pointsPerPeriod, needsExtension = false, cached = null) {
    let maxDuration;
    let timeStep;

    if (orbitParams.type === 'elliptical' && orbitParams.period > 0) {
        // For elliptical orbits, propagate for specified number of periods
        if (needsExtension && cached) {
            // Extend existing orbit by additional periods
            maxDuration = orbitPeriods * orbitParams.period;
        } else {
            // New orbit calculation
            maxDuration = orbitPeriods * orbitParams.period;
        }

        // Time step based on desired points per period
        timeStep = orbitParams.period / pointsPerPeriod;
    } else {
        // For parabolic/hyperbolic orbits, use fixed duration
        // Base duration on a reasonable time scale
        const baseDuration = 86400; // 1 day in seconds
        maxDuration = orbitPeriods * baseDuration; // Use orbitPeriods as a multiplier

        // Smaller time step for non-elliptical orbits to capture trajectory properly
        timeStep = maxDuration / (pointsPerPeriod * orbitPeriods);
    }

    // Ensure reasonable limits
    maxDuration = MathUtils.clamp(maxDuration, 60, 86400 * 365); // Between 1 minute and 1 year
    timeStep = MathUtils.clamp(timeStep, 0.1, 3600); // Between 0.1 seconds and 1 hour

    return { maxDuration, timeStep };
}

/**
 * Calculate duration to reach SOI boundary or max distance
 * Currently unused but kept for future escape trajectory calculations
 */
// function calculateEscapeDuration(r, v, centralBody) {
//     const AU = 149597870.7; // km
//     const soiRadius = centralBody.soiRadius || 1e9; // Default to large value
//     const maxRadius = centralBody.naifId === 10 ? 500 * AU : soiRadius;
//     
//     const currentRadius = r.length();
//     const radialVelocity = r.dot(v) / currentRadius;
//     
//     if (radialVelocity <= 0) {
//         // Not escaping
//         return 86400; // 1 day default
//     }
//     
//     const distanceToBoundary = maxRadius - currentRadius;
//     const estimatedTime = distanceToBoundary / radialVelocity;
//     
//     // Cap at reasonable values
//     return Math.min(Math.max(estimatedTime, 3600), 86400 * 365); // 1 hour to 1 year
// }

/**
 * Integration method selector
 * Returns appropriate integration function based on requirements
 * 
 * @param {string} method - Integration method name
 * @returns {Function} Integration function
 */
export function getIntegrator(method) {
    switch (method.toLowerCase()) {
        case 'rk4':
            return integrateRK4;
        case 'rk45':
        case 'adaptive':
            return integrateRK45;
        case 'euler':
            return integrateEuler;
        case 'verlet':
            return integrateVerlet;
        case 'leapfrog':
            return integrateLeapfrog;
        default:
            return integrateRK4;
    }
}

/**
 * Propagate orbit with atmospheric re-entry handling
 * @param {Array} pos0 - Initial position [x, y, z] (km)
 * @param {Array} vel0 - Initial velocity [vx, vy, vz] (km/s)
 * @param {Array} bodies - Array of gravitating bodies
 * @param {number} period - Orbital period (seconds)
 * @param {number} numPoints - Number of points to generate
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} Array of orbit points
 */
export async function propagateOrbit(pos0, vel0, bodies, period, numPoints, options = {}) {
    const {
        onProgress = null,
        allowFullEllipse = false,
        ballisticCoefficient = AtmosphericModels.DEFAULT_BALLISTIC_COEFFICIENT,
        bodyMap = null,
        centralBodyNaifId = null
    } = options;

    const dt = period / numPoints;
    const points = [];
    const batchSize = Math.max(1, Math.floor(numPoints / 20));

    let pos = pos0.slice();
    let vel = vel0.slice();

    // Find the central body for orbital calculations
    let dominantBody = null;

    // If centralBodyNaifId is specified, use that body
    if (centralBodyNaifId !== null) {
        dominantBody = bodies.find(body =>
            body.naif === centralBodyNaifId ||
            body.naifId === centralBodyNaifId ||
            parseInt(body.naif) === parseInt(centralBodyNaifId) ||
            parseInt(body.naifId) === parseInt(centralBodyNaifId)
        );

        if (!dominantBody) {
            console.warn(`[OrbitalIntegrators] Specified central body ${centralBodyNaifId} not found, falling back to auto-detection`);
        }
    }

    // Fallback: Find the dominant gravitational body at the initial position
    if (!dominantBody) {
        const position = new PhysicsVector3(...pos0);
        let maxInfluence = 0;

        for (const body of bodies) {
            if (!body.mass || !body.position) continue;
            const bodyPos = new PhysicsVector3(...(body.position.toArray ? body.position.toArray() : body.position));
            const distance = position.distanceTo(bodyPos);
            const influence = body.mass / (distance * distance);
            if (influence > maxInfluence) {
                maxInfluence = influence;
                dominantBody = body;
            }
        }

        // Final fallback if no dominant body found
        if (!dominantBody && bodies.length > 0) {
            // Try to find any body with valid GM or mass
            dominantBody = bodies.find(body => body.GM || (body.mass && body.mass > 0));
            if (!dominantBody) {
                dominantBody = bodies[0];
            }
        }
    }

    // Use the dominant body's gravitational parameter, with safety check
    if (!dominantBody || (!dominantBody.GM && !dominantBody.mass)) {
        console.warn('[OrbitalIntegrators] No valid dominant body found for orbit propagation');
        console.warn('[OrbitalIntegrators] Available bodies:', bodies.map(b => ({
            name: b.name || 'unnamed',
            naif: b.naif || b.naifId,
            mass: b.mass,
            GM: b.GM,
            hasPosition: !!b.position
        })));
        console.warn('[OrbitalIntegrators] Selected dominantBody:', dominantBody ? {
            name: dominantBody.name,
            mass: dominantBody.mass,
            GM: dominantBody.GM
        } : 'null');
        return [];
    }
    const mu = dominantBody.GM || (PhysicsConstants.PHYSICS.G * dominantBody.mass);
    const oe = stateToKeplerian(
        new PhysicsVector3(...pos0),
        new PhysicsVector3(...vel0),
        mu
    );
    const hyperbolic = oe && oe.eccentricity >= 1;

    for (let i = 0; i < numPoints; i++) {
        // Integrate one step using centralized physics (same as main engine)
        const accelerationFunc = (p, v) => {
            // Convert to pure physics format
            const satPhysics = {
                position: p.toArray ? p.toArray() : [p.x, p.y, p.z],
                velocity: v.toArray ? v.toArray() : [v.x, v.y, v.z],
                centralBodyNaifId: centralBodyNaifId,
                ballisticCoefficient: ballisticCoefficient
            };

            // Convert bodies to pure physics format
            const bodiesPhysics = {};
            for (const body of bodies) {
                const naifId = body.naif || body.naifId || body.id;
                bodiesPhysics[naifId] = {
                    ...body,
                    position: Array.isArray(body.position) ? body.position :
                        (body.position.toArray ? body.position.toArray() : [0, 0, 0]),
                    velocity: body.velocity || [0, 0, 0],
                    naifId: naifId
                };
            }

            // Use UnifiedSatellitePropagator for consistent physics
            const accelArray = UnifiedSatellitePropagator.computeAcceleration(satPhysics, bodiesPhysics, {
                includeJ2: true,
                includeDrag: true,
                includeThirdBody: false
            });

            // Convert back to PhysicsVector3 for integration
            return PhysicsVector3.fromArray(accelArray);
        };

        const state = integrateRK45(
            new PhysicsVector3(...pos),
            new PhysicsVector3(...vel),
            accelerationFunc,
            dt,
            { absTol: 1e-6, relTol: 1e-6 }
        );

        pos = state.position.toArray();
        vel = state.velocity.toArray();

        // Check for atmospheric entry
        const r = Math.hypot(...pos);
        if (!allowFullEllipse && !hyperbolic && bodyMap) {
            const host = AtmosphericModels.findHostPlanet(pos, bodyMap);
            if (host && host.atmosphere) {
                const cutoff = host.radius + (host.atmosphere.thickness || 100);
                if (r <= cutoff) {
                    // Switch to atmospheric propagation
                    const atmPoints = await propagateAtmosphere(
                        pos, vel, bodies, 300, 1, ballisticCoefficient, bodyMap
                    );
                    atmPoints.forEach(pt => points.push({
                        position: pt.position,
                        timeOffset: dt * i + pt.timeOffset
                    }));
                    if (onProgress) onProgress(1);
                    break;
                }
            }
        }

        points.push({ position: pos.slice(), timeOffset: dt * (i + 1) });

        // Progress callback
        if (onProgress && ((i + 1) % batchSize === 0 || i === numPoints - 1)) {
            onProgress((i + 1) / numPoints);
            await new Promise(resolve => {
                const timeoutId = setTimeout(() => {
                    activeTimeouts.delete(timeoutId);
                    resolve();
                }, 0);
                activeTimeouts.add(timeoutId);
            }); // Yield
        }
    }

    return points;
}

/**
 * Simple atmospheric propagation using Euler integration
 * @param {Array} pos0 - Initial position [x, y, z] (km)
 * @param {Array} vel0 - Initial velocity [vx, vy, vz] (km/s)
 * @param {Array} bodies - Array of gravitating bodies
 * @param {number} maxSeconds - Maximum propagation time (seconds)
 * @param {number} dt - Time step (seconds)
 * @param {number} ballisticCoefficient - Ballistic coefficient (kg/m²)
 * @param {Map|Object} bodyMap - Map of bodies for finding host planet
 * @returns {Promise<Array>} Array of trajectory points
 */
export async function propagateAtmosphere(
    pos0, vel0, bodies, maxSeconds = 300, dt = 1,
    ballisticCoefficient = AtmosphericModels.DEFAULT_BALLISTIC_COEFFICIENT,
    bodyMap = null
) {
    const points = [];
    const steps = Math.ceil(maxSeconds / dt);

    const p = pos0.slice();
    const v = vel0.slice();

    // Find host planet for ground impact check
    const host = AtmosphericModels.findHostPlanet(p, bodyMap || bodies);
    const groundRadius = host && host.radius ? host.radius : 0;

    for (let i = 0; i < steps; i++) {
        // Yield periodically
        if (i && i % 20 === 0) {
            await new Promise(resolve => {
                const timeoutId = setTimeout(() => {
                    activeTimeouts.delete(timeoutId);
                    resolve();
                }, 0);
                activeTimeouts.add(timeoutId);
            });
        }

        // Compute accelerations
        const grav = GravityCalculator.computeAcceleration(
            new PhysicsVector3(...p),
            bodies
        );
        const drag = host
            ? AtmosphericModels.computeDragAcceleration(p, v, host, ballisticCoefficient)
            : [0, 0, 0];

        // Euler integration
        v[0] += (grav.x + drag[0]) * dt;
        v[1] += (grav.y + drag[1]) * dt;
        v[2] += (grav.z + drag[2]) * dt;

        p[0] += v[0] * dt;
        p[1] += v[1] * dt;
        p[2] += v[2] * dt;

        points.push({
            position: p.slice(),
            timeOffset: (i + 1) * dt
        });

        // Check for ground impact
        const r = Math.hypot(...p);
        if (groundRadius && r <= groundRadius) {
            break;
        }
    }

    return points;
}