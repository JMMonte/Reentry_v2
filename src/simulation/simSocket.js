// Kick off live sim stream from Python physics backend

import * as THREE from 'three';
import { createSceneObjects } from '../setup/setupScene.js';

export const PHYSICS_SERVER_URL = import.meta.env.VITE_PHYSICS_SERVER_URL || 'http://localhost:8000';
export const PHYSICS_WS_URL = PHYSICS_SERVER_URL.replace(/^http/, 'ws') + '/ws';

/**
 * Create a new sim session, seeding it with the current simulation time.
 * @param {string} startTimeISO - ISO string of the simulation start time
 */
async function createSimSession(startTimeISO) {
    const resp = await fetch(`${PHYSICS_SERVER_URL}/session?utc=${encodeURIComponent(startTimeISO)}`, {
        method: 'POST'
    });
    if (!resp.ok) {
        throw new Error(`Failed to create sim session: ${resp.statusText}`);
    }
    const { session_id } = await resp.json();
    return session_id;
}

/**
 * Convert ECLIPJ2000 ET (seconds since J2000 epoch) to JS Date.
 * J2000 epoch: 2000-01-01T12:00:00Z
 * @param {number} et - seconds past J2000
 * @returns {Date}
 */
function convertETtoDate(et) {
    const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0, 0); // months are 0-based
    return new Date(j2000 + et * 1000);
}

// Helper to check if all planets have position and velocity
function allPlanetsHavePositionAndVelocity(app) {
    if (!app.celestialBodies || !Array.isArray(app.celestialBodies)) return false;
    return app.celestialBodies.every(
        p => (p.naif_id === 0) || (p && p.position && p.velocity)
    );
}

/**
 * Start live sim stream: msgType 10 = planetary updates, msgType 2 = sim time
 * @param {import('../App3D').default} app
 * @param {string} [frame='ECLIPJ2000']
 * @param {object} [options] - { onSimTimeUpdate, onTimeWarpUpdate }
 */
export async function initSimStream(app, frame = 'ECLIPJ2000', options = {}) {
    // Seed backend with the current simulated time
    const startTimeISO = app.timeUtils.getSimulatedTime().toISOString();
    const sessionId = await createSimSession(startTimeISO);
    app.sessionId = sessionId; // Store the session ID on the app instance
    const frameToUse = frame || 'ECLIPJ2000'; // Ensure frame has a default
    const rateToUse = 60; // Default rate, can be made configurable later
    const url = `${PHYSICS_WS_URL}?session_id=${sessionId}&frame=${frameToUse}&rate=${rateToUse}`;
    console.log('[SimSocket] Connecting to WebSocket URL:', url); // Log the URL
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
        console.log('[SimSocket] WebSocket connection opened.');
        app._simStreamActive = true;
        window.dispatchEvent(new CustomEvent('sim-connection-restored'));
        // Optional: Send a simple test ping message
        // const testMsg = new Uint8Array([99]); // Example: byte value 99
        // ws.send(testMsg.buffer);
        // console.log('[SimSocket] Sent test ping message.');
    };
    ws.onerror = err => {
        console.error('[SimStream] WebSocket error:', err);
    };
    ws.onclose = evt => {
        console.warn('[SimStream] WebSocket connection closed:', {
            code: evt.code,
            reason: evt.reason,
            wasClean: evt.wasClean,
        });
        app._simStreamActive = false;
        window.dispatchEvent(new CustomEvent('sim-connection-lost'));
    };

    ws.onmessage = async evt => {
        const data = evt.data;
        if (data instanceof ArrayBuffer) {
            const dv = new DataView(data);
            const msgType = dv.getUint8(0);
            if (msgType === 2) {
                // Simulation epoch time (ECLIPJ2000 ET)
                const et = dv.getFloat64(1, true);
                const simDate = convertETtoDate(et);
                // Use last known timeWarp or default to 1
                const warp = app.timeUtils.getTimeWarp ? app.timeUtils.getTimeWarp() : 1;
                app.timeUtils.setSimTimeFromServer(simDate, warp);
                if (options.onSimTimeUpdate) options.onSimTimeUpdate(simDate, et);
            }
            const bytes = new Uint8Array(data);
            if (bytes.length === 85 && dv.getUint8(0) === 10) {
                // Initialize scene objects if this is the first relevant message
                if (!app.sceneObjectsInitialized) {
                    console.log('[SimSocket] First planetary update received. Initializing scene objects...');
                    await createSceneObjects(app);
                    app.sceneObjectsInitialized = true;
                    console.log('[SimSocket] Scene objects initialized.');

                    // Now that objects are initialized, set the initial camera target
                    if (app.cameraControls && typeof app.cameraControls.follow === 'function') {
                        const initialTargetName = app.config?.initialCameraTarget || 'Earth'; // Default to Earth or use app config
                        console.log(`[SimSocket] Setting initial camera target to: ${initialTargetName}`);
                        app.cameraControls.follow(initialTargetName, app, true); // suppressLog: true for initial setup
                    } else {
                        console.warn('[SimSocket] app.cameraControls not found or follow method missing after scene init.');
                    }

                    // Dispatch an event to notify the UI that the scene is ready
                    window.dispatchEvent(new CustomEvent('sceneReadyFromBackend'));
                    console.log('[SimSocket] Dispatched sceneReadyFromBackend event.');
                }

                let offset = 1; // Start offset after msgType
                const naif_id = dv.getUint32(offset, true); offset += 4;

                const posX = dv.getFloat64(offset, true); offset += 8;
                const posY = dv.getFloat64(offset, true); offset += 8;
                const posZ = dv.getFloat64(offset, true); offset += 8;

                const vel = []; // velocity components
                for (let i = 0; i < 3; i++) { vel.push(dv.getFloat64(offset, true)); offset += 8; }

                // Quaternion components from backend: w, x, y, z
                const quatW = dv.getFloat64(offset, true); offset += 8;
                const quatX = dv.getFloat64(offset, true); offset += 8;
                const quatY = dv.getFloat64(offset, true); offset += 8;
                const quatZ = dv.getFloat64(offset, true); offset += 8;

                if (!app.bodiesByNaifId) app.bodiesByNaifId = {};
                const body = app.bodiesByNaifId[naif_id];
                if (!body) {
                    console.warn(`[SimSocket] No body found for NAIF ${naif_id}`);
                    return;
                }

                const serverPosition = new THREE.Vector3(posX, posY, posZ);
                // Three.js Quaternion constructor is (x, y, z, w)
                const serverOrientation = new THREE.Quaternion(quatX, quatY, quatZ, quatW);

                // Handle initial state snap for Planets, otherwise interpolate or set directly
                if (body instanceof app.Planet && !body.hasBeenInitializedByServer) {
                    body.applyInitialServerState(serverPosition, serverOrientation);
                } else {
                    // Use new target methods if available (for Planets primarily after init)
                    if (typeof body.setTargetPosition === 'function') {
                        body.setTargetPosition(serverPosition);
                    } else {
                        // Fallback for non-Planet objects
                        let directPosTarget = (body instanceof app.Planet && body.getOrbitGroup()) ? body.getOrbitGroup() : body;
                        if (directPosTarget && directPosTarget.position) {
                            directPosTarget.position.copy(serverPosition);
                        } else if (body.constructor.name === 'Sun' && body.sun && body.sun.position) {
                            body.sun.position.copy(serverPosition);
                        }
                    }

                    if (typeof body.setTargetOrientation === 'function') {
                        body.setTargetOrientation(serverOrientation);
                    } else {
                        // Fallback for non-Planet objects
                        let directOrientTarget;
                        if (body instanceof app.Planet && body.orientationGroup) {
                            directOrientTarget = body.orientationGroup;
                        } else if (body.constructor.name === 'Sun' && body.sun && body.sun.quaternion) {
                            directOrientTarget = body.sun; // The mesh object
                        } else if (body instanceof THREE.Group) {
                            directOrientTarget = body; // The group itself
                        }

                        if (directOrientTarget && directOrientTarget.quaternion) {
                            directOrientTarget.quaternion.copy(serverOrientation);
                        }
                    }
                }

                // Update velocity (no interpolation for now)
                if (body) {
                    if (!body.velocity) body.velocity = new THREE.Vector3();
                    body.velocity.set(vel[0], vel[1], vel[2]);
                }

                // If this is a barycenter, update its PlanetVectors instance as well
                if (body instanceof THREE.Group && body.type === 'barycenter' && app.planetVectors) {
                    // Find the PlanetVectors instance for this barycenter
                    const pv = app.planetVectors.find(v => v.body && v.body.naif_id === naif_id);
                    if (pv && pv.body) {
                        pv.body.velocity = body.velocity;
                        if (typeof pv.updateVectors === 'function') pv.updateVectors();
                    }
                }

                // --- DEBUG: Log local and world positions after setting ---
                let debugPosObject = null;
                if (body instanceof app.Planet && body.getOrbitGroup()) {
                    debugPosObject = body.getOrbitGroup();
                } else if (body.constructor.name === 'Sun' && body.sun) {
                    debugPosObject = body.sun;
                } else if (body instanceof THREE.Group) {
                    debugPosObject = body;
                }

                if (debugPosObject && debugPosObject.position && typeof debugPosObject.getWorldPosition === 'function') {
                    // const local = debugPosObject.position.toArray();
                    // const world = debugPosObject.getWorldPosition(new THREE.Vector3()).toArray();
                    // console.log(`[SimSocket] NAIF ${naif_id} effective local:`, local, 'world:', world);
                }
                _planetaryUpdateNaifIds.add(naif_id);
                if (Object.keys(_planetaryUpdateSamples).length < 5) {
                    _planetaryUpdateSamples[naif_id] = [posX, posY, posZ];
                }
                const now = Date.now();
                if (now - _lastPlanetaryLogTime > 5000) {
                    const naifArr = Array.from(_planetaryUpdateNaifIds);
                    const sampleIds = naifArr.slice(0, 5);
                    // let sampleStr = ''; // sampleStr is assigned but its value is never read
                    if (sampleIds.length > 0) {
                        /* sampleStr = sampleIds.map(id => {
                            const pos = _planetaryUpdateSamples[id];
                            return `    NAIF ${id} pos=[${pos.map(x => x.toExponential(2)).join(', ')}]`;
                        }).join('\n');
                        sampleStr = '\n' + sampleStr; */
                    }
                    // console.log(`[SimStream] ${_planetaryUpdateCount} planetary updates in last 5 seconds (${naifArr.length} unique bodies)${sampleStr}`);
                    _lastPlanetaryLogTime = now;
                    // _planetaryUpdateCount = 0;
                    _planetaryUpdateNaifIds.clear();
                    _planetaryUpdateSamples = {};
                }
            }
            // After all planet positions/velocities are updated, update orbit lines
            if (app.sceneObjectsInitialized && app.orbitManager && typeof app.orbitManager.renderPlanetaryOrbits === 'function') {
                // Debug: print full list once
                if (!app._printedCelestialBodies) {
                    app._printedCelestialBodies = true;
                }
                // Debug: print which planets are missing position/velocity
                if (app.celestialBodies && Array.isArray(app.celestialBodies)) {
                    // Removed unused forEach loop
                }
                if (app._simStreamActive) {
                    const allReady = allPlanetsHavePositionAndVelocity(app);
                    if (!app._orbitsReady) {
                        if (allReady) {
                            app._orbitsReady = true;
                            app.orbitManager.renderPlanetaryOrbits();
                        }
                    } else {
                        app.orbitManager.renderPlanetaryOrbits();
                    }
                }
            }
        } else {
            // (log removed)
        }
        // Existing handler for text frames (kept for future compatibility)
        if (app.sceneObjectsInitialized && typeof data === 'string') {
            try {
                const raw = data.trim();
                const fixed = raw.replace(/([{,])\s*([A-Za-z0-9_]+)\s*:/g, '$1"$2":');
                const parsed = JSON.parse(fixed);
                const { bodies } = parsed;
                if (!bodies || !Array.isArray(bodies)) {
                    return;
                }
                bodies.forEach(b => {
                    const planet = app.Planet.instances.find(p => p.nameLower === b.name.toLowerCase());
                    if (planet) {
                        planet.getOrbitGroup().position.set(b.position.x, b.position.y, b.position.z);
                    }
                });
            } catch (e) {
                console.error('[SimStream] parse error on planetary update', e);
            }
        }
    };

    app.simSocket = ws;
}

let _lastPlanetaryLogTime = 0;
// let _planetaryUpdateCount = 0;
let _planetaryUpdateNaifIds = new Set();
let _planetaryUpdateSamples = {}; 