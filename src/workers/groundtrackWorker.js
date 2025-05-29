// Worker for calculating satellite ground tracks

import { propagateOrbit } from '../physics/integrators/OrbitalIntegrators.js';
import { Constants } from '../utils/Constants.js';
import { planetaryDataManager } from '../physics/bodies/PlanetaryDataManager.js';

// map of satellite id -> full groundtrack arrays (cache)
let groundtrackMap = {};
// how many points per chunk sent to the UI
const CHUNK_SIZE = 50;

// Throttle variables for progress updates
const PROGRESS_THROTTLE_MS = 200; // Longer throttle for groundtrack as conversion is expensive
let lastProgressTime = 0;

self.onmessage = async function (e) {
    if (e.data.type === 'UPDATE_GROUNDTRACK') {
        const { id, startTime, position, velocity, bodies, period, numPoints, seq } = e.data;
        if (id === undefined || id === null) return;

        const initPos = [position.x, position.y, position.z]; // ECI kilometers
        const initVel = [velocity.x, velocity.y, velocity.z]; // ECI km/s
        const startTimestamp = startTime; // Assuming startTime is already a timestamp (ms)

        // Get propagated ECI positions (kilometers) and time offsets (seconds)
        const propagatedPoints = await propagateOrbit(
            initPos,
            initVel,
            bodies,
            period,
            numPoints,
            {
                perturbationScale: Constants.perturbationScale || 1,
                onProgress: (progress) => {
                    const now = Date.now();
                    if (now - lastProgressTime >= PROGRESS_THROTTLE_MS || progress === 1) {
                        lastProgressTime = now;
                        self.postMessage({ type: 'GROUNDTRACK_PROGRESS', id, progress, seq });
                    }
                },
                allowFullEllipse: true,
                bodyMap: planetaryDataManager.naifToBody
            }
        );

        const groundPoints = [];
        const batchSize = Math.max(1, Math.floor(propagatedPoints.length / 20)); // Yield approx 20 times

        // Collect raw ECI positions + times and stream in chunks
        for (let i = 0; i < propagatedPoints.length; i++) {
            const { position: eciPosArray, timeOffset } = propagatedPoints[i];
            // raw ECI kilometers
            const pos = { x: eciPosArray[0], y: eciPosArray[1], z: eciPosArray[2] };
            const pointTime = startTimestamp + timeOffset * 1000;
            groundPoints.push({ time: pointTime, position: pos });
            // stream a chunk every CHUNK_SIZE
            if ((i + 1) % CHUNK_SIZE === 0) {
                self.postMessage({ type: 'GROUNDTRACK_CHUNK', id, points: groundPoints.slice(-CHUNK_SIZE), seq });
            }

            // Yield control periodically during conversion
            if ((i + 1) % batchSize === 0 && i < propagatedPoints.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        groundtrackMap[id] = groundPoints;
        // flush any remaining points
        const rem = groundPoints.length % CHUNK_SIZE;
        if (rem) {
            self.postMessage({ type: 'GROUNDTRACK_CHUNK', id, points: groundPoints.slice(-rem), seq });
        }

        // Post the final array of lat/lon points
        self.postMessage({
            type: 'GROUNDTRACK_UPDATE',
            id,
            points: groundPoints, // now geodetic lat/lon + time
            seq
        });

    } else if (e.data.type === 'RESET') {
        if (e.data.id) {
            delete groundtrackMap[e.data.id];
        } else {
            groundtrackMap = {};
        }
    }
}; 