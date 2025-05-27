import * as THREE from 'three';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { Constants } from '../../utils/Constants.js';
import { inertialToWorld } from '../../utils/FrameTransforms.js';
import { PHYSICS_SERVER_URL } from '../../utils/simApi.js';
import { PHYSICS_WS_URL } from '../../simulation/simSocket.js';

/*──────────────── session-wide unique ID counter ────────────────*/
let nextSatelliteId = 0;
export function resetSatelliteIdCounter() { nextSatelliteId = 0; }

/*────────────────── bright random colours (unchanged) ───────────*/
const brightColors = [
    0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00, 0xFFFF00,
    0x00FF00, 0x00FF99, 0x00FFFF, 0x00CCFF, 0x0099FF,
    0x0000FF, 0x4D00FF, 0x9900FF, 0xFF00FF, 0xFF0099,
    0xFF1493, 0x00FF7F, 0xFF69B4, 0x7FFF00, 0x40E0D0,
    0xFF99CC, 0x99FF99, 0x99FFFF, 0x9999FF, 0xFF99FF
];

/*──────────────────────── core creator ──────────────────────────*/
export async function createSatellite(app, params) {
    const id = nextSatelliteId++;
    const color = brightColors[Math.floor(Math.random() * brightColors.length)];
    // Compute cross-sectional area if not provided (assume circular: π * r^2, where r = size)
    const size = params.size ?? 1;
    const crossSectionalArea = params.crossSectionalArea ?? (Math.PI * size * size);
    const dragCoefficient = params.dragCoefficient ?? 2.2;
    const satParams = {
        ...params,
        id,
        color,
        mass: params.mass ?? 100,
        size,
        name: params.name,
        ballisticCoefficient: params.ballisticCoefficient,
        planetConfig: params.planetConfig || params.planet, // ensure planetConfig is always set
        crossSectionalArea,
        dragCoefficient
    };
    const sat = app.satellites.addSatellite(satParams);

    const disp = app.displaySettingsManager?.settings || app.displaySettings || {};
    if (sat.orbitLine) sat.orbitLine.visible = disp.showOrbits;
    if (sat.apsisVisualizer) sat.apsisVisualizer.visible = disp.showOrbits;
    if (sat.velocityVector) sat.velocityVector.visible = disp.showSatVectors;
    if (sat.orientationVector) sat.orientationVector.visible = disp.showSatVectors;

    if (sat.orbitLine?.visible) sat.updateOrbitLine(params.position, params.velocity);

    app.createDebugWindow?.(sat);
    app.updateSatelliteList?.();
    // Parent under its central body immediately in the scene
    sat.setCentralBody(satParams.planetConfig.naifId);
    sat.central_body = satParams.planetConfig.naifId;
    return sat;
}

/*────────── public wrappers — lat/lon launch (free or circular) ──────────*/

// Utility: Convert lat/lon/alt/velocity/azimuth/angleOfAttack to ECI pos/vel (in km, km/s)
function latLonAltToECI(params, planet) {
    // All angles in degrees, altitude in km, velocity in km/s
    const {
        latitude, longitude, altitude, velocity, azimuth = 0, angleOfAttack = 0
    } = params;
    // PhysicsUtils expects altitude in meters, velocity in m/s
    const altM = altitude * 1000;
    const velMS = velocity * 1000;
    const tiltQ = PhysicsUtils.getTiltQuaternion(planet.inclination);
    // No planet rotation for ECI by default
    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocity(
        latitude, longitude, altM, velMS, azimuth, angleOfAttack,
        planet.radius, planet.polarRadius, tiltQ, new THREE.Quaternion()
    );
    // Convert to km and km/s arrays
    return {
        pos: [positionECI.x * 0.001, positionECI.y * 0.001, positionECI.z * 0.001],
        vel: [velocityECI.x * 0.001, velocityECI.y * 0.001, velocityECI.z * 0.001]
    };
}

// Add a local satellite ID counter for backend integer IDs
let nextSatId = 1;

// Refactored: createSatelliteFromLatLon now builds backend payload and adds to scene
export async function createSatelliteFromLatLon(app, params, planet) {
    const { pos, vel } = latLonAltToECI(params, planet);
    const size = params.size ?? 1;
    const crossSectionalArea = params.crossSectionalArea ?? (Math.PI * size * size);
    const dragCoefficient = params.dragCoefficient ?? 2.2;
    const satPayload = {
        sat_id: nextSatId++,
        mass: params.mass,
        pos,
        vel,
        frame: 'ECLIPJ2000',
        central_body: planet?.naifId || 399,
        bc: params.ballisticCoefficient,
        size: params.size,
        name: params.name
    };
    // If no backend session, fall back to local physics provider
    if (!app.sessionId) {
        const sat = await createSatellite(app, {
            id: satPayload.sat_id,
            position: new THREE.Vector3(
                pos[0] * Constants.kmToMeters,
                pos[1] * Constants.kmToMeters,
                pos[2] * Constants.kmToMeters
            ),
            velocity: new THREE.Vector3(
                vel[0] * Constants.kmToMeters,
                vel[1] * Constants.kmToMeters,
                vel[2] * Constants.kmToMeters
            ),
            mass: params.mass,
            size: params.size,
            name: params.name,
            planetConfig: planet,
            ballisticCoefficient: params.ballisticCoefficient,
            crossSectionalArea,
            dragCoefficient
        });
        return sat;
    }
    const url = `${PHYSICS_SERVER_URL}/satellite?session_id=${app.sessionId}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(satPayload)
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create satellite: ${error}`);
    }
    const backendSat = await response.json();
    return createSatellite(app, {
        id: backendSat.sat_id,
        position: new THREE.Vector3(
            pos[0] * Constants.kmToMeters,
            pos[1] * Constants.kmToMeters,
            pos[2] * Constants.kmToMeters
        ),
        velocity: new THREE.Vector3(
            vel[0] * Constants.kmToMeters,
            vel[1] * Constants.kmToMeters,
            vel[2] * Constants.kmToMeters
        ),
        mass: params.mass,
        size: params.size,
        name: params.name,
        planetConfig: planet,
        ballisticCoefficient: params.ballisticCoefficient,
        crossSectionalArea,
        dragCoefficient
    });
}

// Backward-compatible alias for circular launches
export async function createSatelliteFromLatLonCircular(sessionId, params, selectedBody) {
    return createSatelliteFromLatLon(sessionId, { ...params, circular: true }, selectedBody);
}

/*────────── orbital-element creator ───────────────*/
export function createSatelliteFromOrbitalElements(app, {
    semiMajorAxis, eccentricity, inclination,
    raan, argumentOfPeriapsis, trueAnomaly,
    referenceFrame = 'inertial',
    mass, size, name,
    planet,
    crossSectionalArea,
    dragCoefficient
}) {
    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis * Constants.kmToMeters,
        eccentricity,
        inclination,
        argumentOfPeriapsis,
        raan,
        trueAnomaly,
        planet.GM
    );
    const { position, velocity } = inertialToWorld(
        app.earth,
        positionECI,
        velocityECI,
        { referenceFrame }
    );
    const computedSize = size ?? 1;
    const area = crossSectionalArea ?? (Math.PI * computedSize * computedSize);
    const drag = dragCoefficient ?? 2.2;
    if (referenceFrame === 'ecliptic') {
        const pos = positionECI.clone().multiplyScalar(Constants.metersToKm);
        const vel = velocityECI.clone().multiplyScalar(Constants.metersToKm);
        return createSatellite(app, { position: pos, velocity: vel, mass, size: computedSize, name, planetConfig: planet, crossSectionalArea: area, dragCoefficient: drag });
    }
    if (referenceFrame === 'equatorial') {
        const invTiltQ = PhysicsUtils.getInvTiltQuaternion(planet.inclination);
        const pos = positionECI.clone().applyQuaternion(invTiltQ).multiplyScalar(Constants.metersToKm);
        const vel = velocityECI.clone().applyQuaternion(invTiltQ).multiplyScalar(Constants.metersToKm);
        return createSatellite(app, { position: pos, velocity: vel, mass, size: computedSize, name, planetConfig: planet, crossSectionalArea: area, dragCoefficient: drag });
    }
    return createSatellite(app, { position, velocity, mass, size: computedSize, name, planetConfig: planet, crossSectionalArea: area, dragCoefficient: drag });
}

/*────────── ground-track helper (unchanged except frame) ──────*/
export async function getVisibleLocationsFromOrbitalElements(
    app, orbitParams, locations, planet, options = {}
) {
    const { semiMajorAxis } = orbitParams;
    /* use the world-space satellite produced above */
    const sat = createSatelliteFromOrbitalElements(app, { ...orbitParams, mass: 1, size: 0.1, name: 'tmp', planet });
    const startPos = sat.position.clone().multiplyScalar(Constants.kmToMeters);
    const startVel = sat.velocity.clone().multiplyScalar(Constants.kmToMeters);

    const mu = planet.GM;
    const baseT = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis * Constants.kmToMeters, 3) / mu);
    const periods = options.numPeriods ?? 1;
    const steps = (options.numPoints ?? 180) * periods;

    const eciPts = await PhysicsUtils.propagateOrbit(
        startPos, startVel,
        [{ position: new THREE.Vector3(0, 0, 0), mass: planet.mass }],
        baseT * periods,
        steps
    );

    const ReKm = planet.radius * Constants.metersToKm;
    const t0 = Date.now();
    const out = [];

    eciPts.forEach((pKm, idx) => {
        const t = t0 + idx * (baseT * periods * 1000 / steps);
        const gmst = PhysicsUtils.calculateGMST(t);
        const { lat, lon } = PhysicsUtils.eciTiltToLatLon(
            pKm.clone().multiplyScalar(Constants.kmToMeters), gmst, planet.inclination
        );
        const alt = pKm.length() - ReKm;

        const theta = Math.acos(planet.radius /
            (planet.radius + alt * Constants.kmToMeters));
        const cosLimit = Math.cos(theta);
        const lat1 = THREE.MathUtils.degToRad(lat);
        const lon1 = THREE.MathUtils.degToRad(lon);
        const sinLat1 = Math.sin(lat1);
        const cosLat1 = Math.cos(lat1);

        const visible = locations.filter(loc => {
            const lat2 = THREE.MathUtils.degToRad(loc.lat);
            const lon2 = THREE.MathUtils.degToRad(loc.lon);
            let dLon = Math.abs(lon2 - lon1);
            if (dLon > Math.PI) dLon = 2 * Math.PI - dLon;
            const cosC = sinLat1 * Math.sin(lat2) + cosLat1 * Math.cos(lat2) * Math.cos(dLon);
            return cosC >= cosLimit;
        });

        out.push({ time: t, lat, lon, altitude: alt, visible });
    });

    /* remove the temporary satellite */
    app.satellites.removeSatellite?.(sat.id);

    return out;
}

/**
 * Open a WebSocket to listen for satellite state updates and update frontend state.
 * @param {App3D} app - The App3D instance.
 * @param {string|number} sessionId - The backend session ID.
 * @returns {WebSocket} The WebSocket instance.
 */
export function listenToSatelliteState(app, sessionId) {
    const ws = new WebSocket(`${PHYSICS_WS_URL}?session_id=${sessionId}&frame=ECLIPJ2000`);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (event) => {
        // If backend sends JSON, parse it; otherwise, parse binary and add fields as needed
        if (typeof event.data === 'string') {
            // JSON message
            const msg = JSON.parse(event.data);
            if (msg.sat_id !== undefined && msg.pos && msg.vel) {
                app.satellites.updateSatelliteFromBackend(
                    msg.sat_id,
                    msg.pos,
                    msg.vel,
                    msg // pass all fields
                );
            }
            return;
        }
        // Binary protocol (original)
        const data = new DataView(event.data);
        const msgType = data.getUint8(0);
        if (msgType === 0) {
            const satId = data.getUint32(1, true);
            const pos = [
                data.getFloat64(5, true),
                data.getFloat64(13, true),
                data.getFloat64(21, true)
            ];
            const vel = [
                data.getFloat64(29, true),
                data.getFloat64(37, true),
                data.getFloat64(45, true)
            ];
            // TODO: If backend encodes more fields in binary, parse them here and pass as backendFields
            app.satellites.updateSatelliteFromBackend(satId, pos, vel);
        }
    };
    return ws;
}

/**
 * Delete a satellite by ID.
 * @param {string|number} sessionId - The backend session ID.
 * @param {number} satId - The satellite ID to delete.
 * @returns {Promise<void>}
 */
export async function deleteSatellite(sessionId, satId) {
    const url = `${PHYSICS_SERVER_URL}/satellite/${satId}?session_id=${sessionId}`;
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to delete satellite: ${error}`);
    }
}
