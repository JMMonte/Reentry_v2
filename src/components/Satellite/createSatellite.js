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

    sat.setCentralBody(satParams.planetConfig.naifId);

    // Always expect planet-centric position/velocity and centralBodyNaifId
    const planet = params.planetConfig;
    const planetGroup = planet.getRotationGroup();
    // Convert position to meters if your scene uses meters (assume input is km)
    const posVec = new THREE.Vector3(params.position[0], params.position[1], params.position[2]).multiplyScalar(1000); // km -> m
    // Create a simple sphere mesh for the satellite (customize as needed)
    const geometry = new THREE.SphereGeometry(params.size ?? 1, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: params.color ?? 0xff0000 });
    const satMesh = new THREE.Mesh(geometry, material);
    // Set mesh position (planet-centric, in meters)
    satMesh.position.copy(posVec);
    // Parent to planet's mesh group
    planetGroup.add(satMesh);

    // Store mesh reference, etc.
    // Return satellite object
    return {
        ...params,
        object3D: satMesh
    };
}

/*────────── public wrappers — lat/lon launch (free or circular) ──────────*/

// Utility: Convert lat/lon/alt/velocity/azimuth/angleOfAttack to ECI pos/vel (in km, km/s)
function latLonAltToECI(params, planet) {
    const {
        latitude, longitude, altitude, velocity, azimuth = 0, angleOfAttack = 0
    } = params;
    // Convert angles to radians
    const latRad = THREE.MathUtils.degToRad(latitude);
    const lonRad = THREE.MathUtils.degToRad(longitude);
    // Use planet's equatorial and polar radii (km)
    const a = planet.radius;
    const b = planet.polarRadius ?? planet.radius; // fallback to sphere
    // WGS84-like flattening
    const e2 = 1 - (b * b) / (a * a);
    const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
    // ECEF position (km)
    const X = (N + altitude) * Math.cos(latRad) * Math.cos(lonRad);
    const Y = (N + altitude) * Math.cos(latRad) * Math.sin(lonRad);
    const Z = ((1 - e2) * N + altitude) * Math.sin(latRad);
    // Local ENU basis
    const up = new THREE.Vector3(X, Y, Z).normalize();
    const north = new THREE.Vector3(
        -Math.sin(latRad) * Math.cos(lonRad),
        -Math.sin(latRad) * Math.sin(lonRad),
        Math.cos(latRad)
    ).normalize();
    const east = new THREE.Vector3().crossVectors(up, north);
    // Velocity in ENU
    const azRad = THREE.MathUtils.degToRad(azimuth);
    const aoaRad = THREE.MathUtils.degToRad(angleOfAttack);
    const horizontal = east.clone().multiplyScalar(Math.cos(azRad + Math.PI))
        .add(north.clone().multiplyScalar(Math.sin(azRad + Math.PI)));
    const velENU = horizontal.multiplyScalar(velocity * Math.cos(aoaRad))
        .add(up.clone().multiplyScalar(velocity * Math.sin(aoaRad)));
    // For now, treat ECEF = ECI (no planet rotation, no GMST)
    // If you want to add planet rotation, you can rotate by GMST here.
    console.log('[latLonAltToECI] ECEF pos:', [X, Y, Z], 'vel:', [velENU.x, velENU.y, velENU.z]);
    return {
        pos: [X, Y, Z],
        vel: [velENU.x, velENU.y, velENU.z]
    };
}

// Refactored: createSatelliteFromLatLon now builds backend payload and adds to scene
export async function createSatelliteFromLatLon(app, params) {
    // Step 1: Log input params
    console.log('[createSatelliteFromLatLon] called with params:', params);
    // Step 2: Resolve planet NAIF ID
    const naifId = params.planetNaifId || params.central_body || params.naifId || 399;
    console.log('[createSatelliteFromLatLon] resolved naifId:', naifId);
    // Step 3: Lookup Planet instance
    const planet = (app.bodiesByNaifId && app.bodiesByNaifId[naifId]) || (app.planetsByNaifId && app.planetsByNaifId[naifId]);
    console.log('[createSatelliteFromLatLon] resolved planet:', planet);
    if (!planet) {
        console.error(`[createSatelliteFromLatLon] No Planet instance found for naif_id ${naifId}`);
        throw new Error(`No Planet instance found for naif_id ${naifId}`);
    }
    // Step 4: Convert geodetic to ECI (planet-centric inertial, in km)
    const { pos, vel } = latLonAltToECI(params, planet);
    console.log('[createSatelliteFromLatLon] ECI pos, vel (planet-centric, km):', pos, vel);
    // Step 5: Pass planet-centric position/velocity to SatelliteManager
    const size = params.size ?? 1;
    const crossSectionalArea = params.crossSectionalArea ?? (Math.PI * size * size);
    const dragCoefficient = params.dragCoefficient ?? 2.2;
    // Always assign a color for visuals (never for physics/backend)
    const color = params.color ?? brightColors[Math.floor(Math.random() * brightColors.length)];
    const satParams = {
        id: params.sat_id || params.id || Date.now(),
        position: pos, // planet-centric, km
        velocity: vel, // planet-centric, km/s
        mass: params.mass,
        size: params.size,
        name: params.name,
        planetConfig: planet,
        ballisticCoefficient: params.ballisticCoefficient,
        crossSectionalArea,
        dragCoefficient,
        centralBodyNaifId: naifId, // required for planet-centric
        color // for visuals only
    };
    // If no backend session, fall back to local physics provider
    if (!app.sessionId) {
        const sat = app.satellites.addSatellite(satParams);
        console.log('[createSatelliteFromLatLon] created local satellite:', sat);
        return sat;
    }
    // Backend payload (planet-centric)
    const satPayload = {
        sat_id: satParams.id,
        mass: satParams.mass,
        pos: satParams.position,
        vel: satParams.velocity,
        frame: 'PLANETCENTRIC',
        central_body: naifId,
        bc: params.ballisticCoefficient,
        size: params.size,
        name: params.name
    };
    console.log('[createSatelliteFromLatLon] satPayload:', satPayload);
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
    // Always create and return a Satellite instance
    const sat = app.satellites.addSatellite(satParams);
    console.log('[createSatelliteFromLatLon] created backend satellite:', sat);
    return sat;
}

// Backward-compatible alias for circular launches
export async function createSatelliteFromLatLonCircular(sessionId, params, selectedBody) {
    return createSatelliteFromLatLon(sessionId, { ...params, circular: true }, selectedBody);
}

/*────────── orbital-element creator ───────────────*/
export function createSatelliteFromOrbitalElements(app, params) {
    // Step 1: Log input params
    console.log('[createSatelliteFromOrbitalElements] called with params:', params);
    // Step 2: Resolve planet NAIF ID
    const naifId = params.planetNaifId || params.central_body || params.naifId || (params.planet && params.planet.naifId) || 399;
    console.log('[createSatelliteFromOrbitalElements] resolved naifId:', naifId);
    // Step 3: Lookup Planet instance
    const planet = (app.bodiesByNaifId && app.bodiesByNaifId[naifId]) || (app.planetsByNaifId && app.planetsByNaifId[naifId]);
    console.log('[createSatelliteFromOrbitalElements] resolved planet:', planet);
    if (!planet) {
        console.error(`[createSatelliteFromOrbitalElements] No Planet instance found for naif_id ${naifId}`);
        throw new Error(`No Planet instance found for naif_id ${naifId}`);
    }
    // Step 4: Compute inertial state vector in planet-centric frame
    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
        params.semiMajorAxis * Constants.kmToMeters,
        params.eccentricity,
        params.inclination,
        params.argumentOfPeriapsis,
        params.raan,
        params.trueAnomaly,
        planet.GM
    );
    console.log('[createSatelliteFromOrbitalElements] ECI position, velocity:', positionECI, velocityECI);
    // Step 5: Convert to planet mesh Z-up frame (Three.js world)
    const { position, velocity } = inertialToWorld(
        planet,
        positionECI,
        velocityECI,
        { referenceFrame: 'equatorial' }
    );
    console.log('[createSatelliteFromOrbitalElements] mesh/world position, velocity:', position, velocity);
    // Step 6: Continue as before, but use transformed position/velocity
    const computedSize = params.size ?? 1;
    const area = params.crossSectionalArea ?? (Math.PI * computedSize * computedSize);
    const drag = params.dragCoefficient ?? 2.2;
    // Always assign a color for visuals (never for physics/backend)
    const color = params.color ?? brightColors[Math.floor(Math.random() * brightColors.length)];
    const sat = app.satellites.addSatellite({ position, velocity, mass: params.mass, size: computedSize, name: params.name, planetConfig: planet, crossSectionalArea: area, dragCoefficient: drag, color });
    console.log('[createSatelliteFromOrbitalElements] created satellite:', sat);
    return sat;
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
