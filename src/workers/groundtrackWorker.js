// Worker for calculating satellite ground tracks

import { propagateOrbit } from '../utils/OrbitIntegrator.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { Constants } from '../utils/Constants.js';
import * as THREE from 'three'; // Import THREE for Vector3 and Quaternion

// Map of satellite id -> groundtrack points array ({lat, lon})
let groundtrackMap = {};

// Throttle variables for progress updates
const PROGRESS_THROTTLE_MS = 200; // Longer throttle for groundtrack as conversion is expensive
let lastProgressTime = 0;

self.onmessage = async function (e) {
    if (e.data.type === 'UPDATE_GROUNDTRACK') {
        const { id, startTime, position, velocity, bodies, period, numPoints, seq } = e.data;
        if (id === undefined || id === null) return;

        const initPos = [position.x, position.y, position.z]; // ECI meters
        const initVel = [velocity.x, velocity.y, velocity.z]; // ECI m/s
        const startTimestamp = startTime; // Assuming startTime is already a timestamp (ms)

        // Get propagated ECI positions (meters) and time offsets (seconds)
        const propagatedPoints = await propagateOrbit(
            initPos,
            initVel,
            bodies,
            period,
            numPoints,
            Constants.perturbationScale, // Use global perturbation scale
            (progress) => {
                const now = Date.now();
                if (now - lastProgressTime >= PROGRESS_THROTTLE_MS || progress === 1) {
                    lastProgressTime = now;
                    self.postMessage({ type: 'GROUNDTRACK_PROGRESS', id, progress, seq });
                }
            }
        );

        const groundPoints = [];
        const batchSize = Math.max(1, Math.floor(propagatedPoints.length / 20)); // Yield approx 20 times

        // Scratch vector for calculations
        const scratchVec = new THREE.Vector3();

        // Compute ground track points via ECI→ECEF→geodetic to match Earth-fixed frame
        for (let i = 0; i < propagatedPoints.length; i++) {
            const { position: eciPosArray, timeOffset } = propagatedPoints[i];
            scratchVec.set(eciPosArray[0], eciPosArray[1], eciPosArray[2]);
            const pointTime = startTimestamp + timeOffset * 1000;
            const gmst = PhysicsUtils.calculateGMST(pointTime);
            // ECI to Earth-fixed ECEF
            const ecefVec = PhysicsUtils.eciToEcef(scratchVec, gmst);
            // ECEF to geodetic lat/lon
            const { latitude: lat, longitude: lon } = PhysicsUtils.ecefToGeodetic(
                ecefVec.x, ecefVec.y, ecefVec.z
            );
            groundPoints.push({ lat, lon, time: pointTime });

            // Yield control periodically during conversion
            if ((i + 1) % batchSize === 0 && i < propagatedPoints.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        groundtrackMap[id] = groundPoints;

        // Post the final array of {lat, lon} points
        self.postMessage({
            type: 'GROUNDTRACK_UPDATE',
            id,
            points: groundPoints,
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