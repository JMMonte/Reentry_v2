/***********************************************************************
 *  PhysicsUtils.js — Z-up / ecliptic-world edition (April 2025)       *
 *                                                                     *
 *  +Z = ecliptic (celestial) north pole.                              *
 *  Earth's geographic pole is obtained by tilting the globe about +X  *
 *  by Constants.earthInclination (≈ 23.44 °).                          *
 *                                                                     *
 *  ► All public APIs, argument lists and return types match the       *
 *    original Y-up file, so nothing else needs to change in your      *
 *    project.                                                         *
 *  ► ESLint: no unused-variable warnings.                              *
 ***********************************************************************/

import { Constants } from './Constants.js';
import * as THREE from 'three';

/*─────────────────────────────────────────────────────────────────────┐
│  0.  GLOBAL AXES & EARTH TILT                                       │
└─────────────────────────────────────────────────────────────────────*/

const UP = new THREE.Vector3(0, 0, 1);
const NORTH_AXIS = new THREE.Vector3(1, 0, 0);

// Utility to create tilt quaternion for any inclination
function createTiltQuaternion(inclinationDeg) {
    return new THREE.Quaternion().setFromAxisAngle(NORTH_AXIS, THREE.MathUtils.degToRad(inclinationDeg));
}

/*─────────────────────────────────────────────────────────────────────┐
│  1.  CLASS                                                          │
└─────────────────────────────────────────────────────────────────────*/
export class PhysicsUtils {

    // Utility: get tilt quaternion for a given inclination
    static getTiltQuaternion(inclinationDeg) {
        return createTiltQuaternion(inclinationDeg);
    }
    static getInvTiltQuaternion(inclinationDeg) {
        return createTiltQuaternion(inclinationDeg).clone().invert();
    }

    /*───────────────────────── 1.1  Newtonian helpers ───────────────────*/
    static calculateGravitationalForce(m1, m2, r) {
        return r === 0 ? 0 : Constants.G * (m1 * m2) / (r * r);
    }
    static calculateOrbitalVelocity(mass, r) { return Math.sqrt(Constants.G * mass / r); }
    static calculateEscapeVelocity(mass, r) { return Math.sqrt(2 * Constants.G * mass / r); }
    static calculateGravityAcceleration(mass, r) { return Constants.G * mass / (r * r); }
    static calculateAcceleration(force, mass) { return force / mass; }

    /*───────────────────────── 1.2  Lat/Lon ↔ ECEF  ─────────────────────*/
    static latLonAltToECEF(latDeg, lonDeg, alt = 0, radius, out = new THREE.Vector3()) {
        const φ = THREE.MathUtils.degToRad(latDeg);
        const λ = THREE.MathUtils.degToRad(lonDeg);
        const r = radius + alt;
        return out.set(
            r * Math.cos(φ) * Math.cos(λ),   // X
            r * Math.cos(φ) * Math.sin(λ),   // Y
            r * Math.sin(φ)                  // Z
        );
    }

    static ecefToGeodetic(x, y, z, a, b) {
        const e2 = 1 - (b * b) / (a * a);

        const p = Math.hypot(x, y);
        const θ = Math.atan2(z * a, p * b);
        const lon = Math.atan2(y, x);
        const lat = Math.atan2(
            z + e2 * b * Math.pow(Math.sin(θ), 3),
            p - e2 * a * Math.pow(Math.cos(θ), 3)
        );
        const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
        const alt = p / Math.cos(lat) - N;

        return {
            latitude: THREE.MathUtils.radToDeg(lat),
            longitude: THREE.MathUtils.radToDeg(lon),
            altitude: alt
        };
    }

    static convertLatLonToCartesian(
        lat, lon,
        radius
    ) {
        const φ = THREE.MathUtils.degToRad(lat);
        const λ = THREE.MathUtils.degToRad(lon);
        return new THREE.Vector3(
            radius * Math.cos(φ) * Math.cos(λ),
            radius * Math.cos(φ) * Math.sin(λ),
            radius * Math.sin(φ)
        );
    }

    static cartesianToGeodetic(x, y, z) {
        const r = Math.hypot(x, y, z);
        return {
            latitude: THREE.MathUtils.radToDeg(Math.asin(z / r)),
            longitude: THREE.MathUtils.radToDeg(Math.atan2(y, x))
        };
    }

    /*───────────────────────── 1.3  GMST & ECI↔ECEF ─────────────────────*/
    static calculateGMST(dateUTCms) {
        const jd = dateUTCms / 86400000 + 2440587.5;
        const T = (jd - 2451545.0) / 36525.0;
        const GMST = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
            + 0.000387933 * T * T - (T * T * T) / 38710000;
        return THREE.MathUtils.degToRad(GMST % 360);
    }

    static eciToEcef(p, gmst, out = new THREE.Vector3()) {
        const c = Math.cos(gmst), s = Math.sin(gmst);
        return out.set(
            p.x * c + p.y * s,
            -p.x * s + p.y * c,
            p.z
        );
    }
    /** ECEF → ECI (equatorial) given GMST (radians)                       */
    static ecefToEci(ecef, gmst, out = new THREE.Vector3()) {
        const c = Math.cos(-gmst), s = Math.sin(-gmst);
        return out.set(
            ecef.x * c + ecef.y * s,
            -ecef.x * s + ecef.y * c,
            ecef.z
        );
    }

    /** Add Earth-tilt: equatorial-ECI → ecliptic-ECI                      */
    static eciEquatorialToEcliptic(vec, inclinationDeg) { return vec.clone().applyQuaternion(this.getTiltQuaternion(inclinationDeg)); }
    /** Remove tilt: ecliptic-ECI → equatorial-ECI                         */
    static eciEclipticToEquatorial(vec, inclinationDeg) { return vec.clone().applyQuaternion(this.getInvTiltQuaternion(inclinationDeg)); }


    /*───────────────────────── 2.  LAUNCH CONVERTERS ────────────────────*/
    static calculatePositionAndVelocity(
        latitude, longitude, altitude,
        velocity, azimuth, angleOfAttack,
        radius, polarRadius,
        tiltQ,
        earthQuaternion = new THREE.Quaternion()
    ) {
        /* position in ECEF */
        const latRad = THREE.MathUtils.degToRad(latitude);
        const lonRad = THREE.MathUtils.degToRad(longitude);

        const a = radius;
        const b = polarRadius;
        const e2 = 1 - (b * b) / (a * a);
        const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);

        const X = (N + altitude) * Math.cos(latRad) * Math.cos(lonRad);
        const Y = (N + altitude) * Math.cos(latRad) * Math.sin(lonRad);
        const Z = ((1 - e2) * N + altitude) * Math.sin(latRad);

        const posECEF = new THREE.Vector3(X, Y, Z);

        /* local ENU basis */
        const up = posECEF.clone().normalize();
        const north = new THREE.Vector3(
            -Math.sin(latRad) * Math.cos(lonRad),
            -Math.sin(latRad) * Math.sin(lonRad),
            Math.cos(latRad)
        ).normalize();
        const east = new THREE.Vector3().crossVectors(up, north);

        /* velocity in ECEF */
        const azRad = THREE.MathUtils.degToRad(azimuth);
        const aoaRad = THREE.MathUtils.degToRad(angleOfAttack);

        // interpret azimuth relative to East axis but flipped by 180° to correct orientation
        const horizontal = east.multiplyScalar(Math.cos(azRad + Math.PI))
            .add(north.multiplyScalar(Math.sin(azRad + Math.PI)));

        const velECEF = horizontal.multiplyScalar(velocity * Math.cos(aoaRad))
            .add(up.clone().multiplyScalar(velocity * Math.sin(aoaRad)));

        /* rotate to inertial ECI */
        const positionECI = posECEF.clone()
            .applyQuaternion(earthQuaternion)
            .applyQuaternion(tiltQ);

        const velocityECI = velECEF.clone()
            .applyQuaternion(earthQuaternion)
            .applyQuaternion(tiltQ);

        return { positionECEF: posECEF, velocityECEF: velECEF, positionECI, velocityECI };
    }

    static calculatePositionAndVelocityCircular(
        latitude, longitude, altitude,
        azimuth, angleOfAttack,
        radius, polarRadius, GM,
        tiltQ, earthQuaternion
    ) {
        const r = radius + altitude;
        const vCirc = Math.sqrt(GM / r);
        return PhysicsUtils.calculatePositionAndVelocity(
            latitude, longitude, altitude,
            vCirc, azimuth, angleOfAttack,
            radius, polarRadius,
            tiltQ, earthQuaternion
        );
    }

    /*───────────────────────── 3.  ORBITAL ELEMENTS  ─────────────────────*/
    static calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis, eccentricity, inclination,
        argumentOfPeriapsis, raan, trueAnomaly,
        mu
    ) {
        const a = semiMajorAxis;
        const e = eccentricity;
        const i = THREE.MathUtils.degToRad(inclination);
        const ω = THREE.MathUtils.degToRad(argumentOfPeriapsis);
        const Ω = THREE.MathUtils.degToRad(raan);
        const f = THREE.MathUtils.degToRad(trueAnomaly);

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
        const positionECI = new THREE.Vector3(
            R11 * xP + R12 * yP,
            R21 * xP + R22 * yP,
            R31 * xP + R32 * yP
        );

        // equatorial ECI velocity (no axial tilt applied)
        const velocityECI = new THREE.Vector3(
            R11 * vxP + R12 * vyP,
            R21 * vxP + R22 * vyP,
            R31 * vxP + R32 * vyP
        );

        return { positionECI, velocityECI };
    }

    /*───────────────────────── 4.  ORBITAL MATH (unchanged) ─────────────*/

    /* 4.1  Classical elements from state-vectors */
    static calculateOrbitalElements(position, velocity, mu) {
        const r = position.length();
        const vr = velocity.dot(position) / r;
        const hVec = position.clone().cross(velocity);
        const h = hVec.length();
        const i = Math.acos(hVec.z / h);
        const nVec = new THREE.Vector3(-hVec.y, hVec.x, 0);
        const n = nVec.length();
        const eVec = velocity.clone().cross(hVec).divideScalar(mu)
            .sub(position.clone().divideScalar(r));
        const e = eVec.length();
        let Ω = Math.acos(nVec.x / n);
        if (nVec.y < 0) Ω = 2 * Math.PI - Ω;
        let ω = Math.acos(nVec.dot(eVec) / (n * e));
        if (eVec.z < 0) ω = 2 * Math.PI - ω;
        let θ = Math.acos(eVec.dot(position) / (e * r));
        if (vr < 0) θ = 2 * Math.PI - θ;
        return { h, e, i, omega: Ω, w: ω, trueAnomaly: θ };
    }

    /* 4.2  Orbit sampler (ECI) */
    static computeOrbit({ h, e, i, omega, w }, mu, numPoints = 100) {
        const pts = [];
        const step = 2 * Math.PI / numPoints;
        for (let f = 0; f < 2 * Math.PI; f += step) {
            const r = (h * h / mu) / (1 + e * Math.cos(f));
            const xP = r * Math.cos(f);
            const yP = r * Math.sin(f);

            const cosw = Math.cos(w), sinw = Math.sin(w);
            const x1 = cosw * xP - sinw * yP;
            const y1 = sinw * xP + cosw * yP;

            const cosi = Math.cos(i), sini = Math.sin(i);
            const x2 = x1;
            const z2 = sini * y1;
            const y2 = cosi * y1;

            const cosΩ = Math.cos(omega), sinΩ = Math.sin(omega);
            const x = cosΩ * x2 - sinΩ * y2;
            const y = sinΩ * x2 + cosΩ * y2;
            const z = z2;

            pts.push(
                new THREE.Vector3(
                    x * Constants.metersToKm,
                    y * Constants.metersToKm,
                    z * Constants.metersToKm
                )
            );
        }
        return pts;
    }

    /* 4.3  Miscellaneous helpers (velocity, drag, ΔV, RK4, Hohmann…) */

    static calculateVelocity(velocity, latRad, lonRad, azimuthRad, aoaRad) {
        const v = new THREE.Vector3(
            velocity * Math.cos(aoaRad) * Math.cos(azimuthRad),
            velocity * Math.cos(aoaRad) * Math.sin(azimuthRad),
            velocity * Math.sin(aoaRad)
        );
        const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(latRad, lonRad, 0, 'XYZ'));
        v.applyMatrix4(rot);
        return v;
    }

    static calculateVerticalAcceleration(planetRadius, planetMass, altitude) {
        return Constants.G * planetMass / Math.pow(planetRadius + altitude, 2);
    }

    static calculateDragForce(v, Cd, A, rho) { return 0.5 * Cd * A * rho * v * v; }

    static calculateAtmosphericDensity(alt, seaLevelDensity, scaleHeight) {
        return seaLevelDensity * Math.exp(-alt / scaleHeight);
    }

    static calculateAzimuthFromInclination(lat, inc, raan) {
        const latR = THREE.MathUtils.degToRad(lat);
        const incR = THREE.MathUtils.degToRad(inc);
        const raanR = THREE.MathUtils.degToRad(raan);
        let az = Math.asin(Math.cos(incR) / Math.cos(latR));
        az += raanR;
        return THREE.MathUtils.radToDeg(az);
    }

    /* Z-up version: ω × r */
    static calculateEarthSurfaceVelocity(posECEF,
        earthRotationRate = Constants.earthRotationSpeed) {
        return new THREE.Vector3().crossVectors(
            new THREE.Vector3(0, 0, earthRotationRate), posECEF
        );
    }

    static orbitalVelocityAtAnomaly(els, f, mu) {
        const { h, e } = els;
        const r = (h * h / mu) / (1 + e * Math.cos(f));
        const vMag = Math.sqrt(mu * (2 / r - 1 / (h * h / mu / (1 - e * e))));
        return new THREE.Vector3(
            vMag * -Math.sin(f),
            vMag * (e + Math.cos(f)),
            0
        );
    }

    static rotateToECI(vec, i, Ω, ω) {
        const m = new THREE.Matrix4()
            .multiply(new THREE.Matrix4().makeRotationZ(-ω))
            .multiply(new THREE.Matrix4().makeRotationX(-i))
            .multiply(new THREE.Matrix4().makeRotationZ(-Ω));
        return vec.clone().applyMatrix4(m);
    }

    static calculateOrbitalPosition(els, mu) {
        const { h, e, i, omega, w, trueAnomaly } = els;
        const r = (h * h / mu) / (1 + e * Math.cos(trueAnomaly));
        return PhysicsUtils.rotateToECI(
            new THREE.Vector3(
                r * Math.cos(trueAnomaly),
                r * Math.sin(trueAnomaly),
                0
            ), i, omega, w
        );
    }

    static calculateStateVectorsAtAnomaly(els, f, mu) {
        const { h, e, i, omega, w } = els;
        const r = (h * h / mu) / (1 + e * Math.cos(f));

        const x = r * Math.cos(f);
        const y = r * Math.sin(f);

        const pos = new THREE.Vector3(x, y, 0)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), w)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), i)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);

        const vr = (mu / h) * e * Math.sin(f);
        const vt = (mu / h) * (1 + e * Math.cos(f));
        const vx = vr * Math.cos(f) - vt * Math.sin(f);
        const vy = vr * Math.sin(f) + vt * Math.cos(f);

        const vel = new THREE.Vector3(vx, vy, 0)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), -w)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), i)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);

        return { position: pos, velocity: vel };
    }

    static calculateDeltaVAtAnomaly(curEls, tgtEls, f, mu) {
        const cur = PhysicsUtils.calculateStateVectorsAtAnomaly(curEls, f, mu);
        const tgt = PhysicsUtils.calculateStateVectorsAtAnomaly(tgtEls, f, mu);
        return tgt.velocity.clone().sub(cur.velocity).length();
    }

    static meanAnomalyFromTrueAnomaly(f, e) {
        const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(f / 2));
        return E - e * Math.sin(E);
    }

    static solveKeplersEquation(M, e, tol = 1e-6) {
        let E = M, dE;
        do {
            dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
            E += dE;
        } while (Math.abs(dE) > tol);
        return E;
    }

    static getPositionAtTime(els, t) {
        const mu = els.mu !== undefined
            ? els.mu
            : Constants.G * Constants.earthMass;

        const { semiMajorAxis: a, eccentricity: e,
            inclination: i, longitudeOfAscendingNode: Ω,
            argumentOfPeriapsis: ω, meanAnomaly: M0 = 0 } = els;

        const n = Math.sqrt(mu / Math.pow(a, 3));
        const M = M0 + n * t;
        const E = PhysicsUtils.solveKeplersEquation(M, e);
        const f = 2 * Math.atan2(
            Math.sqrt(1 + e) * Math.sin(E / 2),
            Math.sqrt(1 - e) * Math.cos(E / 2)
        );
        const r = a * (1 - e * e) / (1 + e * Math.cos(f));

        const pos = new THREE.Vector3(r * Math.cos(f), r * Math.sin(f), 0)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), ω)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), i)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), Ω)
            .multiplyScalar(Constants.metersToKm);

        return pos;
    }

    /**
     *  RK4 propagator with multiple gravitating bodies
     */
    static propagateOrbit(initialPos, initialVel, bodies, period, numPts = 180) {
        const dt = period / numPts;
        let pos = initialPos.clone();
        let vel = initialVel.clone();
        const pts = [];

        const accel = p => {
            const a = new THREE.Vector3();
            bodies.forEach(b => {
                const d = new THREE.Vector3().subVectors(b.position, p);
                const r2 = d.lengthSq();
                if (r2 > 0) {
                    a.addScaledVector(d.normalize(), Constants.G * b.mass / r2);
                }
            });
            return a;
        };

        for (let i = 0; i < numPts; i++) {
            const p0 = pos.clone(), v0 = vel.clone(), a0 = accel(p0);
            const k1p = v0.clone().multiplyScalar(dt);
            const k1v = a0.clone().multiplyScalar(dt);

            const p1 = p0.clone().addScaledVector(k1p, 0.5);
            const v1 = v0.clone().addScaledVector(k1v, 0.5);
            const a1 = accel(p1);
            const k2p = v1.clone().multiplyScalar(dt);
            const k2v = a1.clone().multiplyScalar(dt);

            const p2 = p0.clone().addScaledVector(k2p, 0.5);
            const v2 = v0.clone().addScaledVector(k2v, 0.5);
            const a2 = accel(p2);
            const k3p = v2.clone().multiplyScalar(dt);
            const k3v = a2.clone().multiplyScalar(dt);

            const p3 = p0.clone().add(k3p);
            const v3 = v0.clone().add(k3v);
            const a3 = accel(p3);
            const k4p = v3.clone().multiplyScalar(dt);
            const k4v = a3.clone().multiplyScalar(dt);

            pos.add(
                k1p.clone().addScaledVector(k2p, 2).addScaledVector(k3p, 2).add(k4p).multiplyScalar(1 / 6)
            );
            vel.add(
                k1v.clone().addScaledVector(k2v, 2).addScaledVector(k3v, 2).add(k4v).multiplyScalar(1 / 6)
            );

            pts.push(pos.clone().multiplyScalar(Constants.metersToKm));
        }
        return pts;
    }

    static calculateApsidesFromElements(els, mu) {
        if (!els) return null;
        const { h, e } = els;
        const rp = (h * h) / (mu * (1 + e));
        const ra = e < 1 ? (h * h) / (mu * (1 - e)) : null;
        return { rPeriapsis: rp, rApoapsis: ra };
    }

    static calculateApsis(pos, vel, mu, radius) {
        const els = PhysicsUtils.calculateOrbitalElements(pos, vel, mu);
        if (!els) return null;
        const aps = PhysicsUtils.calculateApsidesFromElements(els, mu);
        if (!aps) return null;
        const { rPeriapsis: rp, rApoapsis: ra } = aps;
        return {
            orbitalElements: els,
            rPeriapsis: rp,
            rApoapsis: ra,
            periapsisAltitude: (rp - radius) * Constants.metersToKm,
            apoapsisAltitude: ra !== null ? (ra - radius) * Constants.metersToKm : null
        };
    }

    static calculateDetailedOrbitalElements(pos, vel, mu, radius) {
        const r = pos.length();
        const v2 = vel.lengthSq();
        const ε = v2 / 2 - mu / r;
        const hVec = new THREE.Vector3().crossVectors(pos, vel);
        const h = hVec.length();

        const sma = -mu / (2 * ε);
        const ev = vel.clone().cross(hVec).divideScalar(mu)
            .sub(pos.clone().divideScalar(r));
        const ecc = ev.length();
        const inc = Math.acos(hVec.z / h) * (180 / Math.PI);

        const nVec = new THREE.Vector3(0, 0, 1).cross(hVec);
        const n = nVec.length();

        let Ω = Math.acos(nVec.x / n) * (180 / Math.PI);
        if (nVec.y < 0) Ω = 360 - Ω;

        let ω = Math.acos(nVec.dot(ev) / (n * ecc)) * (180 / Math.PI);
        if (ev.z < 0) ω = 360 - ω;

        let f = Math.acos(ev.dot(pos) / (ecc * r)) * (180 / Math.PI);
        if (pos.dot(vel) < 0) f = 360 - f;

        const period = 2 * Math.PI * Math.sqrt(Math.pow(sma, 3) / mu);
        const rp = sma * (1 - ecc);
        const ra = sma * (1 + ecc);

        return {
            semiMajorAxis: sma * Constants.metersToKm,
            eccentricity: ecc,
            inclination: inc,
            longitudeOfAscendingNode: Ω,
            argumentOfPeriapsis: ω,
            trueAnomaly: f,
            period,
            specificAngularMomentum: h,
            specificOrbitalEnergy: ε,
            periapsisAltitude: (rp - radius) * Constants.metersToKm,
            apoapsisAltitude: (ra - radius) * Constants.metersToKm,
            periapsisRadial: rp * Constants.metersToKm,
            apoapsisRadial: ra * Constants.metersToKm
        };
    }

    /* Hohmann manoeuvres */
    static calculateHohmannOrbitRaiseDeltaV(r1, r2, mu = Constants.earthGravitationalParameter) {
        const v1 = Math.sqrt(mu / r1);
        const vT1 = Math.sqrt(mu * (2 / r1 - 1 / ((r1 + r2) / 2)));
        const vT2 = Math.sqrt(mu * (2 / r2 - 1 / ((r1 + r2) / 2)));
        const v2 = Math.sqrt(mu / r2);
        const Δv1 = vT1 - v1;
        const Δv2 = v2 - vT2;
        return { deltaV1: Δv1, deltaV2: Δv2, totalDeltaV: Δv1 + Δv2 };
    }

    static calculateHohmannInterceptDeltaV(r1, r2, mu = Constants.earthGravitationalParameter) {
        const aT = (r1 + r2) / 2;
        const v1 = Math.sqrt(mu / r1);
        const vT1 = Math.sqrt(mu * (2 / r1 - 1 / aT));
        const vT2 = Math.sqrt(mu * (2 / r2 - 1 / aT));
        const v2 = Math.sqrt(mu / r2);
        const Δv1 = vT1 - v1;
        const Δv2 = v2 - vT2;
        return { deltaV1: Δv1, deltaV2: Δv2, totalDeltaV: Δv1 + Δv2 };
    }

    static calculateHohmannTransferNodes(r1, r2, els, mu = Constants.earthGravitationalParameter) {
        const { deltaV1: Δv1, deltaV2: Δv2 } =
            PhysicsUtils.calculateHohmannOrbitRaiseDeltaV(r1, r2, mu);

        const f1 = els.trueAnomaly;
        const f2 = f1 + Math.PI;

        const burnNode1 = {
            trueAnomaly: f1,
            deltaV: Δv1,
            direction: new THREE.Vector3(1, 0, 0)     // prograde
        };
        const burnNode2 = {
            trueAnomaly: f2,
            deltaV: Δv2,
            direction: new THREE.Vector3(1, 0, 0)
        };
        return { burnNode1, burnNode2 };
    }

    /*───────────────────────── 5.  DEBUG helper ─────────────────────────*/
    static eciTiltToLatLon(positionECI, gmst, inclinationDeg) {
        const v = positionECI.clone()
            .applyQuaternion(this.getInvTiltQuaternion(inclinationDeg))   // undo axial tilt
            .applyAxisAngle(UP, gmst);            // apply planet rotation

        const r = v.length();
        const lat = THREE.MathUtils.radToDeg(Math.asin(v.z / r));
        let lon = THREE.MathUtils.radToDeg(Math.atan2(v.y, v.x));
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;
        return { lat, lon };
    }
}

/*────────────────────────────  EOF  ────────────────────────────────*/
