// Worker for managing orbit path for satellites

// Map of satellite id -> orbit path points array
let orbitPathMap = {};

// At top, import shared integrator and THREE
// import * as THREE from 'three';
import { propagateOrbit } from '../utils/OrbitIntegrator.js';
import { Constants } from '../utils/Constants.js';

// Add throttle variables to reduce progress message frequency
const PROGRESS_THROTTLE_MS = 100; // minimum ms between progress update messages
let lastProgressTime = 0;

self.onmessage = async function (e) {
    if (e.data.type === 'UPDATE_ORBIT') {
        const { id, position, velocity, bodies, period, numPoints, seq, perturbationScale, allowFullEllipse } = e.data;
        // Override max integrator step in Constants to use the full segment dt
        Constants.timeStep = period / numPoints;
        // Adjust integrator sensitivity: outside Earth's SOI use looser tolerances
        const r2 = position.x * position.x + position.y * position.y + position.z * position.z;
        const r = Math.sqrt(r2);
        if (r > Constants.earthSOI) {
            Constants.sensitivityScale = 0.1;
        } else {
            Constants.sensitivityScale = 1.0;
        }
        if (id === undefined || id === null) return;
        // Multi-body propagation using shared integrator
        const initPos = [position.x, position.y, position.z];
        const initVel = [velocity.x, velocity.y, velocity.z];
        // bodies: array of {position:{x,y,z}, mass}
        const rawPtsWithTime = await propagateOrbit(
            initPos,
            initVel,
            bodies,
            period,
            numPoints,
            perturbationScale,
            (progress) => {
                const now = Date.now();
                if (now - lastProgressTime >= PROGRESS_THROTTLE_MS || progress === 1) {
                    lastProgressTime = now;
                    self.postMessage({ type: 'ORBIT_PATH_PROGRESS', id, progress, seq });
                }
            },
            allowFullEllipse // now dynamic, not hardcoded
        );
        // Flatten to Float32Array for transfer
        const coords = new Float32Array(rawPtsWithTime.length * 3);
        for (let i = 0; i < rawPtsWithTime.length; i++) {
            const pos = rawPtsWithTime[i].position; // [x, y, z] in kilometers
            coords[i * 3] = pos[0];
            coords[i * 3 + 1] = pos[1];
            coords[i * 3 + 2] = pos[2];
        }
        orbitPathMap[id] = coords;
        // Post buffer as transferable to minimize copying overhead
        self.postMessage({
            type: 'ORBIT_PATH_UPDATE',
            id,
            orbitPoints: coords.buffer,
            seq
        }, [coords.buffer]);
    } else if (e.data.type === 'RESET') {
        if (e.data.id) {
            delete orbitPathMap[e.data.id];
        } else {
            orbitPathMap = {};
        }
    }
}; 