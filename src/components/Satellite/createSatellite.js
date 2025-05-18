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

    const satParams = {
        ...params,
        id,
        color,
        mass: params.mass ?? 100,
        size: params.size ?? 1,
        name: params.name,
        ballisticCoefficient: params.ballisticCoefficient
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
    return sat;
}

/*────────── public wrappers — lat/lon launch (free or circular) ──────────*/

// Utility: Convert lat/lon/alt/velocity/azimuth/angleOfAttack to ECI pos/vel (in km, km/s)
function latLonAltToECI(params) {
    // All angles in degrees, altitude in km, velocity in km/s
    const {
        latitude, longitude, altitude, velocity, azimuth = 0, angleOfAttack = 0
    } = params;
    // PhysicsUtils expects altitude in meters, velocity in m/s
    const altM = altitude * 1000;
    const velMS = velocity * 1000;
    // No tilt/spin for ECI
    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocity(
        latitude, longitude, altM, velMS, azimuth, angleOfAttack,
        new THREE.Quaternion(), new THREE.Quaternion()
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
export async function createSatelliteFromLatLon(app, params, selectedBody) {
    // selectedBody should have naifId (e.g. 399 for Earth)
    const { pos, vel } = latLonAltToECI(params);
    // Only send backend-required fields
    const satPayload = {
        sat_id: nextSatId++,
        mass: params.mass,
        pos,
        vel,
        frame: 'ECLIPJ2000',
        central_body: selectedBody?.naifId || 399,
        bc: params.ballisticCoefficient,
        size: params.size,
        name: params.name
    };
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
    // Add to frontend scene (convert km to meters)
    const sat = app.satellites.addSatellite({
        id: backendSat.sat_id,
        position: new THREE.Vector3(pos[0] * 1000, pos[1] * 1000, pos[2] * 1000),
        velocity: new THREE.Vector3(vel[0] * 1000, vel[1] * 1000, vel[2] * 1000),
        mass: params.mass,
        size: params.size,
        name: params.name,
        color: brightColors[Math.floor(Math.random() * brightColors.length)],
        ballisticCoefficient: params.ballisticCoefficient
    });
    app.createDebugWindow?.(sat);
    app.updateSatelliteList?.();
    return sat;
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
    mass, size, name
}) {
    // Compute the inertial position & velocity
    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis * Constants.kmToMeters,
        eccentricity,
        inclination,
        argumentOfPeriapsis,
        raan,
        trueAnomaly
    );

    // Delegate to FrameTransforms for ecliptic/inertial/equatorial handling
    const { position, velocity } = inertialToWorld(
        app.earth,
        positionECI,
        velocityECI,
        { referenceFrame }
    );

    // Ecliptic: world XY-plane is ecliptic, so use ECI directly
    if (referenceFrame === 'ecliptic') {
        const pos = positionECI.clone().multiplyScalar(Constants.metersToKm);
        const vel = velocityECI.clone().multiplyScalar(Constants.metersToKm);
        return createSatellite(app, { position: pos, velocity: vel, mass, size, name });
    }
    // Equatorial: tilt frame by -ε (remove axial tilt) so orbit is in planet equatorial plane
    if (referenceFrame === 'equatorial') {
        const pos = positionECI.clone().applyQuaternion(PhysicsUtils.invTiltQuaternion).multiplyScalar(Constants.metersToKm);
        const vel = velocityECI.clone().applyQuaternion(PhysicsUtils.invTiltQuaternion).multiplyScalar(Constants.metersToKm);
        return createSatellite(app, { position: pos, velocity: vel, mass, size, name });
    }

    return createSatellite(app, { position, velocity, mass, size, name });
}

/*────────── ground-track helper (unchanged except frame) ──────*/
export async function getVisibleLocationsFromOrbitalElements(
    app, orbitParams, locations, options = {}
) {
    const { semiMajorAxis } = orbitParams;
    /* use the world-space satellite produced above */
    const sat = createSatelliteFromOrbitalElements(app, { ...orbitParams, mass: 1, size: 0.1, name: 'tmp' });
    const startPos = sat.position.clone().multiplyScalar(Constants.kmToMeters);
    const startVel = sat.velocity.clone().multiplyScalar(Constants.kmToMeters);

    const mu = Constants.earthGravitationalParameter;
    const baseT = 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis * Constants.kmToMeters, 3) / mu);
    const periods = options.numPeriods ?? 1;
    const steps = (options.numPoints ?? 180) * periods;

    const eciPts = await PhysicsUtils.propagateOrbit(
        startPos, startVel,
        [{ position: new THREE.Vector3(0, 0, 0), mass: Constants.earthMass }],
        baseT * periods,
        steps
    );

    const ReKm = Constants.earthRadius * Constants.metersToKm;
    const t0 = Date.now();
    const out = [];

    eciPts.forEach((pKm, idx) => {
        const t = t0 + idx * (baseT * periods * 1000 / steps);
        const gmst = PhysicsUtils.calculateGMST(t);
        const { lat, lon } = PhysicsUtils.eciTiltToLatLon(
            pKm.clone().multiplyScalar(Constants.kmToMeters), gmst
        );
        const alt = pKm.length() - ReKm;

        const theta = Math.acos(Constants.earthRadius /
            (Constants.earthRadius + alt * Constants.kmToMeters));
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
