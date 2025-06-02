import { groundTrackService } from '../services/GroundTrackService.js';

/**
 * Project a world-space position to planet surface coordinates using physics service.
 * Works for any celestial body, not just Earth.
 * @param {Array|Object} worldPos - Position [x,y,z] or {x,y,z} in km relative to planet center
 * @param {number} planetNaifId - Planet NAIF ID
 * @param {Date|number} time - Time for transformation
 * @returns {Promise<{latitude: number, longitude: number, altitude: number}>} Geodetic coords (deg, deg, km)
 */
export async function projectToGeodetic(worldPos, planetNaifId, time = new Date()) {
    if (!worldPos || planetNaifId === undefined) {
        return { latitude: 0, longitude: 0, altitude: 0 };
    }

    // Normalize position to array format
    const position = Array.isArray(worldPos) 
        ? worldPos 
        : [worldPos.x, worldPos.y, worldPos.z];
    
    const timeMs = time instanceof Date ? time.getTime() : time;
    
    const result = await groundTrackService.transformECIToSurface(
        position, planetNaifId, timeMs
    );
    
    return {
        latitude: result.lat,
        longitude: result.lon,
        altitude: result.alt
    };
}

/**
 * Convert geodetic latitude and longitude to canvas coordinates (equirectangular projection).
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} width - Canvas width in pixels
 * @param {number} height - Canvas height in pixels
 * @returns {{x: number, y: number}} Canvas pixel coordinates
 */
export function latLonToCanvas(lat, lon, width, height) {
    // Longitude: -180 to +180 -> 0 to width
    // Latitude: +90 to -90 -> 0 to height
    const x = ((lon + 180) % 360 / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return { x, y };
}

/**
 * Project a 3D world-space position to canvas pixel coordinates.
 * Generic for any celestial body.
 * @param {Array|Object} worldPos - Position [x,y,z] or {x,y,z} in km relative to planet center
 * @param {number} planetNaifId - Planet NAIF ID
 * @param {number} width - Canvas width in pixels
 * @param {number} height - Canvas height in pixels
 * @param {Date|number} time - Time for projection
 * @returns {Promise<{x: number, y: number, latitude: number, longitude: number, altitude: number}>}
 */
export async function projectWorldPosToCanvas(worldPos, planetNaifId, width, height, time = new Date()) {
    const geo = await projectToGeodetic(worldPos, planetNaifId, time);
    const { x, y } = latLonToCanvas(geo.latitude, geo.longitude, width, height);
    return { x, y, ...geo };
}

/**
 * Project a satellite's position to planet-fixed lat/lon.
 * Uses physics service for consistent coordinate transformations.
 * @param {Array|Object} satPos - Satellite position [x,y,z] or {x,y,z} in planet-centric inertial (km)
 * @param {number} planetNaifId - Planet NAIF ID
 * @param {Date|number} time - Time for transformation
 * @returns {Promise<{lat: number, lon: number, alt: number}>}
 */
export async function projectToPlanetLatLon(satPos, planetNaifId, time = new Date()) {
    const position = Array.isArray(satPos) 
        ? satPos 
        : [satPos.x, satPos.y, satPos.z];
    
    const timeMs = time instanceof Date ? time.getTime() : time;
    
    return await groundTrackService.transformECIToSurface(
        position, planetNaifId, timeMs
    );
}