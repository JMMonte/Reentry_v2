// Kick off live sim stream from Python physics backend

import * as THREE from 'three';

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
    const url = `${PHYSICS_WS_URL}?session_id=${sessionId}&frame=${frame}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
        app._simStreamActive = true;
    };
    ws.onerror = err => console.error('[SimStream] error', err);

    ws.onmessage = evt => {
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
            if (msgType === 3) {
                const warp = dv.getFloat32(1, true);
                // Use last known simDate or current
                const simDate = app.timeUtils.getSimulatedTime ? app.timeUtils.getSimulatedTime() : new Date();
                app.timeUtils.setSimTimeFromServer(simDate, warp);
                if (options.onTimeWarpUpdate) options.onTimeWarpUpdate(warp);
            }
            const bytes = new Uint8Array(data);
            if (bytes.length === 85) {
                let offset = 0;
                const msgType = dv.getUint8(offset); offset += 1;
                if (msgType === 10) {
                    // --- DEBUG: Log raw backend data ---
                    // console.log('[SimSocket] Raw planetary update (bytes):', new Uint8Array(data));
                    try {
                        // const floats = new Float64Array(data);
                        // console.log('[SimSocket] Raw planetary update (Float64Array):', floats);
                    } catch {/* ignore errors in debug float log */}
                    let offset = 1;
                    const naif_id = dv.getUint32(offset, true); offset += 4;
                    const pos = [];
                    for (let i = 0; i < 3; i++) { pos.push(dv.getFloat64(offset, true)); offset += 8; }
                    const vel = [];
                    for (let i = 0; i < 3; i++) { vel.push(dv.getFloat64(offset, true)); offset += 8; }
                    const quat = [];
                    for (let i = 0; i < 4; i++) { quat.push(dv.getFloat64(offset, true)); offset += 8; }

                    // --- DEBUG: Log parsed values ---
                    // console.log(`[SimSocket] NAIF ${naif_id} parsed pos:`, pos, 'vel:', vel, 'quat:', quat);

                    if (!app.bodiesByNaifId) app.bodiesByNaifId = {};
                    const body = app.bodiesByNaifId[naif_id];
                    if (!body) {
                        console.warn(`[SimSocket] No body found for NAIF ${naif_id}`);
                        return;
                    }

                    // Set position directly on the object (Group or Planet orbit group)
                    let target = body;
                    if (typeof body.getOrbitGroup === 'function') {
                        target = body.getOrbitGroup();
                    }
                    if (target && target.position) {
                        target.position.set(pos[0], pos[1], pos[2]);
                    }
                    // Set velocity if present
                    if (body) {
                        if (!body.velocity) body.velocity = new THREE.Vector3();
                        body.velocity.set(...vel);
                    }
                    // Set orientation if quaternion is present
                    if (target && target.quaternion && quat.length === 4) {
                        // Backend: [w, x, y, z] -> Three.js: (x, y, z, w)
                        let q = new THREE.Quaternion(quat[1], quat[2], quat[3], quat[0]);
                        if (typeof body.setOrientationFromServerQuaternion === 'function') {
                            body.setOrientationFromServerQuaternion(q);
                        } else {
                            target.quaternion.copy(q);
                        }
                    }
                    // --- DEBUG: Log local and world positions after setting ---
                    if (target && target.position && target.getWorldPosition) {
                        // const local = target.position.toArray();
                        // const world = target.getWorldPosition(new THREE.Vector3()).toArray();
                        // console.log(`[SimSocket] NAIF ${naif_id} set local:`, local, 'world:', world);
                    }
                    _planetaryUpdateNaifIds.add(naif_id);
                    if (Object.keys(_planetaryUpdateSamples).length < 5) {
                        _planetaryUpdateSamples[naif_id] = pos;
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
            }
            // After all planet positions/velocities are updated, update orbit lines
            if (app.orbitManager && typeof app.orbitManager.renderPlanetaryOrbits === 'function') {
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
        if (typeof data === 'string') {
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