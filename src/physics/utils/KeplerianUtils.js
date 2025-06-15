// src/utils/KeplerianUtils.js

import { MathUtils } from './MathUtils.js';

// Basic vector operations for {x, y, z} objects
export const VectorOps = {
    add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z }),
    sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z }),
    scale: (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s }),
    dot: (v1, v2) => v1.x * v2.x + v1.y * v2.y + v1.z * v2.z,
    cross: (v1, v2) => ({
        x: v1.y * v2.z - v1.z * v2.y,
        y: v1.z * v2.x - v1.x * v2.z,
        z: v1.x * v2.y - v1.y * v2.x,
    }),
    magnitude: (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
    normalize: (v) => {
        const m = VectorOps.magnitude(v);
        return m > 0 ? VectorOps.scale(v, 1 / m) : { x: 0, y: 0, z: 0 };
    },
    clone: (v) => ({ x: v.x, y: v.y, z: v.z })
};

const KEPPLER_EPSILON = 1e-9; // Tolerance for Newton-Raphson iteration

/**
 * Converts state vectors (position, velocity) to Keplerian orbital elements.
 * This is the centralized, authoritative implementation for all Keplerian element calculations.
 * 
 * @param {PhysicsVector3|Array|{x,y,z}} r_vec - Position vector relative to the central body (km)
 * @param {PhysicsVector3|Array|{x,y,z}} v_vec - Velocity vector relative to the central body (km/s)
 * @param {number} mu - Gravitational parameter of the central body (km³/s²)
 * @param {number} epochJD - Julian Date of the state vectors (optional)
 * @param {number} bodyRadius - Central body radius for altitude calculations (km, optional)
 * @returns {object} Complete orbital elements with both classical and detailed parameters
 */
export function stateToKeplerian(r_vec, v_vec, mu, epochJD = 0, bodyRadius = 0) {
    // Convert PhysicsVector3/Array to object format if needed
    const r_obj = r_vec.isVector3 ? { x: r_vec.x, y: r_vec.y, z: r_vec.z } : r_vec;
    const v_obj = v_vec.isVector3 ? { x: v_vec.x, y: v_vec.y, z: v_vec.z } : v_vec;
    const r = VectorOps.magnitude(r_obj);
    const v_sq = VectorOps.dot(v_obj, v_obj);
    const energy = v_sq / 2 - mu / r;
    const a = -mu / (2 * energy);

    const h_vec = VectorOps.cross(r_obj, v_obj); // Specific angular momentum vector
    const h = VectorOps.magnitude(h_vec);

    // Defensive: skip degenerate orbits
    if (r < 1e-3 || h < 1e-6) {
        return null;
    }

    const n_vec = VectorOps.cross({ x: 0, y: 0, z: 1 }, h_vec); // Node line vector (points to ascending node)
    const n = VectorOps.magnitude(n_vec);

    // Eccentricity vector
    const e_vec_term1 = VectorOps.scale(VectorOps.cross(v_obj, h_vec), 1 / mu);
    const e_vec_term2 = VectorOps.scale(r_obj, 1 / r);
    const e_vec = VectorOps.sub(e_vec_term1, e_vec_term2);
    const e = VectorOps.magnitude(e_vec); // Eccentricity

    // Clamp helper for acos
    const safeAcos = MathUtils.safeAcos;

    const i = safeAcos(h_vec.z / h); // Inclination

    let lan; // Longitude of Ascending Node (RAAN)
    if (Math.abs(i) < KEPPLER_EPSILON || Math.abs(i - Math.PI) < KEPPLER_EPSILON) { // Equatorial orbit
        lan = 0; // Conventionally, or undefined. Set to 0.
    } else {
        lan = safeAcos(n_vec.x / n);
        if (n_vec.y < 0) lan = 2 * Math.PI - lan;
    }

    let arg_p; // Argument of Periapsis
    if (Math.abs(e) < KEPPLER_EPSILON) { // Circular orbit
        arg_p = 0; // Conventionally, true longitude used instead. For elements, set to 0.
    } else if (Math.abs(i) < KEPPLER_EPSILON || Math.abs(i - Math.PI) < KEPPLER_EPSILON) { // Equatorial non-circular
        // Use longitude of periapsis (varpi = LAN + arg_p), LAN is 0
        arg_p = Math.atan2(e_vec.y, e_vec.x);
        if (VectorOps.cross(r_obj, v_obj).z < 0) arg_p = 2 * Math.PI - arg_p; // Retrograde handling
    }
    else {
        arg_p = safeAcos(VectorOps.dot(n_vec, e_vec) / (n * e));
        if (e_vec.z < 0) arg_p = 2 * Math.PI - arg_p;
    }

    // True Anomaly (nu)
    let nu = safeAcos(VectorOps.dot(e_vec, r_obj) / (e * r));
    if (VectorOps.dot(r_obj, v_obj) < 0) nu = 2 * Math.PI - nu; // If object is moving towards central body

    if (Math.abs(e) < KEPPLER_EPSILON) { // Circular orbit
        if (Math.abs(i) < KEPPLER_EPSILON || Math.abs(i - Math.PI) < KEPPLER_EPSILON) { // Circular equatorial
            nu = Math.atan2(r_obj.y, r_obj.x); // True longitude
            if (VectorOps.cross(r_obj, v_obj).z < 0) nu = 2 * Math.PI - nu; // retrograde
        } else { // Circular inclined
            nu = Math.atan2(VectorOps.dot(r_obj, VectorOps.cross(h_vec, n_vec)) / h, VectorOps.dot(r_obj, n_vec) / n); // Argument of Latitude u = arg_p + nu. Here arg_p=0
        }
        if (nu < 0) nu += 2 * Math.PI;
    }

    // Mean Anomaly at epoch (M0)
    let E0; // Eccentric Anomaly at epoch
    if (e < 1.0) { // Elliptical
        E0 = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    } else { // Hyperbolic (not fully handled here, would need hyperbolic funcs)
        E0 = nu; // Approximation for now
    }
    const M0 = E0 - e * Math.sin(E0);

    let period = Infinity;
    if (e < 1.0 && a > 0) { // Elliptical
        period = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / mu);
    }

    // Calculate additional detailed parameters
    const specificOrbitalEnergy = energy;
    const specificAngularMomentum = h;

    // Calculate apsides
    let periapsisRadial = 0;
    let apoapsisRadial = 0;
    let periapsisAltitude = 0;
    let apoapsisAltitude = 0;

    if (e < 1.0 && a > 0) { // Elliptical orbit
        periapsisRadial = a * (1 - e);
        apoapsisRadial = a * (1 + e);
        if (bodyRadius > 0) {
            periapsisAltitude = periapsisRadial - bodyRadius;
            apoapsisAltitude = apoapsisRadial - bodyRadius;
        }
    }

    // Return comprehensive orbital elements compatible with all existing APIs
    return {
        // Classical Keplerian elements
        a,
        e,
        i,
        lan,
        arg_p,
        M0,
        epochJD,
        period,
        nu,

        // Additional standard names for compatibility
        semiMajorAxis: a,
        eccentricity: e,
        inclination: MathUtils.radToDeg(i), // Convert to degrees (standard format)
        longitudeOfAscendingNode: MathUtils.radToDeg(lan),
        argumentOfPeriapsis: MathUtils.radToDeg(arg_p),
        trueAnomaly: MathUtils.radToDeg(nu),

        // Detailed parameters
        specificOrbitalEnergy,
        specificAngularMomentum,
        periapsisRadial,
        apoapsisRadial,
        periapsisAltitude,
        apoapsisAltitude,

        // Legacy names for backward compatibility
        omega: MathUtils.radToDeg(lan), // Legacy RAAN name
        w: MathUtils.radToDeg(arg_p),   // Legacy argument of periapsis name
        h: h // Specific angular momentum magnitude
    };
}

/**
 * Solves Kepler's equation M = E - e*sin(E) for E using Newton-Raphson.
 * @param {number} M - Mean anomaly (radians).
 * @param {number} e - Eccentricity.
 * @returns {number} Eccentric anomaly E (radians).
 */
export function solveKeplerEquation(M, e) {
    let E = M; // Initial guess
    if (e > 0.8) E = Math.PI; // Better initial guess for high eccentricity

    let dE = Infinity;
    let iterations = 0;
    const maxIterations = 100;

    while (Math.abs(dE) > KEPPLER_EPSILON && iterations < maxIterations) {
        dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= dE;
        iterations++;
    }
    return E;
}
