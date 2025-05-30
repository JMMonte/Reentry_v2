import * as THREE from 'three';
import { AtmosphericModels } from '../core/AtmosphericModels.js';
import { GravityCalculator } from '../core/GravityCalculator.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { Constants } from '../../utils/Constants.js';

/**
 * Centralized orbital integration methods for the simulation
 * Consolidates RK4, RK45, Euler, and other integration schemes
 */

/**
 * 4th-order Runge-Kutta (RK4) integration
 * Standard fixed-step integration for orbital mechanics
 * 
 * @param {Vector3} position - Current position (km)
 * @param {Vector3} velocity - Current velocity (km/s)
 * @param {Function} accelerationFunc - Function that computes acceleration given state
 * @param {number} dt - Time step (seconds)
 * @returns {{position: Vector3, velocity: Vector3}} - New state
 */
export function integrateRK4(position, velocity, accelerationFunc, dt) {
    const pos0 = position.clone();
    const vel0 = velocity.clone();
    
    // k1
    const acc0 = accelerationFunc(pos0, vel0);
    const k1v = acc0.clone().multiplyScalar(dt);
    const k1p = vel0.clone().multiplyScalar(dt);
    
    // k2
    const pos1 = pos0.clone().addScaledVector(k1p, 0.5);
    const vel1 = vel0.clone().addScaledVector(k1v, 0.5);
    const acc1 = accelerationFunc(pos1, vel1);
    const k2v = acc1.clone().multiplyScalar(dt);
    const k2p = vel1.clone().multiplyScalar(dt);
    
    // k3
    const pos2 = pos0.clone().addScaledVector(k2p, 0.5);
    const vel2 = vel0.clone().addScaledVector(k2v, 0.5);
    const acc2 = accelerationFunc(pos2, vel2);
    const k3v = acc2.clone().multiplyScalar(dt);
    const k3p = vel2.clone().multiplyScalar(dt);
    
    // k4
    const pos3 = pos0.clone().add(k3p);
    const vel3 = vel0.clone().add(k3v);
    const acc3 = accelerationFunc(pos3, vel3);
    const k4v = acc3.clone().multiplyScalar(dt);
    const k4p = vel3.clone().multiplyScalar(dt);
    
    // Combine steps
    const newPosition = pos0.clone()
        .addScaledVector(k1p, 1/6)
        .addScaledVector(k2p, 1/3)
        .addScaledVector(k3p, 1/3)
        .addScaledVector(k4p, 1/6);
        
    const newVelocity = vel0.clone()
        .addScaledVector(k1v, 1/6)
        .addScaledVector(k2v, 1/3)
        .addScaledVector(k3v, 1/3)
        .addScaledVector(k4v, 1/6);
    
    return { position: newPosition, velocity: newVelocity };
}

/**
 * Dormand-Prince RK45 adaptive integration
 * Variable timestep integration with error control
 * 
 * @param {THREE.Vector3} position - Current position (km)
 * @param {THREE.Vector3} velocity - Current velocity (km/s)
 * @param {Function} accelerationFunc - Function that computes acceleration
 * @param {number} targetTime - Target integration time (seconds)
 * @param {Object} options - Integration options
 * @returns {{position: THREE.Vector3, velocity: THREE.Vector3, actualTime: number}}
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
    
    const pos = position.clone();
    const vel = velocity.clone();
    
    // Dormand-Prince coefficients
    const a21 = 1/5;
    const a31 = 3/40, a32 = 9/40;
    const a41 = 44/45, a42 = -56/15, a43 = 32/9;
    const a51 = 19372/6561, a52 = -25360/2187, a53 = 64448/6561, a54 = -212/729;
    const a61 = 9017/3168, a62 = -355/33, a63 = 46732/5247, a64 = 49/176, a65 = -5103/18656;
    
    const b1 = 35/384, b3 = 500/1113, b4 = 125/192, b5 = -2187/6784, b6 = 11/84;
    const b1s = 5179/57600, b3s = 7571/16695, b4s = 393/640, b5s = -92097/339200, b6s = 187/2100, b7s = 1/40;
    
    while (t < targetTime) {
        if (t + dt > targetTime) dt = targetTime - t;
        
        // RK45 stages
        const k1 = accelerationFunc(pos, vel).multiplyScalar(dt);
        
        const pos2 = pos.clone().addScaledVector(vel, a21 * dt).addScaledVector(k1, a21 * dt * 0.5);
        const vel2 = vel.clone().addScaledVector(k1, a21);
        const k2 = accelerationFunc(pos2, vel2).multiplyScalar(dt);
        
        const pos3 = pos.clone()
            .addScaledVector(vel, (a31 + a32) * dt)
            .addScaledVector(k1, a31 * dt * 0.5)
            .addScaledVector(k2, a32 * dt * 0.5);
        const vel3 = vel.clone()
            .addScaledVector(k1, a31)
            .addScaledVector(k2, a32);
        const k3 = accelerationFunc(pos3, vel3).multiplyScalar(dt);
        
        const pos4 = pos.clone()
            .addScaledVector(vel, (a41 + a42 + a43) * dt)
            .addScaledVector(k1, a41 * dt * 0.5)
            .addScaledVector(k2, a42 * dt * 0.5)
            .addScaledVector(k3, a43 * dt * 0.5);
        const vel4 = vel.clone()
            .addScaledVector(k1, a41)
            .addScaledVector(k2, a42)
            .addScaledVector(k3, a43);
        const k4 = accelerationFunc(pos4, vel4).multiplyScalar(dt);
        
        const pos5 = pos.clone()
            .addScaledVector(vel, (a51 + a52 + a53 + a54) * dt)
            .addScaledVector(k1, a51 * dt * 0.5)
            .addScaledVector(k2, a52 * dt * 0.5)
            .addScaledVector(k3, a53 * dt * 0.5)
            .addScaledVector(k4, a54 * dt * 0.5);
        const vel5 = vel.clone()
            .addScaledVector(k1, a51)
            .addScaledVector(k2, a52)
            .addScaledVector(k3, a53)
            .addScaledVector(k4, a54);
        const k5 = accelerationFunc(pos5, vel5).multiplyScalar(dt);
        
        const pos6 = pos.clone()
            .addScaledVector(vel, (a61 + a62 + a63 + a64 + a65) * dt)
            .addScaledVector(k1, a61 * dt * 0.5)
            .addScaledVector(k2, a62 * dt * 0.5)
            .addScaledVector(k3, a63 * dt * 0.5)
            .addScaledVector(k4, a64 * dt * 0.5)
            .addScaledVector(k5, a65 * dt * 0.5);
        const vel6 = vel.clone()
            .addScaledVector(k1, a61)
            .addScaledVector(k2, a62)
            .addScaledVector(k3, a63)
            .addScaledVector(k4, a64)
            .addScaledVector(k5, a65);
        const k6 = accelerationFunc(pos6, vel6).multiplyScalar(dt);
        
        // 4th order solution
        const newPos4 = pos.clone()
            .addScaledVector(vel, dt)
            .addScaledVector(k1, b1 * dt * 0.5)
            .addScaledVector(k3, b3 * dt * 0.5)
            .addScaledVector(k4, b4 * dt * 0.5)
            .addScaledVector(k5, b5 * dt * 0.5)
            .addScaledVector(k6, b6 * dt * 0.5);
            
        const newVel4 = vel.clone()
            .addScaledVector(k1, b1)
            .addScaledVector(k3, b3)
            .addScaledVector(k4, b4)
            .addScaledVector(k5, b5)
            .addScaledVector(k6, b6);
        
        // 5th order solution (for error estimation)
        const pos7 = newPos4.clone();
        const vel7 = newVel4.clone();
        const k7 = accelerationFunc(pos7, vel7).multiplyScalar(dt);
        
        const newPos5 = pos.clone()
            .addScaledVector(vel, dt)
            .addScaledVector(k1, b1s * dt * 0.5)
            .addScaledVector(k3, b3s * dt * 0.5)
            .addScaledVector(k4, b4s * dt * 0.5)
            .addScaledVector(k5, b5s * dt * 0.5)
            .addScaledVector(k6, b6s * dt * 0.5)
            .addScaledVector(k7, b7s * dt * 0.5);
            
        const newVel5 = vel.clone()
            .addScaledVector(k1, b1s)
            .addScaledVector(k3, b3s)
            .addScaledVector(k4, b4s)
            .addScaledVector(k5, b5s)
            .addScaledVector(k6, b6s)
            .addScaledVector(k7, b7s);
        
        // Error estimation
        const errPos = newPos5.clone().sub(newPos4).length();
        const errVel = newVel5.clone().sub(newVel4).length();
        
        const accMag = k1.length() / dt;
        const dynTol = absTol / (1 + Math.log1p(sensitivityScale * accMag));
        
        const scalePos = dynTol + relTol * Math.max(pos.length(), newPos4.length());
        const scaleVel = dynTol + relTol * Math.max(vel.length(), newVel4.length());
        
        const errMax = Math.max(errPos / scalePos, errVel / scaleVel);
        
        // Step size control (PI controller)
        if (errMax <= 1) {
            // Accept step
            t += dt;
            pos.copy(newPos4);
            vel.copy(newVel4);
            
            // Increase step size
            dt *= Math.min(5, 0.9 * Math.pow(1 / errMax, 0.2));
            dt = Math.min(dt, maxStep);
        } else {
            // Reject step, decrease step size
            dt *= Math.max(0.2, 0.9 * Math.pow(1 / errMax, 0.2));
            dt = Math.max(dt, minStep);
        }
    }
    
    return { position: pos, velocity: vel, actualTime: t };
}

/**
 * Simple Euler integration
 * First-order integration, useful for atmospheric reentry
 * 
 * @param {THREE.Vector3} position - Current position (km)
 * @param {THREE.Vector3} velocity - Current velocity (km/s)
 * @param {Function} accelerationFunc - Function that computes acceleration
 * @param {number} dt - Time step (seconds)
 * @returns {{position: THREE.Vector3, velocity: THREE.Vector3}}
 */
export function integrateEuler(position, velocity, accelerationFunc, dt) {
    const acceleration = accelerationFunc(position, velocity);
    
    const newVelocity = velocity.clone().addScaledVector(acceleration, dt);
    const newPosition = position.clone().addScaledVector(velocity, dt);
    
    return { position: newPosition, velocity: newVelocity };
}

/**
 * Verlet integration
 * Symplectic integrator that conserves energy well
 * 
 * @param {THREE.Vector3} position - Current position (km)
 * @param {THREE.Vector3} prevPosition - Previous position (km)
 * @param {Function} accelerationFunc - Function that computes acceleration
 * @param {number} dt - Time step (seconds)
 * @returns {{position: THREE.Vector3, velocity: THREE.Vector3}}
 */
export function integrateVerlet(position, prevPosition, accelerationFunc, dt) {
    const acceleration = accelerationFunc(position, null);
    
    const newPosition = position.clone()
        .multiplyScalar(2)
        .sub(prevPosition)
        .addScaledVector(acceleration, dt * dt);
    
    // Estimate velocity from positions
    const velocity = newPosition.clone().sub(position).divideScalar(dt);
    
    return { position: newPosition, velocity: velocity };
}

/**
 * Leapfrog integration
 * Symplectic integrator with good long-term stability
 * 
 * @param {THREE.Vector3} position - Current position (km)
 * @param {THREE.Vector3} velocity - Current velocity at half-step (km/s)
 * @param {Function} accelerationFunc - Function that computes acceleration
 * @param {number} dt - Time step (seconds)
 * @returns {{position: THREE.Vector3, velocity: THREE.Vector3}}
 */
export function integrateLeapfrog(position, velocity, accelerationFunc, dt) {
    // Update position using velocity at half-step
    const newPosition = position.clone().addScaledVector(velocity, dt);
    
    // Calculate acceleration at new position
    const acceleration = accelerationFunc(newPosition, velocity);
    
    // Update velocity to next half-step
    const newVelocity = velocity.clone().addScaledVector(acceleration, dt);
    
    return { position: newPosition, velocity: newVelocity };
}

/**
 * Helper function to convert array-based state to Vector3
 */
export function arrayToVector3(arr) {
    return new THREE.Vector3(arr[0], arr[1], arr[2]);
}

/**
 * Helper function to convert Vector3 to array
 */
export function vector3ToArray(vec) {
    return [vec.x, vec.y, vec.z];
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
    const r = satellite.position.toArray ? satellite.position.clone() : new THREE.Vector3().fromArray(satellite.position);
    const v = satellite.velocity.toArray ? satellite.velocity.clone() : new THREE.Vector3().fromArray(satellite.velocity);
    const mu = G * centralBody.mass;
    
    // Calculate orbital energy
    const rMag = r.length();
    const vMag = v.length();
    const specificEnergy = (vMag * vMag / 2) - (mu / rMag);
    
    // Calculate eccentricity vector
    const h = new THREE.Vector3().crossVectors(r, v);
    const eVec = new THREE.Vector3()
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
        bodyMap = null
    } = options;

    const dt = period / numPoints;
    const points = [];
    const batchSize = Math.max(1, Math.floor(numPoints / 20));

    let pos = pos0.slice();
    let vel = vel0.slice();

    // Check if orbit is hyperbolic
    // Find the dominant gravitational body at the initial position
    const position = new THREE.Vector3(...pos0);
    let dominantBody = bodies[0]; // Default to first body
    let maxInfluence = 0;
    
    for (const body of bodies) {
        if (!body.mass || !body.position) continue;
        const bodyPos = new THREE.Vector3(...(body.position.toArray ? body.position.toArray() : body.position));
        const distance = position.distanceTo(bodyPos);
        const influence = body.mass / (distance * distance);
        if (influence > maxInfluence) {
            maxInfluence = influence;
            dominantBody = body;
        }
    }
    
    // Use the dominant body's gravitational parameter
    const mu = dominantBody.GM || (Constants.G * dominantBody.mass);
    const oe = PhysicsUtils.calculateDetailedOrbitalElements(
        new THREE.Vector3(...pos0),
        new THREE.Vector3(...vel0),
        mu
    );
    const hyperbolic = oe && oe.eccentricity >= 1;

    for (let i = 0; i < numPoints; i++) {
        // Integrate one step
        const accelerationFunc = (p, v) => {
            const grav = GravityCalculator.computeAcceleration(p, bodies);
            const planet = AtmosphericModels.findHostPlanet(p, bodyMap || bodies);
            if (planet) {
                const drag = AtmosphericModels.computeDragAcceleration(p, v, planet, ballisticCoefficient);
                return grav.add(new THREE.Vector3(...drag));
            }
            return grav;
        };

        const state = integrateRK45(
            new THREE.Vector3(...pos),
            new THREE.Vector3(...vel),
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
            await new Promise(resolve => setTimeout(resolve, 0)); // Yield
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
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Compute accelerations
        const grav = GravityCalculator.computeAcceleration(
            new THREE.Vector3(...p), 
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