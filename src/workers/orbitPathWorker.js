// Worker for managing orbit path for satellites

console.log('[orbitPathWorker] Worker loaded');

// Map of satellite id -> orbit path points array
let orbitPathMap = {};

// At top, import shared integrator and THREE
// import * as THREE from 'three';
import { propagateOrbit } from '../utils/OrbitIntegrator.js';

self.onmessage = async function (e) {
    if (e.data.type === 'UPDATE_ORBIT') {
        const { id, position, velocity, bodies, period, numPoints, seq, perturbationScale } = e.data;
        if (id === undefined || id === null) return;
        // Multi-body propagation using shared integrator
        const initPos = [position.x, position.y, position.z];
        const initVel = [velocity.x, velocity.y, velocity.z];
        // bodies: array of {position:{x,y,z}, mass}
        const pts = propagateOrbit(initPos, initVel, bodies, period, numPoints, perturbationScale);
        orbitPathMap[id] = pts.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }));
        self.postMessage({
            type: 'ORBIT_PATH_UPDATE',
            id,
            orbitPoints: orbitPathMap[id],
            seq
        });
    } else if (e.data.type === 'RESET') {
        if (e.data.id) {
            delete orbitPathMap[e.data.id];
        } else {
            orbitPathMap = {};
        }
        console.log('[orbitPathWorker] Reset orbit path map');
    }
}; 