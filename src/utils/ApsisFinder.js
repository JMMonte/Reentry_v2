import { integrateRK45 } from '../physics/integrators/OrbitalIntegrators.js';
import { GravityCalculator } from '../physics/core/GravityCalculator.js';
import { AtmosphericModels } from '../physics/core/AtmosphericModels.js';
import * as THREE from 'three';

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
        // Create acceleration function for integration
        const accelerationFunc = (p, v) => {
            const grav = GravityCalculator.computeAcceleration(p, bodies);
            // Could add drag here if needed
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