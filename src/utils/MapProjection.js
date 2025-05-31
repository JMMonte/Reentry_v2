import { SatelliteCoordinates } from '../physics/utils/SatelliteCoordinates.js';

/**
 * Project a world-space position to planet surface coordinates using generic transformations.
 * Works for any celestial body, not just Earth.
 * @param {THREE.Vector3} worldPos - Position in world/scene coordinates relative to planet center
 * @param {Object} planet - Planet object with quaternion and physical properties
 * @param {Date} time - Time for transformation
 * @returns {{latitude: number, longitude: number, altitude: number}} Geodetic coords (deg, deg, km)
 */
export function projectToGeodetic(worldPos, planet, time = new Date()) {
    if (!planet || !worldPos) {
        return { latitude: 0, longitude: 0, altitude: 0 };
    }

    // Convert from world position to planet-centric coordinates
    const position = [worldPos.x, worldPos.y, worldPos.z];
    const velocity = [0, 0, 0]; // Not needed for position-only transform
    
    // Transform from planet-centered inertial to planet-fixed frame
    const result = SatelliteCoordinates.transformCoordinates(
        position, velocity, 'PCI', 'PF', planet, time
    );
    
    // Convert planet-fixed cartesian to geographic coordinates
    const geo = SatelliteCoordinates.planetFixedToLatLonAlt(result.position, planet);
    
    return {
        latitude: geo[0],
        longitude: geo[1],
        altitude: geo[2]
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
 * @param {THREE.Vector3} worldPos - Position in world coordinates relative to planet center
 * @param {Object} planet - Planet object with quaternion and physical properties
 * @param {number} width - Canvas width in pixels
 * @param {number} height - Canvas height in pixels
 * @param {Date} time - Time for projection
 * @returns {{x: number, y: number, latitude: number, longitude: number, altitude: number}}
 */
export function projectWorldPosToCanvas(worldPos, planet, width, height, time = new Date()) {
    const geo = projectToGeodetic(worldPos, planet, time);
    const { x, y } = latLonToCanvas(geo.latitude, geo.longitude, width, height);
    return { x, y, ...geo };
}

/**
 * Project a satellite's position to planet-fixed lat/lon.
 * This is now a wrapper around SatelliteCoordinates for consistency.
 * @param {THREE.Vector3} satPos - Satellite position in planet-centric inertial (km)
 * @param {Object} planet - Planet object with quaternion and physical properties
 * @param {Date} time - Time for transformation
 * @returns {{lat: number, lon: number, alt: number}}
 */
export function projectToPlanetLatLon(satPos, planet, time = new Date()) {
    const position = [satPos.x, satPos.y, satPos.z];
    const velocity = [0, 0, 0];
    
    // Transform from planet-centered inertial to planet-fixed
    const result = SatelliteCoordinates.transformCoordinates(
        position, velocity, 'PCI', 'PF', planet, time
    );
    
    // Convert to lat/lon/alt
    const geo = SatelliteCoordinates.planetFixedToLatLonAlt(result.position, planet);
    
    return {
        lat: geo[0],
        lon: geo[1],
        alt: geo[2]
    };
}