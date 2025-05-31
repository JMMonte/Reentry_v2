/**********************************************************************
 * createSatellite.js — cleaned-up, fully drop-in replacement
 * Public API kept identical:
 *   resetSatelliteIdCounter
 *   createSatellite
 *   createSatelliteFromLatLon
 *   createSatelliteFromLatLonCircular (alias)
 *   createSatelliteFromOrbitalElements
 *********************************************************************/

import { SatelliteCoordinates } from '../../physics/utils/SatelliteCoordinates.js';

/*─────────────────── constants ────────────────────*/
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

    // Log only essential info
    const velMag = velocity ? Math.sqrt((velocity.x || velocity[0])**2 + (velocity.y || velocity[1])**2 + (velocity.z || velocity[2])**2) : 0;
    console.log(`[createSatellite] ${name || 'Satellite'} - ${planetConfig?.name || 'unknown'} - v=${velMag.toFixed(3)} km/s`);

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

    // Log planet info only if needed for debugging
    // console.log(`[createSatelliteFromLatLon] ${planet.name} (NAIF ${planet.naifId}), GM=${planet.GM} km³/s²`);

    // Use improved coordinate calculation with planet quaternion
    const currentTime = app.timeUtils?.getSimulatedTime() || new Date();
    const { position, velocity } = SatelliteCoordinates.createFromLatLon(params, planet, currentTime);

    // Log final velocity for circular orbit verification
    const velMag = Array.isArray(velocity) ? Math.sqrt(velocity[0]**2 + velocity[1]**2 + velocity[2]**2) : velocity.length();
    if (params.velocity === undefined) {
        console.log(`[createSatelliteFromLatLon] Circular orbit: v=${velMag.toFixed(3)} km/s at ${params.altitude} km, azimuth=${params.azimuth || 0}°`);
    }

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
    const { position, velocity } = SatelliteCoordinates.createFromOrbitalElements(params, planet);

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

