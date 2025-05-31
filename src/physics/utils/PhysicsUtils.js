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

import { PhysicsConstants } from '../core/PhysicsConstants.js';
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
        return r === 0 ? 0 : PhysicsConstants.PHYSICS.G * (m1 * m2) / (r * r);
    }
    static calculateGravityAcceleration(mass, r) { return PhysicsConstants.PHYSICS.G * mass / (r * r); }
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

    /* 4.1  Classical elements from state-vectors - REMOVED: Use KeplerianUtils.stateToKeplerian() instead */

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
                    x,
                    y,
                    z
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
        return PhysicsConstants.PHYSICS.G * planetMass / Math.pow(planetRadius + altitude, 2);
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
    static calculateBodySurfaceVelocity(posECEF, rotationRate) {
        return new THREE.Vector3().crossVectors(
            new THREE.Vector3(0, 0, rotationRate), posECEF
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
            : null; // Must be provided as parameter

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
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), Ω);

        return pos;
    }

    // REMOVED: propagateOrbit - use OrbitalIntegrators.integrateRK4 instead


    /* Hohmann manoeuvres - All deprecated methods removed. Use PhysicsAPI.calculateHohmannTransfer() instead */

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
