/***********************************************************************
 *  GeodeticUtils.js — Geodetic Coordinate Conversions & Orbital Math  *
 *                                                                     *
 *  RESPONSIBILITIES:                                                  *
 *  • Geodetic coordinate conversions (lat/lon/alt ↔ cartesian)       *
 *  • Ellipsoidal and spherical coordinate mathematics                 *
 *  • Orbital elements to state vector conversions                    *
 *  • Low-level coordinate math for CoordinateTransforms.js           *
 *                                                                     *
 *  COORDINATE SYSTEMS:                                                *
 *  • ECEF: Earth-Centered Earth-Fixed (rotating with planet)         *
 *  • ECI: Earth-Centered Inertial (non-rotating equatorial)          *
 *  • Geodetic: lat/lon/altitude on ellipsoid surface                  *
 *  • Cartesian: X/Y/Z coordinates in km                               *
 *                                                                     *
 *  USE THIS FOR:                                                      *
 *  • Converting between geodetic and cartesian coordinates           *
 *  • Ellipsoid mathematics for non-spherical planets                 *
 *  • Orbital element to state vector transformations                 *
 *                                                                     *
 *  USE CoordinateTransforms.js FOR:                                   *
 *  • Multi-planet coordinate system management                        *
 *  • Quaternion-based transformations                                 *
 *  • Satellite creation from lat/lon or orbital elements             *
 *  • Reference frame transformations with physics engine integration *
 ***********************************************************************/

import { PhysicsVector3 } from './PhysicsVector3.js';
import { MathUtils } from './MathUtils.js';

/*─────────────────────────────────────────────────────────────────────┐
│  0.  GLOBAL AXES & EARTH TILT                                       │
└─────────────────────────────────────────────────────────────────────*/



/*─────────────────────────────────────────────────────────────────────┐
│  1.  CLASS                                                          │
└─────────────────────────────────────────────────────────────────────*/
export class GeodeticUtils {



    /*───────────────────────── 1.1  Newtonian helpers ───────────────────*/
    static calculateAcceleration(force, mass) { return force / mass; }

    /*───────────────────────── 1.2  Lat/Lon ↔ ECEF  ─────────────────────*/

    /**
     * Convert lat/lon/altitude to cartesian coordinates (spherical approximation)
     * @param {number} latDeg - Latitude in degrees
     * @param {number} lonDeg - Longitude in degrees  
     * @param {number} alt - Altitude in km (default: 0)
     * @param {number} radius - Planet radius in km
     * @param {PhysicsVector3} out - Output vector (optional)
     * @returns {PhysicsVector3} Cartesian position
     */
    static latLonAltToECEF(latDeg, lonDeg, alt = 0, radius, out = new PhysicsVector3()) {
        const φ = MathUtils.degToRad(latDeg);
        const λ = MathUtils.degToRad(lonDeg);
        const r = radius + alt;
        return out.set(
            r * Math.cos(φ) * Math.cos(λ),   // X
            r * Math.cos(φ) * Math.sin(λ),   // Y
            r * Math.sin(φ)                  // Z
        );
    }

    /**
     * Convert lat/lon/altitude to cartesian coordinates using proper ellipsoid math
     * @param {number} latDeg - Latitude in degrees
     * @param {number} lonDeg - Longitude in degrees
     * @param {number} alt - Altitude in km above ellipsoid
     * @param {number} equatorialRadius - Equatorial radius in km (semi-major axis)
     * @param {number} polarRadius - Polar radius in km (semi-minor axis, optional)
     * @param {PhysicsVector3} out - Output vector (optional)
     * @returns {PhysicsVector3} Cartesian position accounting for ellipsoid shape
     */
    static latLonAltToEllipsoid(latDeg, lonDeg, alt, equatorialRadius, polarRadius = null, out = new PhysicsVector3()) {
        const lat = MathUtils.degToRad(latDeg);
        const lon = MathUtils.degToRad(lonDeg);

        const a = equatorialRadius;
        const b = polarRadius || a; // Default to sphere if no polar radius

        // Calculate ellipticity and eccentricity  
        const f = (a - b) / a; // Flattening
        const e2 = f * (2 - f); // First eccentricity squared

        // Prime vertical radius of curvature
        const sinLat = Math.sin(lat);
        const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);

        // Ellipsoid cartesian coordinates
        const X = (N + alt) * Math.cos(lat) * Math.cos(lon);
        const Y = (N + alt) * Math.cos(lat) * Math.sin(lon);
        const Z = ((1 - e2) * N + alt) * Math.sin(lat);

        return out.set(X, Y, Z);
    }

    /**
     * Convert cartesian coordinates to geodetic lat/lon/altitude using ellipsoid math
     * @param {number} x - X coordinate in km
     * @param {number} y - Y coordinate in km  
     * @param {number} z - Z coordinate in km
     * @param {number} a - Equatorial radius in km (semi-major axis)
     * @param {number} b - Polar radius in km (semi-minor axis, optional)
     * @returns {Object} {latitude, longitude, altitude} in degrees and km
     */
    static ecefToGeodetic(x, y, z, a, b = null) {
        const bActual = b || a; // Default to sphere if no polar radius
        const e2 = 1 - (bActual * bActual) / (a * a);

        // Longitude is straightforward
        const longitude = Math.atan2(y, x);

        // Latitude requires iteration for accuracy
        const p = Math.sqrt(x * x + y * y);
        let lat = Math.atan2(z, p);
        let N, altitude;

        // Iterate to converge on latitude (Bowring's method)
        for (let i = 0; i < 5; i++) {
            const sinLat = Math.sin(lat);
            N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
            altitude = p / Math.cos(lat) - N;
            lat = Math.atan2(z, p * (1 - e2 * N / (N + altitude)));
        }

        return {
            latitude: MathUtils.radToDeg(lat),
            longitude: MathUtils.radToDeg(longitude),
            altitude: altitude
        };
    }

    /**
     * Convert cartesian coordinates to geodetic lat/lon (spherical approximation)
     * Simple fallback method for when full ellipsoid math isn't needed
     * @param {number} x - X coordinate in km
     * @param {number} y - Y coordinate in km  
     * @param {number} z - Z coordinate in km
     * @returns {Object} {latitude, longitude} in degrees
     */
    static cartesianToGeodetic(x, y, z) {
        const r = Math.hypot(x, y, z);
        return {
            latitude: MathUtils.radToDeg(Math.asin(z / r)),
            longitude: MathUtils.radToDeg(Math.atan2(y, x))
        };
    }

    /**
     * Simple spherical coordinate conversion from cartesian to lat/lon/alt
     * Used as fallback when planet quaternion data is unavailable
     * @param {Array|Object} position - [x, y, z] or {x, y, z} position in km
     * @param {number} planetRadius - Planet radius in km
     * @returns {Object} {lat, lon, alt} in degrees and km
     */
    static cartesianToSphericalLatLonAlt(position, planetRadius) {
        const pos = Array.isArray(position) ? position : [position.x, position.y, position.z];
        const [x, y, z] = pos;
        
        const r = Math.sqrt(x * x + y * y + z * z);
        const lat = Math.asin(z / r) * (180 / Math.PI);
        const lon = Math.atan2(y, x) * (180 / Math.PI);
        const alt = r - planetRadius;
        
        return { lat, lon, alt };
    }

    /**
     * Calculate local ENU (East-North-Up) basis vectors at a given lat/lon
     * @param {number} latDeg - Latitude in degrees
     * @param {number} lonDeg - Longitude in degrees
     * @returns {Object} {east: [x,y,z], north: [x,y,z], up: [x,y,z]} unit vectors
     */
    static calculateENUBasisVectors(latDeg, lonDeg) {
        const latRad = MathUtils.degToRad(latDeg);
        const lonRad = MathUtils.degToRad(lonDeg);
        
        const cosLat = Math.cos(latRad);
        const sinLat = Math.sin(latRad);
        const cosLon = Math.cos(lonRad);
        const sinLon = Math.sin(lonRad);

        return {
            // East vector (tangent to longitude lines)
            east: [-sinLon, cosLon, 0],
            
            // North vector (tangent to latitude lines)
            north: [-sinLat * cosLon, -sinLat * sinLon, cosLat],
            
            // Up vector (radial outward)
            up: [cosLat * cosLon, cosLat * sinLon, sinLat]
        };
    }

    /**
     * Convert velocity from ENU (East-North-Up) frame to ECEF cartesian
     * @param {number} latDeg - Latitude in degrees
     * @param {number} lonDeg - Longitude in degrees
     * @param {number} velEast - East velocity component in km/s
     * @param {number} velNorth - North velocity component in km/s
     * @param {number} velUp - Up velocity component in km/s
     * @returns {Array} [vx, vy, vz] velocity in ECEF frame (km/s)
     */
    static enuVelocityToECEF(latDeg, lonDeg, velEast, velNorth, velUp) {
        const { east, north, up } = GeodeticUtils.calculateENUBasisVectors(latDeg, lonDeg);
        
        return [
            velEast * east[0] + velNorth * north[0] + velUp * up[0],
            velEast * east[1] + velNorth * north[1] + velUp * up[1],
            velEast * east[2] + velNorth * north[2] + velUp * up[2]
        ];
    }

    /**
     * Basic lat/lon/alt to cartesian conversion (hardcoded for Earth radius)
     * Convenience method for simple Earth-based calculations
     * @param {number} latDeg - Latitude in degrees
     * @param {number} lonDeg - Longitude in degrees
     * @param {number} altKm - Altitude in km (default: 0)
     * @returns {Array} [x, y, z] position in km
     */
    static latLonAltToCartesianEarth(latDeg, lonDeg, altKm = 0) {
        const earthRadius = 6371; // km
        const latRad = latDeg * Math.PI / 180;
        const lonRad = lonDeg * Math.PI / 180;
        const r = earthRadius + altKm;
        
        return [
            r * Math.cos(latRad) * Math.cos(lonRad),
            r * Math.cos(latRad) * Math.sin(lonRad),  
            r * Math.sin(latRad)
        ];
    }

    /*───────────────────────── 2.  LAUNCH CONVERTERS (REMOVED - unused) ────────────────────*/


    /*───────────────────────── 3.  ORBITAL ELEMENTS  ─────────────────────*/
    static calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis, eccentricity, inclination,
        argumentOfPeriapsis, raan, trueAnomaly,
        mu
    ) {
        const a = semiMajorAxis;
        const e = eccentricity;
        const i = MathUtils.degToRad(inclination);
        const ω = MathUtils.degToRad(argumentOfPeriapsis);
        const Ω = MathUtils.degToRad(raan);
        const f = MathUtils.degToRad(trueAnomaly);

        const p = a * (1 - e * e);
        const r = p / (1 + e * Math.cos(f));

        const xP = r * Math.cos(f);
        const yP = r * Math.sin(f);

        const h = Math.sqrt(mu * p);
        const vxP = -mu / h * Math.sin(f);
        const vyP = mu / h * (e + Math.cos(f));

        const cosΩ = Math.cos(Ω), sinΩ = Math.sin(Ω);
        const cosi = Math.cos(i), sini = Math.sin(i);
        const cosω = Math.cos(ω), sinω = Math.sin(ω);

        const R11 = cosΩ * cosω - sinΩ * sinω * cosi;
        const R12 = -cosΩ * sinω - sinΩ * cosω * cosi;
        const R21 = sinΩ * cosω + cosΩ * sinω * cosi;
        const R22 = -sinΩ * sinω + cosΩ * cosω * cosi;
        const R31 = sinω * sini;
        const R32 = cosω * sini;

        // equatorial ECI coordinates (no axial tilt applied)
        const positionECI = new PhysicsVector3(
            R11 * xP + R12 * yP,
            R21 * xP + R22 * yP,
            R31 * xP + R32 * yP
        );

        // equatorial ECI velocity (no axial tilt applied)
        const velocityECI = new PhysicsVector3(
            R11 * vxP + R12 * vyP,
            R21 * vxP + R22 * vyP,
            R31 * vxP + R32 * vyP
        );

        return { positionECI, velocityECI };
    }
}
