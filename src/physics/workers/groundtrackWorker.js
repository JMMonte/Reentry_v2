// Worker for calculating satellite ground tracks
// Performs full groundtrack calculation including coordinate transformations

import { UnifiedSatellitePropagator } from '../core/UnifiedSatellitePropagator.js';
import { GroundTrackService } from '../../services/GroundTrackService.js';

// Test if we can even run basic code
try {
    self.postMessage({ type: 'WORKER_ALIVE', message: 'Worker is running' });
} catch (error) {
    console.error('[GroundtrackWorker] Error in basic test:', error);
}

// map of satellite id -> { points: array, timestamp: number } (cache with TTL)
let groundtrackMap = {};
// how many points per chunk sent to the UI
const CHUNK_SIZE = 50;
// Cache for planet data to avoid repeated lookups
const planetDataCache = new Map();
// TTL for groundtrack cache entries (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;
// Cleanup interval (1 minute)
const CLEANUP_INTERVAL_MS = 60 * 1000;
// Store active timeout IDs for cleanup
const activeTimeouts = new Set();

// Cache cleanup helper function
function cleanupStaleEntries() {
    const now = Date.now();
    const idsToDelete = [];

    for (const [id, entry] of Object.entries(groundtrackMap)) {
        if (entry.timestamp && (now - entry.timestamp) > CACHE_TTL_MS) {
            idsToDelete.push(id);
        }
    }

    idsToDelete.forEach(id => {
        delete groundtrackMap[id];
    });

    return idsToDelete.length;
}

// Set up periodic cache cleanup
let cleanupInterval = setInterval(cleanupStaleEntries, CLEANUP_INTERVAL_MS);

// Cleanup function for worker termination
function cleanup() {
    // Clear interval
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }

    // Clear all active timeouts
    activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    activeTimeouts.clear();

    // Clear caches
    groundtrackMap = {};
    planetDataCache.clear();
}

// Throttle variables for progress updates
const PROGRESS_THROTTLE_MS = 200; // Longer throttle for groundtrack as conversion is expensive
let lastProgressTime = 0;

// Create GroundTrackService instance for worker
const groundTrackService = new GroundTrackService();

self.onmessage = async function (e) {
    try {

        // Handle termination signal
        if (e.data && e.data.type === 'terminate') {
            cleanup();
            self.close();
            return;
        }

        // Handle cleanup request
        if (e.data && e.data.type === 'cleanup') {
            cleanup();
            return;
        }

        if (e.data.type === 'UPDATE_GROUNDTRACK') {
            const { id, startTime, position, velocity, bodies, period, numPoints, seq, centralBodyNaifId, canvasWidth, canvasHeight } = e.data;
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

            let propagatedPoints = [];
            try {
                propagatedPoints = UnifiedSatellitePropagator.propagateOrbit({
                    satellite,
                    bodies,
                    duration: period || 5400,
                    timeStep: period / numPoints || 60,
                    includeJ2: true,
                    includeDrag: false, // Usually disabled for groundtrack
                    includeThirdBody: false
                });
            } catch (error) {
                console.error('[GroundtrackWorker] Propagation error:', error);
                self.postMessage({ type: 'GROUNDTRACK_ERROR', id, error: error.message, seq });
                return;
            }

            // Convert to old format for compatibility
            const compatiblePoints = propagatedPoints.map((point) => ({
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

            // Get planet data for coordinate transformations
            let planetData = planetDataCache.get(centralBodyNaifId);
            if (!planetData) {
                // For workers, we need to use the appropriate planet data from our local system
                const bodyInfo = bodies.find(b => b.naifId === centralBodyNaifId);
                if (bodyInfo) {
                    planetData = bodyInfo;
                    planetDataCache.set(centralBodyNaifId, planetData);
                }
            }

            const processedPoints = [];
            const batchSize = Math.max(1, Math.floor(propagatedPoints.length / 20)); // Yield approx 20 times
            let prevLon = undefined;

            // Process points with coordinate transformation in worker
            for (let i = 0; i < compatiblePoints.length; i++) {
                const { position: eciPosArray, timeOffset } = compatiblePoints[i];
                const pointTime = startTimestamp + timeOffset * 1000;

                let lat = 0, lon = 0, alt = 0;
                let isDatelineCrossing = false;

                if (planetData) {
                    try {
                        // Use existing GroundTrackService for consistent coordinate transformations
                        const surface = await groundTrackService.transformECIToSurface(
                            eciPosArray,
                            centralBodyNaifId || 399,
                            pointTime,
                            planetData
                        );

                        lat = surface.lat;
                        lon = surface.lon;
                        alt = surface.alt;

                        // Check for dateline crossing using existing service method
                        isDatelineCrossing = groundTrackService.isDatelineCrossing(prevLon, lon);
                        prevLon = lon;
                    } catch (error) {
                        console.warn('Coordinate transformation failed in worker:', error);
                        console.warn('eciPosArray:', eciPosArray);
                        console.warn('planetData:', planetData);
                    }
                } else {
                    console.warn('[GroundtrackWorker] No planet data found for naifId:', centralBodyNaifId);
                }

                // Calculate canvas coordinates using existing service if dimensions provided
                let canvasX = 0, canvasY = 0;
                if (canvasWidth && canvasHeight && lat !== 0 && lon !== 0) {
                    const canvas = groundTrackService.projectToCanvas(lat, lon, canvasWidth, canvasHeight);
                    canvasX = canvas.x;
                    canvasY = canvas.y;
                }

                const processedPoint = {
                    time: pointTime,
                    lat,
                    lon,
                    alt,
                    isDatelineCrossing,
                    // Pre-computed canvas coordinates using existing service
                    x: canvasX,
                    y: canvasY,
                    // Include raw ECI for fallback/debugging
                    eci: { x: eciPosArray[0], y: eciPosArray[1], z: eciPosArray[2] }
                };

                processedPoints.push(processedPoint);

                // Stream chunks to UI for progressive loading
                if ((i + 1) % CHUNK_SIZE === 0) {
                    self.postMessage({
                        type: 'GROUNDTRACK_CHUNK',
                        id,
                        points: processedPoints.slice(-CHUNK_SIZE),
                        seq,
                        isProcessed: true // Flag to indicate coordinates are already transformed
                    });
                }

                // Yield control periodically to prevent blocking
                if ((i + 1) % batchSize === 0 && i < compatiblePoints.length - 1) {
                    await new Promise(resolve => {
                        const timeoutId = setTimeout(() => {
                            activeTimeouts.delete(timeoutId);
                            resolve();
                        }, 0);
                        activeTimeouts.add(timeoutId);
                    });
                }
            }

            groundtrackMap[id] = {
                points: processedPoints,
                timestamp: Date.now()
            };
            // flush any remaining points
            const rem = processedPoints.length % CHUNK_SIZE;
            if (rem) {
                self.postMessage({
                    type: 'GROUNDTRACK_CHUNK',
                    id,
                    points: processedPoints.slice(-rem),
                    seq,
                    isProcessed: true
                });
            }

            // Post the final array with transformed coordinates
            self.postMessage({
                type: 'GROUNDTRACK_UPDATE',
                id,
                points: processedPoints,
                seq,
                isProcessed: true
            });

        } else if (e.data.type === 'RESET') {
            if (e.data.id) {
                delete groundtrackMap[e.data.id];
            } else {
                groundtrackMap = {};
            }
        } else if (e.data.type === 'CLEANUP') {
            // Force cleanup of stale entries using shared function
            const cleanedCount = cleanupStaleEntries();

            self.postMessage({
                type: 'CLEANUP_COMPLETE',
                cleaned: cleanedCount
            });
        } else if (e.data.type === 'TERMINATE') {
            // Clean shutdown
            clearInterval(cleanupInterval);
            groundtrackMap = {};
            planetDataCache.clear();
        }
    } catch (error) {
        console.error('[GroundtrackWorker] Error in message handler:', error);
        console.error('[GroundtrackWorker] Stack trace:', error.stack);
        // Try to send error message back if possible
        if (e.data?.type === 'UPDATE_GROUNDTRACK' && e.data?.id && e.data?.seq) {
            self.postMessage({
                type: 'GROUNDTRACK_ERROR',
                id: e.data.id,
                error: error.message,
                seq: e.data.seq
            });
        }
    }
};

console.log('[GroundtrackWorker] Worker script fully loaded and ready'); 