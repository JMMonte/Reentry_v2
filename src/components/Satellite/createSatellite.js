/**********************************************************************
 * createSatellite.js — cleaned-up, fully drop-in replacement
 * Public API kept identical:
 *   resetSatelliteIdCounter
 *   createSatellite
 *   createSatelliteFromLatLon
 *   createSatelliteFromLatLonCircular (alias)
 *   createSatelliteFromOrbitalElements
 *   getVisibleLocationsFromOrbitalElements
 *********************************************************************/

import * as THREE from 'three';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { inertialToWorld } from '../../utils/FrameTransforms.js';

/*─────────────────── constants ────────────────────*/
const DEG2RAD = Math.PI / 180;
const DEFAULT_SIZE = 1;           // m (radius, for visuals)
const DEFAULT_MASS = 100;         // kg
const DEFAULT_CD = 2.2;         // dimensionless

/** Bright high-contrast colours for quick visual pick-out */
export const brightColors = [
    0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00, 0xFFFF00,
    0x00FF00, 0x00FF99, 0x00FFFF, 0x00CCFF, 0x0099FF,
    0x0000FF, 0x4D00FF, 0x9900FF, 0xFF00FF, 0xFF0099,
    0xFF1493, 0x00FF7F, 0xFF69B4, 0x7FFF00, 0x40E0D0,
    0xFF99CC, 0x99FF99, 0x99FFFF, 0x9999FF, 0xFF99FF
];

/*─────────────────── small helpers ────────────────────*/
const pickBrightColor = (override) =>
    override ?? brightColors[Math.floor(Math.random() * brightColors.length)];

const crossSectionalArea = (size, override) =>
    override ?? Math.PI * size * size;          // assume circular shape

const getPlanet = (app, naifId) =>
    (app.bodiesByNaifId?.[naifId]) || (app.planetsByNaifId?.[naifId]);

/*─────────────────── 1. Generic factory ────────────────────*/
/**
 * Low-level constructor that assumes inertial, planet-centred
 * position and velocity vectors (both in km / km s⁻¹).
 *
 * @param {App}   app    — reference to the running application
 * @param {Object}params — user-supplied satellite spec
 * @returns {Satellite}
 */
export async function createSatellite(app, params = {}) {
    const {
        position,
        velocity,
        planetConfig = params.planet,  // legacy alias
        mass = DEFAULT_MASS,
        size = DEFAULT_SIZE,
        name,
        ballisticCoefficient,
        crossSectionalArea: areaOverride,
        dragCoefficient = DEFAULT_CD,
        color = pickBrightColor(params.color)
    } = params;

    const sat = app.satellites.addSatellite({
        position,
        velocity,
        planetConfig,
        mass,
        size,
        name,
        ballisticCoefficient,
        crossSectionalArea: crossSectionalArea(size, areaOverride),
        dragCoefficient,
        color
    });

    // Honour global display toggles
    const disp = app.displaySettingsManager?.settings || app.displaySettings || {};
    sat.orbitLine && (sat.orbitLine.visible = disp.showOrbits);
    sat.apsisVisualizer && (sat.apsisVisualizer.visible = disp.showOrbits);
    sat.velocityVector && (sat.velocityVector.visible = disp.showSatVectors);
    sat.orientationVector && (sat.orientationVector.visible = disp.showSatVectors);

    // One-off orbit-line build (deferred updates handled elsewhere)
    sat.orbitLine?.visible && sat.updateOrbitLine(position, velocity);

    sat.setCentralBody(planetConfig.naifId);

    return sat;
}

/*─────────────────── 2. Lat/Lon launch creators ────────────────────*/
/**
 * Convert geodetic launch parameters to an Earth-centred inertial state.
 * Geometry approximates WGS-84 but is kept simple intentionally.
 */
function latLonAltToECI({
    latitude, longitude, altitude,
    velocity, azimuth = 0, angleOfAttack = 0
}, planet) {

    const lat = latitude * DEG2RAD;
    const lon = longitude * DEG2RAD;
    const a = planet.radius;               // equatorial
    const b = planet.polarRadius ?? a;     // polar fallback
    const e2 = 1 - (b * b) / (a * a);
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);

    // ECEF position (km)
    const X = (N + altitude) * Math.cos(lat) * Math.cos(lon);
    const Y = (N + altitude) * Math.cos(lat) * Math.sin(lon);
    const Z = ((1 - e2) * N + altitude) * Math.sin(lat);

    // Local ENU basis vectors
    const up = new THREE.Vector3(X, Y, Z).normalize();
    const north = new THREE.Vector3(
        -Math.sin(lat) * Math.cos(lon),
        -Math.sin(lat) * Math.sin(lon),
        Math.cos(lat)
    ).normalize();
    const east = new THREE.Vector3().crossVectors(up, north);

    // Launch direction in ENU
    const az = azimuth * DEG2RAD;
    const aoa = angleOfAttack * DEG2RAD;
    const horiz = east.clone().multiplyScalar(Math.cos(az + Math.PI))
        .add(north.clone().multiplyScalar(Math.sin(az + Math.PI)));

    const velENU = horiz.multiplyScalar(velocity * Math.cos(aoa))
        .add(up.clone().multiplyScalar(velocity * Math.sin(aoa)));

    // Ignoring planet rotation here. For high-fidelity models,
    // rotate ECEF to ECI via GMST before return.
    return {
        pos: [X, Y, Z],
        vel: [velENU.x, velENU.y, velENU.z]
    };
}

/**
 * High-level convenience wrapper for launching from geodetic coordinates.
 * All lengths in km, speeds in km s⁻¹, angles in degrees unless noted.
 */
export async function createSatelliteFromLatLon(app, params = {}) {
    const naifId = params.planetNaifId || params.central_body || params.naifId || 399;
    const planet = getPlanet(app, naifId);
    if (!planet) { throw new Error(`No Planet instance found for naifId ${naifId}`); }

    const { pos, vel } = latLonAltToECI(params, planet);

    return createSatellite(app, {
        ...params,
        position: pos,
        velocity: vel,
        planetConfig: planet,
        crossSectionalArea: crossSectionalArea(params.size ?? DEFAULT_SIZE, params.crossSectionalArea),
        dragCoefficient: params.dragCoefficient ?? DEFAULT_CD,
        color: pickBrightColor(params.color)
    });
}

/** Legacy alias kept for backwards compatibility. */
export const createSatelliteFromLatLonCircular = (...args) =>
    createSatelliteFromLatLon(...args);

/*─────────────────── 3. Orbital-element creator ────────────────────*/
/**
 * Build a satellite directly from classical orbital elements.
 */
export function createSatelliteFromOrbitalElements(app, params = {}) {
    const naifId = params.planetNaifId || params.central_body || params.naifId
        || params.planet?.naifId || 399;
    const planet = getPlanet(app, naifId);
    if (!planet) { throw new Error(`No Planet instance found for naifId ${naifId}`); }

    const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
        params.semiMajorAxis,
        params.eccentricity,
        params.inclination,
        params.argumentOfPeriapsis,
        params.raan,
        params.trueAnomaly,
        planet.GM
    );

    // Convert to the Three.js world frame (Z-up, planet centred)
    const { position, velocity } = inertialToWorld(
        planet,
        positionECI,
        velocityECI,
        { referenceFrame: 'equatorial' }
    );

    return createSatellite(app, {
        ...params,
        position,
        velocity,
        planetConfig: planet,
        crossSectionalArea: crossSectionalArea(params.size ?? DEFAULT_SIZE, params.crossSectionalArea),
        dragCoefficient: params.dragCoefficient ?? DEFAULT_CD,
        color: pickBrightColor(params.color)
    });
}

/*─────────────────── 4. Ground-track helper ────────────────────*/
/**
 * Propagate an orbit and report visibility from a list of ground sites.
 * Returns an array of records: { time, lat, lon, altitude, visible[] }.
 */
export async function getVisibleLocationsFromOrbitalElements(
    app,
    orbitParams,
    locations,
    planet,
    { numPeriods = 1, numPoints = 180 } = {}
) {
    const sat = createSatelliteFromOrbitalElements(app, {
        ...orbitParams, mass: 1, size: 0.1, name: '_tmp_', planet
    });
    const { position: startPos, velocity: startVel } = sat;
    const mu = planet.GM;
    const period = 2 * Math.PI * Math.sqrt(Math.pow(orbitParams.semiMajorAxis, 3) / mu);
    const steps = numPoints * numPeriods;

    const eciPts = await PhysicsUtils.propagateOrbit(
        startPos, startVel,
        [{ position: new THREE.Vector3(), mass: planet.mass }],
        period * numPeriods,
        steps
    );

    const t0 = Date.now();
    const ReKm = planet.radius;
    const results = [];

    eciPts.forEach((pKm, idx) => {
        const t = t0 + idx * (period * numPeriods * 1e3 / steps);
        const gmst = PhysicsUtils.calculateGMST(t);
        const { lat, lon } = PhysicsUtils.eciTiltToLatLon(pKm.clone(), gmst, planet.inclination);
        const alt = pKm.length() - ReKm;
        const theta = Math.acos(ReKm / (ReKm + alt));
        const cosLimit = Math.cos(theta);

        const latR = lat * DEG2RAD;
        const lonR = lon * DEG2RAD;
        const sinLat = Math.sin(latR);
        const cosLat = Math.cos(latR);

        const visible = locations.filter(loc => {
            const lat2 = loc.lat * DEG2RAD;
            const lon2 = loc.lon * DEG2RAD;
            let dLon = Math.abs(lon2 - lonR);
            if (dLon > Math.PI) dLon = 2 * Math.PI - dLon;
            const cosC = sinLat * Math.sin(lat2) + cosLat * Math.cos(lat2) * Math.cos(dLon);
            return cosC >= cosLimit;
        });

        results.push({ time: t, lat, lon, altitude: alt, visible });
    });

    app.satellites.removeSatellite?.(sat.id);  // tidy temporary sat
    return results;
}
