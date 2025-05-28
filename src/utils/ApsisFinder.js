import { adaptiveIntegrate } from './OrbitIntegrator.js';

/**
 * Find the next periapsis or apoapsis after the given state.
 * @param {Array} pos0 - Initial position [x, y, z] in kilometers
 * @param {Array} vel0 - Initial velocity [vx, vy, vz] in km/s
 * @param {Array} bodies - Array of gravity bodies
 * @param {number} perturbationScale
 * @param {'periapsis'|'apoapsis'} type
 * @param {number} maxLookaheadSec
 * @returns {number} time offset in seconds to next apsis, or null if not found
 */
export function findNextApsis(pos0, vel0, bodies, perturbationScale, type = 'periapsis', maxLookaheadSec = 86400) {
    let t = 0;
    let dt = 10; // seconds, can be made adaptive
    let pos = pos0.slice();
    let vel = vel0.slice();
    let lastR = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);
    let wasDecreasing = null;
    let found = false;
    let apsisTime = null;

    while (t < maxLookaheadSec) {
        const { pos: newPos, vel: newVel } = adaptiveIntegrate(pos, vel, dt, bodies, perturbationScale);
        pos = newPos;
        vel = newVel;
        t += dt;
        const r = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);
        if (wasDecreasing !== null) {
            if (
                (type === 'periapsis' && wasDecreasing && r > lastR) ||
                (type === 'apoapsis' && !wasDecreasing && r < lastR)
            ) {
                // Linear interpolation for better accuracy
                const frac = Math.abs((lastR - r) / (lastR - r + (r - lastR)));
                apsisTime = t - dt + frac * dt;
                found = true;
                break;
            }
        }
        wasDecreasing = r < lastR;
        lastR = r;
    }
    return found ? apsisTime : null;
} 