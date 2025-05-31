// src/utils/KeplerianUtils.js

import { PhysicsConstants } from '../physics/core/PhysicsConstants.js';
import * as THREE from 'three';

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
 * @param {THREE.Vector3|{x,y,z}} r_vec - Position vector relative to the central body (km)
 * @param {THREE.Vector3|{x,y,z}} v_vec - Velocity vector relative to the central body (km/s)
 * @param {number} mu - Gravitational parameter of the central body (km³/s²)
 * @param {number} epochJD - Julian Date of the state vectors (optional)
 * @param {number} bodyRadius - Central body radius for altitude calculations (km, optional)
 * @returns {object} Complete orbital elements with both classical and detailed parameters
 */
export function stateToKeplerian(r_vec, v_vec, mu, epochJD = 0, bodyRadius = 0) {
    // Convert THREE.Vector3 to object format if needed
    const r_obj = r_vec.isVector3 ? { x: r_vec.x, y: r_vec.y, z: r_vec.z } : r_vec;
    const v_obj = v_vec.isVector3 ? { x: v_vec.x, y: v_vec.y, z: v_vec.z } : v_vec;
    const r = VectorOps.magnitude(r_obj);
    const v_sq = VectorOps.dot(v_obj, v_obj);
    const energy = v_sq / 2 - mu / r;
    const a = -mu / (2 * energy);
    // Debug log
    // console.log('[KeplerianDebug] r:', r, 'v_sq:', v_sq, 'energy:', energy, 'a:', a, 'mu:', mu);

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
    const safeAcos = (x) => Math.acos(Math.max(-1, Math.min(1, x)));

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
        inclination: THREE.MathUtils.radToDeg(i), // Convert to degrees for PhysicsUtils compatibility
        longitudeOfAscendingNode: THREE.MathUtils.radToDeg(lan),
        argumentOfPeriapsis: THREE.MathUtils.radToDeg(arg_p),
        trueAnomaly: THREE.MathUtils.radToDeg(nu),
        
        // Detailed parameters
        specificOrbitalEnergy,
        specificAngularMomentum,
        periapsisRadial,
        apoapsisRadial,
        periapsisAltitude,
        apoapsisAltitude,
        
        // Legacy names for backward compatibility
        omega: THREE.MathUtils.radToDeg(lan), // For PhysicsUtils compatibility
        w: THREE.MathUtils.radToDeg(arg_p),   // For PhysicsUtils compatibility
        h: h // For PhysicsUtils compatibility
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

/**
 * Converts Keplerian elements to state vectors (position, velocity) at a given Julian Date.
 * @param {object} elements - Keplerian elements { a, e, i, lan, arg_p, M0, epochJD }.
 * @param {number} mu - Gravitational parameter of the central body.
 * @param {number} jd - Julian Date for which to calculate the state.
 * @returns {{position: {x,y,z}, velocity: {x,y,z}}} State vectors relative to central body.
 */
export function keplerianToStateVectors(elements, mu, jd) {
    const { a, e, i, lan, arg_p, M0, epochJD } = elements;

    if (a === Infinity || mu <= 0) { // Parabolic or invalid
        return { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }; // Simplified
    }

    const n = Math.sqrt(mu / Math.abs(Math.pow(a, 3))); // Mean motion
    const M = M0 + n * (jd - epochJD) * PhysicsConstants.TIME.SECONDS_IN_DAY; // Mean anomaly at time jd (AE times are in days)

    // Eccentric Anomaly E
    // For hyperbolic (e > 1), would need hyperbolic Kepler's equation solver.
    // For elliptical (e < 1):
    const E = solveKeplerEquation(M, e);

    // True Anomaly nu
    const sinNu = (Math.sqrt(1 - e * e) * Math.sin(E)) / (1 - e * Math.cos(E));
    const cosNu = (Math.cos(E) - e) / (1 - e * Math.cos(E));
    const nu = Math.atan2(sinNu, cosNu);

    // Distance r
    const r_dist = a * (1 - e * Math.cos(E));

    // Position in orbital plane (perifocal frame: x towards periapsis, y 90 deg in direction of motion)
    const pos_pq = {
        x: r_dist * Math.cos(nu),
        y: r_dist * Math.sin(nu),
        z: 0
    };

    // Velocity in orbital plane
    const vel_pq_factor = Math.sqrt(mu * a) / r_dist;
    const vel_pq = {
        x: vel_pq_factor * -Math.sin(E),
        y: vel_pq_factor * Math.sqrt(1 - e * e) * Math.cos(E),
        z: 0
    };

    // Transformation from orbital plane to inertial frame (e.g., Ecliptic J2000)
    // Rotation matrices (or quaternions for more robust solution)
    // R = Rz(-lan) * Rx(-i) * Rz(-arg_p)
    // Px = cos(lan)cos(arg_p) - sin(lan)sin(arg_p)cos(i)
    // Py = -cos(lan)sin(arg_p) - sin(lan)cos(arg_p)cos(i)
    // Qx = sin(lan)cos(arg_p) + cos(lan)sin(arg_p)cos(i)
    // Qy = -sin(lan)sin(arg_p) + cos(lan)cos(arg_p)cos(i)
    // Wz = sin(arg_p)sin(i) -- not needed here as W is Z-axis of orbital frame
    // More simply:
    const cos_lan = Math.cos(lan); const sin_lan = Math.sin(lan);
    const cos_i = Math.cos(i); const sin_i = Math.sin(i);
    const cos_ap = Math.cos(arg_p); const sin_ap = Math.sin(arg_p);

    // Rotation from perifocal (PQW) to inertial (XYZ)
    // X = Px * x_pq + Qx * y_pq
    // Y = Py * x_pq + Qy * y_pq
    // Z = Pz * x_pq + Qz * y_pq (where Pz = sin(arg_p)*sin(i), Qz = cos(arg_p)*sin(i))

    const x = pos_pq.x * (cos_lan * cos_ap - sin_lan * sin_ap * cos_i) +
        pos_pq.y * (-cos_lan * sin_ap - sin_lan * cos_ap * cos_i);
    const y = pos_pq.x * (sin_lan * cos_ap + cos_lan * sin_ap * cos_i) +
        pos_pq.y * (-sin_lan * sin_ap + cos_lan * cos_ap * cos_i);
    const z = pos_pq.x * (sin_ap * sin_i) +
        pos_pq.y * (cos_ap * sin_i);

    const vx = vel_pq.x * (cos_lan * cos_ap - sin_lan * sin_ap * cos_i) +
        vel_pq.y * (-cos_lan * sin_ap - sin_lan * cos_ap * cos_i);
    const vy = vel_pq.x * (sin_lan * cos_ap + cos_lan * sin_ap * cos_i) +
        vel_pq.y * (-sin_lan * sin_ap + cos_lan * cos_ap * cos_i);
    const vz = vel_pq.x * (sin_ap * sin_i) +
        vel_pq.y * (cos_ap * sin_i);

    return { position: { x, y, z }, velocity: { x: vx, y: vy, z: vz } };
}


/**
 * Calculates position in the orbital frame for a given true anomaly.
 * Used by OrbitManager to sample points for drawing the orbit path.
 * @param {object} elements - Keplerian elements { a, e, i, lan, arg_p }.
 * @param {number} mu - Gravitational parameter (for context, not strictly needed if a & e known for ellipse).
 * @param {number} nu_rad - True anomaly (radians).
 * @returns {{x,y,z}} Position vector relative to central body in inertial frame.
 */
export function getPositionAtTrueAnomaly(elements, mu, nu_rad) {
    const { a, e, i, lan, arg_p } = elements;

    if (a === Infinity) return { x: 0, y: 0, z: 0 }; // Parabolic not handled for path generation here

    // Distance from focus
    const r_dist = a * (1 - e * e) / (1 + e * Math.cos(nu_rad));

    // Position in perifocal frame
    const pos_pq = {
        x: r_dist * Math.cos(nu_rad),
        y: r_dist * Math.sin(nu_rad),
        z: 0
    };

    // Transform to inertial frame (same rotation logic as in keplerianToStateVectors)
    const cos_lan = Math.cos(lan); const sin_lan = Math.sin(lan);
    const cos_i = Math.cos(i); const sin_i = Math.sin(i);
    const cos_ap = Math.cos(arg_p); const sin_ap = Math.sin(arg_p);

    const x = pos_pq.x * (cos_lan * cos_ap - sin_lan * sin_ap * cos_i) +
        pos_pq.y * (-cos_lan * sin_ap - sin_lan * cos_ap * cos_i);
    const y = pos_pq.x * (sin_lan * cos_ap + cos_lan * sin_ap * cos_i) +
        pos_pq.y * (-sin_lan * sin_ap + cos_lan * cos_ap * cos_i);
    const z = pos_pq.x * (sin_ap * sin_i) +
        pos_pq.y * (cos_ap * sin_i);

    return { x, y, z };
}