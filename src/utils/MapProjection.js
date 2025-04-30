import { PhysicsUtils } from './PhysicsUtils.js';
import * as THREE from 'three';
import { Constants } from './Constants.js';

const tempVec = new THREE.Vector3();

/**
 * Project a world-space position (scaled Equatorial ECI units, 1 unit = 10 km)
 * onto a planet's surface and return geodetic coordinates.
 * Uses a spherical Earth model and applies Earth rotation via GMST.
 * @param {THREE.Vector3} eciWorldPos - Scaled Equatorial ECI position (units) relative to planet center.
 * @param {Planet} planet - Planet instance (radius in same units as scaled ECI*10).
 * @param {number} epochMillis - Time for projection (ms since UTC epoch).
 * @returns {{latitude: number, longitude: number, altitude: number}} Geodetic coords (deg, deg, km).
 */
export function projectToGeodetic(eciWorldPos, planet, epochMillis) {
    if (!planet || epochMillis == null) {
        return { latitude: 0, longitude: 0, altitude: 0 };
    }
    // 1. Convert simulation units (1 unit = 10 km) to kilometers
    const posKm = tempVec.copy(eciWorldPos).multiplyScalar(10);
    // 2. Ecliptic ECI → Equatorial ECI
    const equatorialECI = PhysicsUtils.eciEclipticToEquatorial(posKm);
    // 3. Equatorial ECI → ECEF (in km) via GMST rotation
    const gmst = PhysicsUtils.calculateGMST(epochMillis);
    const ecefKm = PhysicsUtils.eciToEcef(equatorialECI, gmst, new THREE.Vector3());
    // 4. Convert to meters for ellipsoidal geodetic calculation
    const ecefM = ecefKm.clone().multiplyScalar(1000);
    const geodetic = PhysicsUtils.ecefToGeodetic(ecefM.x, ecefM.y, ecefM.z);
    // Altitude returned in meters → convert to kilometers
    const altitudeKm = geodetic.altitude * Constants.metersToKm;
    return {
        latitude: geodetic.latitude,
        longitude: geodetic.longitude,
        altitude: altitudeKm
    };
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
    // Longitude: -180 to +180 -> 0 to width
    // Latitude: +90 to -90 -> 0 to height
    const x = ((lon + 180) % 360 / 360) * width; // Ensure positive lon wrap
    const y = ((90 - lat) / 180) * height;
    return { x, y };
}

/**
 * Project a 3D world-space position (scaled Ecliptic ECI) to canvas pixel coordinates.
 * @param {THREE.Vector3} eciWorldPos - Scaled Equatorial ECI position relative to planet center.
 * @param {Planet} planet - Planet instance for geodetic reference.
 * @param {number} width - Canvas width in pixels.
 * @param {number} height - Canvas height in pixels.
 * @param {number} epochMillis - Time for projection (milliseconds since UTC epoch).
 * @returns {{x: number, y: number, latitude: number, longitude: number, altitude: number}}
 */
export function projectWorldPosToCanvas(eciWorldPos, planet, width, height, epochMillis) {
    const geo = projectToGeodetic(eciWorldPos, planet, epochMillis);
    const { x, y } = latLonToCanvas(geo.latitude, geo.longitude, width, height);
    return { x, y, latitude: geo.latitude, longitude: geo.longitude, altitude: geo.altitude };
}

