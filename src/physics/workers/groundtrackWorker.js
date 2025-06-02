// Worker for calculating satellite ground tracks
// Physics-only layer - generates ECI positions, UI handles coordinate conversion

import { UnifiedSatellitePropagator } from '../core/UnifiedSatellitePropagator.js';
import { solarSystemDataManager } from '../PlanetaryDataManager.js';

// map of satellite id -> full groundtrack arrays (cache)
let groundtrackMap = {};
// how many points per chunk sent to the UI
const CHUNK_SIZE = 50;

// Throttle variables for progress updates
const PROGRESS_THROTTLE_MS = 200; // Longer throttle for groundtrack as conversion is expensive
let lastProgressTime = 0;

self.onmessage = async function (e) {
    if (e.data.type === 'UPDATE_GROUNDTRACK') {
        const { id, startTime, position, velocity, bodies, period, numPoints, seq, centralBodyNaifId } = e.data;
        if (id === undefined || id === null) return;


        const initPos = [position.x, position.y, position.z]; // ECI kilometers
        const initVel = [velocity.x, velocity.y, velocity.z]; // ECI km/s
        const startTimestamp = startTime; // Assuming startTime is already a timestamp (ms)

        // Use UnifiedSatellitePropagator for consistent physics
        const satellite = {
            position: initPos,
            velocity: initVel,
            centralBodyNaifId: centralBodyNaifId || 399,
            mass: 1000, // Default values for groundtrack
            crossSectionalArea: 10,
            dragCoefficient: 2.2
        };

        const propagatedPoints = UnifiedSatellitePropagator.propagateOrbit({
            satellite,
            bodies,
            duration: period || 5400,
            timeStep: period / numPoints || 60,
            includeJ2: true,
            includeDrag: false, // Usually disabled for groundtrack
            includeThirdBody: false
        });

        // Convert to old format for compatibility
        const compatiblePoints = propagatedPoints.map((point, index) => ({
            position: point.position,
            timeOffset: point.time
        }));

        // Send progress updates
        for (let i = 0; i < compatiblePoints.length; i++) {
            const progress = i / compatiblePoints.length;
            const now = Date.now();
            if (now - lastProgressTime >= PROGRESS_THROTTLE_MS || progress === 1) {
                lastProgressTime = now;
                self.postMessage({ type: 'GROUNDTRACK_PROGRESS', id, progress, seq });
            }
        }

        const groundPoints = [];
        const batchSize = Math.max(1, Math.floor(propagatedPoints.length / 20)); // Yield approx 20 times

        // Collect raw ECI positions + times (no coordinate conversion in worker)
        for (let i = 0; i < compatiblePoints.length; i++) {
            const { position: eciPosArray, timeOffset } = compatiblePoints[i];
            // Keep raw ECI coordinates in kilometers - UI will handle coordinate conversion
            const pos = { x: eciPosArray[0], y: eciPosArray[1], z: eciPosArray[2] };
            const pointTime = startTimestamp + timeOffset * 1000;
            groundPoints.push({ time: pointTime, position: pos });
            
            // Stream chunks to UI for progressive loading
            if ((i + 1) % CHUNK_SIZE === 0) {
                self.postMessage({ type: 'GROUNDTRACK_CHUNK', id, points: groundPoints.slice(-CHUNK_SIZE), seq });
            }

            // Yield control periodically to prevent blocking
            if ((i + 1) % batchSize === 0 && i < compatiblePoints.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        groundtrackMap[id] = groundPoints;
        // flush any remaining points
        const rem = groundPoints.length % CHUNK_SIZE;
        if (rem) {
            self.postMessage({ type: 'GROUNDTRACK_CHUNK', id, points: groundPoints.slice(-rem), seq });
        }

        // Post the final array of ECI points (UI handles coordinate conversion)
        self.postMessage({
            type: 'GROUNDTRACK_UPDATE',
            id,
            points: groundPoints, // Raw ECI positions + time
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