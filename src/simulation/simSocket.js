// Kick off live sim stream from Python physics backend

import * as THREE from 'three';

export const PHYSICS_SERVER_URL = import.meta.env.VITE_PHYSICS_SERVER_URL || 'http://localhost:8000';
export const PHYSICS_WS_URL = PHYSICS_SERVER_URL.replace(/^http/, 'ws') + '/ws';

import { naifIdToConfig } from '../config/celestialBodiesConfig.js';
import { Sun } from '../components/Sun.js'; // Import Sun class

/**
 * Create a new sim session, seeding it with the current simulation time.
 * @param {string} startTimeISO - ISO string of the simulation start time
 */
async function createSimSession(startTimeISO) {
    const resp = await fetch(`${PHYSICS_SERVER_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_time: startTimeISO })
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
    const url = `${PHYSICS_WS_URL}?session_id=${sessionId}&frame=${frame}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => { };
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
                    const naif_id = dv.getUint32(offset, true); offset += 4;
                    const pos = [];
                    for (let i = 0; i < 3; i++) { pos.push(dv.getFloat64(offset, true)); offset += 8; }
                    const vel = [];
                    for (let i = 0; i < 3; i++) { vel.push(dv.getFloat64(offset, true)); offset += 8; }
                    const quat = [];
                    for (let i = 0; i < 4; i++) { quat.push(dv.getFloat64(offset, true)); offset += 8; }

                    if (!app.bodiesByNaifId) app.bodiesByNaifId = {};
                    const config = naifIdToConfig[naif_id];
                    if (!config) return;

                    let body = app.bodiesByNaifId[naif_id];
                    // --- Update body state from backend ---
                    if (body && typeof body.getOrbitGroup === 'function') {
                        body.getOrbitGroup().position.set(pos[0], pos[1], pos[2]);
                        if (body.velocity) body.velocity.set(...vel);
                        if (body.setOrientationFromServerQuaternion) {
                            const qServer = new THREE.Quaternion(...quat);
                            body.setOrientationFromServerQuaternion(qServer);
                        } else if (body.getOrbitGroup().quaternion) {
                            body.getOrbitGroup().quaternion.set(...quat);
                        }
                    } else if (body instanceof THREE.Group) {
                        body.position.set(pos[0], pos[1], pos[2]);
                        body.quaternion.set(...quat);
                    } else if (body instanceof Sun) {
                        body.setPosition(new THREE.Vector3(pos[0], pos[1], pos[2]));
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
                console.log('[SimStream] received:', parsed);
                const { bodies } = parsed;
                if (!bodies || !Array.isArray(bodies)) {
                    console.warn('[SimStream] no bodies array in update');
                    return;
                }
                bodies.forEach(b => {
                    const planet = app.Planet.instances.find(p => p.nameLower === b.name.toLowerCase());
                    if (planet) {
                        console.log(`[SimStream] updating ${b.name} to`, b.position);
                        planet.getOrbitGroup().position.set(b.position.x, b.position.y, b.position.z);
                    } else {
                        console.warn(`[SimStream] no planet found for`, b.name);
                    }
                });
            } catch (e) {
                console.error('[SimStream] parse error on planetary update', e);
            }
        }
    };

    app.simSocket = ws;
} 