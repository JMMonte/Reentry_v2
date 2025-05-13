// OrbitIntegrator.js

import * as THREE from 'three';
import { Constants } from './Constants.js';
import { PhysicsUtils } from './PhysicsUtils.js';

/* ───────────────────────────── Utilities ────────────────────────────── */

/** Earth rotation rate (rad s⁻¹) — evaluated once */
const OMEGA_EARTH = 2 * Math.PI / Constants.siderialDay;

/** Cached scalars to skip repeat mults (G in km^3/kg/s^2) */
const G = Constants.G;

/* ───────────────────── Acceleration components ─────────────────────── */

/**
 * Net gravitational acceleration (km s⁻²) on a satellite.
 * @param {number[]} p – position [x,y,z] in kilometers
 * @param {{position:{x,y,z},mass:number}[]} bodies
 * @param {number} perturbationScale – weighting for 3rd-body terms
 */
export function computeAccel(p, bodies, perturbationScale = 1) {
    let ax = 0, ay = 0, az = 0;
    const [px, py, pz] = p;

    // Body 0 is assumed central (Earth)
    for (let i = 0, n = bodies.length; i < n; ++i) {
        const b = bodies[i];
        const dx = b.position.x - px;
        const dy = b.position.y - py;
        const dz = b.position.z - pz;
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 === 0) continue;

        const r = Math.sqrt(r2);
        const μ = G * b.mass;
        const inv = μ / (r2 * r);            // μ / r³

        if (i === 0) {
            ax += inv * dx; ay += inv * dy; az += inv * dz;        // Keplerian part
        } else {
            // differential acceleration (satellite − Earth-at-origin)
            const r02 = b.position.x * b.position.x +
                b.position.y * b.position.y +
                b.position.z * b.position.z;
            if (r02 === 0) continue;
            const r0 = Math.sqrt(r02);
            const invRef = μ / (r02 * r0);
            const scale = perturbationScale;  // micro-optimise look-up outside loop
            ax += scale * (inv * dx - invRef * b.position.x);
            ay += scale * (inv * dy - invRef * b.position.y);
            az += scale * (inv * dz - invRef * b.position.z);
        }
    }
    return [ax, ay, az];
}

/**
 * Atmospheric drag acceleration (km s⁻²).
 * Uses the 1976 US Std Atmosphere exponential model.
 * @param {number[]}  p  – ECI kilometers
 * @param {number[]}  v  – ECI km s⁻¹
 * @param {number=}   Bc – Ballistic coefficient (kg km⁻²)
 */
export function computeDragAcceleration(
    p, v,
    Bc = Constants.ballisticCoefficient,
) {
    const [x, y, z] = p;
    const r = Math.sqrt(x * x + y * y + z * z);
    const alt = r - Constants.earthRadius;

    if (alt <= 0 || alt > Constants.atmosphereCutoffAltitude) return [0, 0, 0];

    const rho = Constants.atmosphereSeaLevelDensity *
        Math.exp(-alt / Constants.atmosphereScaleHeight);

    // rigid-body atmosphere rotation
    const vAtm = [-OMEGA_EARTH * y, OMEGA_EARTH * x, 0];
    const vr = [v[0] - vAtm[0], v[1] - vAtm[1], v[2] - vAtm[2]];
    const vrMag = Math.hypot(...vr);
    if (vrMag === 0) return [0, 0, 0];

    const aMag = 0.5 * rho * vrMag * vrMag / Bc;
    const f = -aMag / vrMag;
    return [f * vr[0], f * vr[1], f * vr[2]];
}

/* ───────────────────── Adaptive RK45 Integrator ─────────────────────── */

/**
 * Dormand-Prince RK45 with simple PI step-control.
 * Returns {pos:[x,y,z], vel:[vx,vy,vz]} @ t = T (s), all in kilometers and km/s.
 */
export function adaptiveIntegrate(
    pos0, vel0,
    T,
    bodies,
    perturbationScale = 1,
    absTol = 1e-6,
    relTol = 1e-6,
    sensitivityScale = 1,
) {
    const maxStep = Constants.timeStep ?? 0.1;
    let dt = Math.min(maxStep, T);
    let t = 0;

    // working copies (mutated in-place)
    const p = pos0.slice();
    const v = vel0.slice();

    // scratch vectors to keep GC at bay
    const a1 = [0, 0, 0], a2 = [0, 0, 0];
    const p1 = [0, 0, 0], v1 = [0, 0, 0];
    const errP = [0, 0, 0], errV = [0, 0, 0];

    while (t < T) {
        if (t + dt > T) dt = T - t;

        // stage 1
        const g1 = computeAccel(p, bodies, perturbationScale);
        const d1 = computeDragAcceleration(p, v);
        a1[0] = g1[0] + d1[0];
        a1[1] = g1[1] + d1[1];
        a1[2] = g1[2] + d1[2];

        // predicted state
        p1[0] = p[0] + v[0] * dt + 0.5 * a1[0] * dt * dt;
        p1[1] = p[1] + v[1] * dt + 0.5 * a1[1] * dt * dt;
        p1[2] = p[2] + v[2] * dt + 0.5 * a1[2] * dt * dt;

        const g2 = computeAccel(p1, bodies, perturbationScale);
        // drag evaluated at predicted state
        v1[0] = v[0] + 0.5 * (a1[0] + g2[0]) * dt;
        v1[1] = v[1] + 0.5 * (a1[1] + g2[1]) * dt;
        v1[2] = v[2] + 0.5 * (a1[2] + g2[2]) * dt;

        const d2 = computeDragAcceleration(p1, v1);
        a2[0] = g2[0] + d2[0];
        a2[1] = g2[1] + d2[1];
        a2[2] = g2[2] + d2[2];

        /* local error estimate */
        const accMag = Math.hypot(...a1);
        const dynTol = absTol / (1 + Math.log1p(sensitivityScale * accMag));
        let errMax = 0;

        for (let j = 0; j < 3; ++j) {
            const scP = dynTol + relTol * Math.max(Math.abs(p[j]), Math.abs(p1[j]));
            const scV = dynTol + relTol * Math.max(Math.abs(v[j]), Math.abs(v1[j]));
            // reuse errP / errV as temp to avoid extra alloc
            errP[j] = p1[j] - (p[j] + v[j] * dt + 0.5 * a2[j] * dt * dt);
            errV[j] = v1[j] - (v[j] + a2[j] * dt);
            errMax = Math.max(errMax, Math.abs(errP[j]) / scP, Math.abs(errV[j]) / scV);
        }

        // PI controller
        if (errMax <= 1) {
            // accept step
            t += dt;
            for (let j = 0; j < 3; ++j) {
                p[j] = p1[j];
                v[j] = v1[j];
            }
            dt *= Math.min(5, 0.9 * Math.pow(1 / errMax, 0.2));
        } else {
            dt *= Math.max(0.2, 0.9 * Math.pow(1 / errMax, 0.2));
        }
    }

    return { pos: p, vel: v };
}

/* ─────────────────────── High-level propagation ─────────────────────── */

/**
 * Generate an orbit polyline of `numPoints` nodes and call `onProgress`.
 * Each node: {position:[km,km,km], timeOffset:s}.
 * If `allowFullEllipse` is false, stops at atmospheric interface.
 */
export async function propagateOrbit(
    pos0, vel0,
    bodies,
    period,
    numPoints,
    perturbationScale = 1,
    onProgress,
    allowFullEllipse = false,
) {
    const dt = period / numPoints;
    const points = [];
    const batchSz = Math.max(1, Math.floor(numPoints / 20));

    let pos = pos0.slice();
    let vel = vel0.slice();

    const oe = PhysicsUtils.calculateDetailedOrbitalElements(
        new THREE.Vector3(...pos0),
        new THREE.Vector3(...vel0),
        Constants.earthGravitationalParameter,
    );
    const hyperbolic = oe && oe.eccentricity >= 1;
    const sensScale = Constants.sensitivityScale ?? 1;

    for (let i = 0; i < numPoints; ++i) {
        const { pos: p, vel: v } = adaptiveIntegrate(
            pos, vel, dt, bodies, perturbationScale,
            undefined, undefined, sensScale,
        );
        pos = p; vel = v;

        const r = Math.hypot(...pos);
        if (!allowFullEllipse && !hyperbolic &&
            r <= Constants.earthRadius + Constants.atmosphereCutoffAltitude) {

            // re-entry handling
            const atmPts = await propagateAtmosphere(
                pos, vel, bodies, 300, 1,
            );
            atmPts.forEach(pt => points.push({
                position: pt.position,
                timeOffset: dt * i + pt.timeOffset,
            }));
            onProgress?.(1);
            break;
        }

        points.push({ position: pos.slice(), timeOffset: dt * (i + 1) });

        if (onProgress && ((i + 1) % batchSz === 0 || i === numPoints - 1)) {
            onProgress((i + 1) / numPoints);
            await new Promise(r => setTimeout(r, 0));   // yield
        }
    }
    return points;
}

/**
 * Simple Euler integration through the atmosphere (1 s steps).
 * Returns [{position:[km,km,km], timeOffset:s}, …]
 */
export async function propagateAtmosphere(
    pos0, vel0,
    bodies,
    maxSeconds = 300, dt = 1,
    Bc = Constants.ballisticCoefficient,
) {
    const pts = [];
    const steps = Math.ceil(maxSeconds / dt);
    const SATURATE = Constants.earthRadius;

    const p = pos0.slice();
    const v = vel0.slice();
    const perturbationScale = Constants.perturbationScale ?? 1;

    for (let i = 0; i < steps; ++i) {
        // yield every 20 iterations
        if (i && i % 20 === 0) await new Promise(r => setTimeout(r, 0));

        const g = computeAccel(p, bodies, perturbationScale);
        const d = computeDragAcceleration(p, v, Bc);

        v[0] += (g[0] + d[0]) * dt;
        v[1] += (g[1] + d[1]) * dt;
        v[2] += (g[2] + d[2]) * dt;

        p[0] += v[0] * dt;
        p[1] += v[1] * dt;
        p[2] += v[2] * dt;

        const r = Math.hypot(...p);
        if (r <= SATURATE) break;

        pts.push({ position: p.slice(), timeOffset: dt * (i + 1) });
    }
    return pts;
}

