import { PhysicsUtils } from './PhysicsUtils.js';

/**
 * Project a world-space position onto a planet's surface and return geodetic coordinates.
 * @param {THREE.Vector3} worldPos - Position in scene/world coordinates.
 * @param {Planet} planet - Planet instance whose surface defines the reference frame.
 * @returns {{latitude: number, longitude: number, altitude: number}} Geodetic coords: degrees lat, lon and altitude above surface.
 */
export function projectToGeodetic(worldPos, planet) {
    if (!planet) return { latitude: 0, longitude: 0, altitude: 0 };
    // Convert world position to planet local coordinates
    const local = worldPos.clone();
    // Assume planetMesh has parent groups for orbit/tilt/rotation
    const mesh = planet.getMesh();
    if (mesh && mesh.parent) {
        mesh.parent.worldToLocal(local);
    }
    // Compute geodetic lat/lon on planet-centered coordinates
    const { latitude, longitude } = PhysicsUtils.cartesianToGeodetic(
        local.x, local.y, local.z
    );
    // Altitude above surface in same units as radius
    const radius = planet.radius;
    const altitude = Math.sqrt(local.x * local.x + local.y * local.y + local.z * local.z) - radius;
    return { latitude, longitude, altitude };
}

/**
 * Convert geodetic latitude and longitude to canvas coordinates (equirectangular projection).
 * @param {number} lat - Latitude in degrees.
 * @param {number} lon - Longitude in degrees.
 * @param {number} width - Canvas width in pixels.
 * @param {number} height - Canvas height in pixels.
 * @returns {{x: number, y: number}} Canvas pixel coordinates.
 */
export function latLonToCanvas(lat, lon, width, height) {
    const x = ((lon + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    return { x, y };
}

/**
 * Project a 3D world-space position to canvas pixel coordinates, including geodetic data.
 * @param {THREE.Vector3} worldPos - Position in scene/world coordinates.
 * @param {Planet} planet - Planet instance for geodetic reference.
 * @param {number} width - Canvas width in pixels.
 * @param {number} height - Canvas height in pixels.
 * @returns {{x: number, y: number, latitude: number, longitude: number, altitude: number}}
 */
export function projectWorldPosToCanvas(worldPos, planet, width, height) {
    const geo = projectToGeodetic(worldPos, planet);
    const { x, y } = latLonToCanvas(
        geo.latitude,
        geo.longitude,
        width,
        height
    );
    return {
        x,
        y,
        latitude: geo.latitude,
        longitude: geo.longitude,
        altitude: geo.altitude
    };
} 