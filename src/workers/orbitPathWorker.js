// Worker for managing orbit path for satellites

console.log('[orbitPathWorker] Worker loaded');

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
        const { id, position, velocity, bodies, period, numPoints, seq, perturbationScale } = e.data;
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
            }
        );
        // Convert ECI meter positions to scaled KM positions for Three.js
        // and store as a transferable Float32Array [x1,y1,z1, x2,y2,z2,...]
        const scaleFactor = Constants.metersToKm * Constants.scale;
        const coords = new Float32Array(rawPtsWithTime.length * 3);
        for (let i = 0; i < rawPtsWithTime.length; i++) {
            const posMeters = rawPtsWithTime[i].position; // [x, y, z] in meters
            coords[i * 3] = posMeters[0] * scaleFactor;
            coords[i * 3 + 1] = posMeters[1] * scaleFactor;
            coords[i * 3 + 2] = posMeters[2] * scaleFactor;
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
        console.log('[orbitPathWorker] Reset orbit path map');
    }
}; 