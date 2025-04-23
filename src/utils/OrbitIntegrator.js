import * as THREE from 'three';
import { Constants } from './Constants.js';

/**
 * Compute gravitational acceleration (m/s^2) on a satellite at position pos (array [x,y,z])
 * given an array of perturbing bodies and a scale for those perturbations.
 * Bodies format: [{ position: {x,y,z}, mass }]
 */
export function computeAccel(pos, bodies, perturbationScale = 1.0) {
    let ax = 0, ay = 0, az = 0;
    const px = pos[0], py = pos[1], pz = pos[2];
    // Iterate bodies: assume first is central mass (Earth)
    bodies.forEach((body, i) => {
        const bx = body.position.x, by = body.position.y, bz = body.position.z;
        const dx = bx - px, dy = by - py, dz = bz - pz;
        const r2 = dx * dx + dy * dy + dz * dz;
        const r = Math.sqrt(r2);
        if (r <= 0) return;
        const mu = Constants.G * body.mass;
        if (i === 0) {
            // Central two-body term
            const inv = mu / (r2 * r);
            ax += inv * dx;
            ay += inv * dy;
            az += inv * dz;
        } else {
            // Differential perturbation (subtract central reference)
            // Reference at origin:
            const r02 = bx * bx + by * by + bz * bz;
            const r0 = Math.sqrt(r02);
            if (r0 <= 0) return;
            const invSat = mu / (r2 * r);
            const invRef = mu / (r02 * r0);
            ax += perturbationScale * (invSat * dx - invRef * bx);
            ay += perturbationScale * (invSat * dy - invRef * by);
            az += perturbationScale * (invSat * dz - invRef * bz);
        }
    });
    return [ax, ay, az];
}

// Atmospheric drag constants and model
const ATMOSPHERE_CUTOFF_ALTITUDE = 40000; // 100 km in meters
const DEFAULT_BALLISTIC_COEFFICIENT = 100; // kg/m^2, typical satellite ballistic coefficient

/**
 * Compute atmospheric drag acceleration (m/s^2) at position pos and velocity vel.
 */
function computeDragAcceleration(pos, vel, ballisticCoefficient = DEFAULT_BALLISTIC_COEFFICIENT) {
    const x = pos[0], y = pos[1], z = pos[2];
    const r = Math.sqrt(x * x + y * y + z * z);
    const altitude = r - Constants.earthRadius;
    if (altitude <= 0 || altitude > ATMOSPHERE_CUTOFF_ALTITUDE) {
        return [0, 0, 0];
    }
    const rho = Constants.atmosphereSeaLevelDensity * Math.exp(-altitude / Constants.atmosphereScaleHeight);
    const omega = 2 * Math.PI / Constants.siderialDay;
    const vAtmX = -omega * y;
    const vAtmY = omega * x;
    const vAtmZ = 0;
    const vrx = vel[0] - vAtmX;
    const vry = vel[1] - vAtmY;
    const vrz = vel[2] - vAtmZ;
    const vr = Math.sqrt(vrx * vrx + vry * vry + vrz * vrz);
    if (vr === 0) return [0, 0, 0];
    const aDragMag = 0.5 * rho * vr * vr / ballisticCoefficient;
    return [
        -aDragMag * (vrx / vr),
        -aDragMag * (vry / vr),
        -aDragMag * (vrz / vr)
    ];
}

/**
 * Adaptive integrator using Dormand-Prince RK45.
 * pos, vel: arrays [x,y,z] in meters and m/s
 * T: total integration time in seconds
 * bodies: array of {position:{x,y,z}, mass}
 * perturbationScale: factor for non-central bodies
 * Returns { pos: [x,y,z], vel: [vx,vy,vz] }
 */
export function adaptiveIntegrate(pos0, vel0, T, bodies, perturbationScale = 1.0, absTol = 1e-6, relTol = 1e-6) {
    let t = 0;
    // Use dynamic time step from Constants if set, fallback to 0.1s
    const maxStep = Constants.timeStep !== undefined ? Constants.timeStep : 0.1;
    let dt = Math.min(maxStep, T);
    let pos = pos0.slice();
    let vel = vel0.slice();
    while (t < T) {
        if (t + dt > T) dt = T - t;
        // Compute k1 (gravity + drag)
        const grav1 = computeAccel(pos, bodies, perturbationScale);
        const drag1 = computeDragAcceleration(pos, vel);
        const a1 = [grav1[0] + drag1[0], grav1[1] + drag1[1], grav1[2] + drag1[2]];
        // Position predictor
        const pos1 = [
            pos[0] + vel[0] * dt + 0.5 * a1[0] * dt * dt,
            pos[1] + vel[1] * dt + 0.5 * a1[1] * dt * dt,
            pos[2] + vel[2] * dt + 0.5 * a1[2] * dt * dt
        ];
        // Compute k2 gravity acceleration
        const grav2 = computeAccel(pos1, bodies, perturbationScale);
        // Velocity predictor without drag
        const vel1 = [
            vel[0] + 0.5 * (a1[0] + grav2[0]) * dt,
            vel[1] + 0.5 * (a1[1] + grav2[1]) * dt,
            vel[2] + 0.5 * (a1[2] + grav2[2]) * dt
        ];
        // Compute drag acceleration at new state
        const drag2 = computeDragAcceleration(pos1, vel1);
        // Total k2 accel (gravity + drag)
        const a2 = [
            grav2[0] + drag2[0],
            grav2[1] + drag2[1],
            grav2[2] + drag2[2]
        ];
        // Estimate error (simple difference) for adaptive stepping
        const errPos = [pos1[0] - (pos[0] + vel[0] * dt + 0.5 * a2[0] * dt * dt),
        pos1[1] - (pos[1] + vel[1] * dt + 0.5 * a2[1] * dt * dt),
        pos1[2] - (pos[2] + vel[2] * dt + 0.5 * a2[2] * dt * dt)];
        const errVel = [vel1[0] - (vel[0] + a2[0] * dt),
        vel1[1] - (vel[1] + a2[1] * dt),
        vel1[2] - (vel[2] + a2[2] * dt)];
        // Compute norm
        let errMax = 0;
        for (let j = 0; j < 3; j++) {
            const scp = absTol + relTol * Math.max(Math.abs(pos[j]), Math.abs(pos1[j]));
            errMax = Math.max(errMax, Math.abs(errPos[j]) / scp);
            const scv = absTol + relTol * Math.max(Math.abs(vel[j]), Math.abs(vel1[j]));
            errMax = Math.max(errMax, Math.abs(errVel[j]) / scv);
        }
        // Step control
        if (errMax <= 1) {
            t += dt;
            pos = pos1;
            vel = vel1;
            dt = dt * Math.min(5, 0.9 * Math.pow(1 / errMax, 0.2));
        } else {
            dt = dt * Math.max(0.2, 0.9 * Math.pow(1 / errMax, 0.2));
        }
    }
    return { pos, vel };
}

/**
 * Generate an orbit path via multiple adaptiveIntegrate steps.
 * Returns an array of THREE.Vector3 in Three.js units (m→km→scale).
 */
export function propagateOrbit(pos0, vel0, bodies, period, numPoints, perturbationScale = 1.0, onProgress) {
    const dt = period / numPoints;
    let pos = pos0.slice();
    let vel = vel0.slice();
    const points = [];
    for (let i = 0; i < numPoints; i++) {
        const { pos: newPos, vel: newVel } = adaptiveIntegrate(pos, vel, dt, bodies, perturbationScale);
        pos = newPos;
        vel = newVel;
        // Report incremental progress
        if (typeof onProgress === 'function') {
            onProgress((i + 1) / numPoints);
        }
        const r = Math.sqrt(pos[0]*pos[0] + pos[1]*pos[1] + pos[2]*pos[2]);
        if (r <= Constants.earthRadius + ATMOSPHERE_CUTOFF_ALTITUDE) {
            // continue inside atmosphere with fixed-step integrator
            const atmPts = propagateAtmosphere(pos, vel, bodies, 300, 1); // max 300s, 1s step
            points.push(...atmPts);
            break;
        }
        points.push(
            new THREE.Vector3(
                pos[0] * Constants.metersToKm * Constants.scale,
                pos[1] * Constants.metersToKm * Constants.scale,
                pos[2] * Constants.metersToKm * Constants.scale
            )
        );
    }
    return points;
}

// Simple fixed-step atmospheric propagation (Euler), returns Three.Vector3 points
export function propagateAtmosphere(pos0, vel0, bodies, maxSeconds = 300, dt = 1, ballisticCoefficient = DEFAULT_BALLISTIC_COEFFICIENT) {
    let pos = pos0.slice();
    let vel = vel0.slice();
    const pts = [];
    const steps = Math.ceil(maxSeconds / dt);
    for (let i = 0; i < steps; i++) {
        // gravity + drag
        const grav = computeAccel(pos, bodies, 1.0);
        const drag = computeDragAcceleration(pos, vel, ballisticCoefficient);
        // semi-implicit Euler
        vel[0] += (grav[0] + drag[0]) * dt;
        vel[1] += (grav[1] + drag[1]) * dt;
        vel[2] += (grav[2] + drag[2]) * dt;
        pos[0] += vel[0] * dt;
        pos[1] += vel[1] * dt;
        pos[2] += vel[2] * dt;
        const r = Math.sqrt(pos[0]*pos[0] + pos[1]*pos[1] + pos[2]*pos[2]);
        if (r <= Constants.earthRadius) break;
        pts.push(new THREE.Vector3(
            pos[0] * Constants.metersToKm * Constants.scale,
            pos[1] * Constants.metersToKm * Constants.scale,
            pos[2] * Constants.metersToKm * Constants.scale
        ));
    }
    return pts;
}

// Export drag computation for satellite debug display
export { computeDragAcceleration }; 