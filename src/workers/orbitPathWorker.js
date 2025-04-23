// Worker for managing orbit path for satellites

console.log('[orbitPathWorker] Worker loaded');

// Map of satellite id -> orbit path points array
let orbitPathMap = {};

// At top, import shared integrator and THREE
// import * as THREE from 'three';
import { propagateOrbit } from '../utils/OrbitIntegrator.js';

// Adaptive arc-length resampling with subdivision for high-curvature regions
function resampleArcLength(rawPts, targetCount) {
    if (!rawPts || rawPts.length < 2 || targetCount < 2) return rawPts;
    const N = rawPts.length;
    // Compute segment lengths and total arc length
    let total = 0;
    const segLengths = new Array(N - 1);
    for (let i = 0; i < N - 1; i++) {
        const d = rawPts[i].distanceTo(rawPts[i + 1]);
        segLengths[i] = d;
        total += d;
    }
    // Average segment length for subdivisions
    const averageSeg = total / (targetCount - 1);
    // Subdivide segments longer than averageSeg
    const subdiv = [];
    subdiv.push(rawPts[0].clone());
    for (let i = 0; i < N - 1; i++) {
        const p0 = rawPts[i];
        const p1 = rawPts[i + 1];
        const n = averageSeg > 0 ? Math.ceil(segLengths[i] / averageSeg) : 1;
        for (let j = 1; j <= n; j++) {
            subdiv.push(p0.clone().lerp(p1, j / n));
        }
    }
    // Build cumulative distances on subdivided points
    const M = subdiv.length;
    const cum = new Array(M);
    cum[0] = 0;
    for (let i = 1; i < M; i++) {
        cum[i] = cum[i - 1] + subdiv[i].distanceTo(subdiv[i - 1]);
    }
    // Sample targetCount points evenly along the total arc length
    const result = [];
    const totalLen = cum[M - 1];
    for (let k = 0; k < targetCount; k++) {
        const s = totalLen * (k / (targetCount - 1));
        let idx = 1;
        while (idx < M && cum[idx] < s) idx++;
        if (idx >= M) {
            result.push(subdiv[M - 1].clone());
        } else if (idx === 0) {
            result.push(subdiv[0].clone());
        } else {
            const s0 = cum[idx - 1];
            const segLen = cum[idx] - s0;
            const t = segLen > 0 ? (s - s0) / segLen : 0;
            result.push(subdiv[idx - 1].clone().lerp(subdiv[idx], t));
        }
    }
    return result;
}

self.onmessage = async function (e) {
    if (e.data.type === 'UPDATE_ORBIT') {
        const { id, position, velocity, bodies, period, numPoints, seq, perturbationScale } = e.data;
        if (id === undefined || id === null) return;
        // Multi-body propagation using shared integrator
        const initPos = [position.x, position.y, position.z];
        const initVel = [velocity.x, velocity.y, velocity.z];
        // bodies: array of {position:{x,y,z}, mass}
        const rawPts = propagateOrbit(
            initPos,
            initVel,
            bodies,
            period,
            numPoints,
            perturbationScale,
            (progress) => {
                // Send intermediate progress back to main thread
                self.postMessage({ type: 'ORBIT_PATH_PROGRESS', id, progress, seq });
            }
        );
        const spacedPts = resampleArcLength(rawPts, numPoints);
        orbitPathMap[id] = spacedPts.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }));
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