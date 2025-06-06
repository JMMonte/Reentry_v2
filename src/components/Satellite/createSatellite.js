/**********************************************************************
 * createSatellite.js — cleaned-up, fully drop-in replacement
 * Public API kept identical:
 *   resetSatelliteIdCounter
 *   createSatellite
 *   createSatelliteFromLatLon
 *   createSatelliteFromLatLonCircular (alias)
 *   createSatelliteFromOrbitalElements
 *********************************************************************/

import { CoordinateTransforms } from '../../physics/utils/CoordinateTransforms.js';

/*─────────────────── constants ────────────────────*/
const DEFAULT_SIZE = 1;           // m (radius, for visuals)
const DEFAULT_MASS = 100;         // kg
const DEFAULT_CD = 2.2;         // dimensionless

/** Bright high-contrast colours for quick visual pick-out */
// Note: Avoiding dark blues (0x0066cc range) to prevent confusion with grid lines
export const brightColors = [
    0xFF0000, 0xFF4D00, 0xFF9900, 0xFFCC00, 0xFFFF00,
    0x00FF00, 0x00FF99, 0x00FFFF, 0x00CCFF, 0x0099FF,
    0x00DDFF, 0x4D00FF, 0x9900FF, 0xFF00FF, 0xFF0099,
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
        color = pickBrightColor(params.color),
        commsConfig = params.commsConfig || {}
    } = params;

    const sat = await app.satellites.addSatellite({
        position,
        velocity,
        planetConfig,
        centralBodyNaifId: planetConfig.naifId,
        mass,
        size,
        name,
        ballisticCoefficient,
        crossSectionalArea: crossSectionalArea(size, areaOverride),
        dragCoefficient,
        color
    });

    // Communication subsystem is automatically created by PhysicsEngine when satellite is added
    // Additional communication configuration can be applied via SatelliteCommsManager if needed
    if (commsConfig && Object.keys(commsConfig).length > 0) {
        // This config will be available for the communication manager to use
        sat.commsConfig = {
            preset: commsConfig.preset || 'cubesat',
            enabled: commsConfig.enabled !== false,
            ...commsConfig
        };
    }

    // Return the satellite object
    return sat;
}

/**
 * High-level convenience wrapper for launching from geodetic coordinates.
 * All lengths in km, speeds in km s⁻¹, angles in degrees unless noted.
 */
export async function createSatelliteFromLatLon(app, params = {}) {
    const naifId = params.planetNaifId || params.central_body || params.naifId || 399;
    const planet = getPlanet(app, naifId);
    if (!planet) { throw new Error(`No Planet instance found for naifId ${naifId}`); }

    // Use improved coordinate calculation with planet quaternion
    const currentTime = app.timeUtils?.getSimulatedTime() || new Date();
    const { position, velocity } = CoordinateTransforms.createFromLatLon(params, planet, currentTime);

    const sat = await createSatellite(app, {
        ...params,
        position,
        velocity,
        planetConfig: planet,
        crossSectionalArea: crossSectionalArea(params.size ?? DEFAULT_SIZE, params.crossSectionalArea),
        dragCoefficient: params.dragCoefficient ?? DEFAULT_CD,
        color: pickBrightColor(params.color)
    });

    return { satellite: sat, position, velocity };
}

/** Legacy alias kept for backwards compatibility. */
export const createSatelliteFromLatLonCircular = (...args) =>
    createSatelliteFromLatLon(...args);

/*─────────────────── 3. Orbital-element creator ────────────────────*/
/**
 * Build a satellite directly from classical orbital elements.
 */
export async function createSatelliteFromOrbitalElements(app, params = {}) {
    const naifId = params.planetNaifId || params.central_body || params.naifId
        || params.planet?.naifId || 399;
    const planet = getPlanet(app, naifId);
    if (!planet) { throw new Error(`No Planet instance found for naifId ${naifId}`); }

    // Use improved coordinate calculation with planet quaternion
    const { position, velocity } = CoordinateTransforms.createFromOrbitalElements(params, planet);

    const sat = await createSatellite(app, {
        ...params,
        position,
        velocity,
        planetConfig: planet,
        crossSectionalArea: crossSectionalArea(params.size ?? DEFAULT_SIZE, params.crossSectionalArea),
        dragCoefficient: params.dragCoefficient ?? DEFAULT_CD,
        color: pickBrightColor(params.color)
    });

    return { satellite: sat, position, velocity };
}

