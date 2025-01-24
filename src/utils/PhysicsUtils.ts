import { Constants } from './Constants.js';
import * as THREE from 'three';

interface OrbitalElements {
    h: number;
    e: number;
    i: number;
    omega: number;
    w: number;
    trueAnomaly: number;
    semiMajorAxis: number;
}

export class PhysicsUtils {
    private static vec3Pool: THREE.Vector3[] = [];

    //#region Vector Pool Management
    private static getVector(): THREE.Vector3 {
        return this.vec3Pool.pop() || new THREE.Vector3();
    }

    private static releaseVector(...vectors: THREE.Vector3[]): void {
        vectors.forEach(v => {
            v.set(0, 0, 0);
            this.vec3Pool.push(v);
        });
    }
    //#endregion

    //#region Core Physics Calculations
    static calculateGravitationalForce(m1: number, m2: number, r: number): number {
        if (r <= 0) throw new Error(`Invalid distance: ${r} must be > 0`);
        return Constants.G * (m1 * m2) / (r ** 2);
    }

    static calculateOrbitalVelocity(mass: number, radius: number): number {
        return Math.sqrt(Constants.G * mass / radius);
    }

    static calculateEscapeVelocity(mass: number, radius: number): number {
        return Math.sqrt(2 * Constants.G * mass / radius);
    }

    static calculateGravityAcceleration(mass: number, radius: number): number {
        return Constants.G * mass / (radius ** 2);
    }

    static calculateAcceleration(force: number, mass: number): number {
        if (mass <= 0) throw new Error('Mass must be positive');
        return force / mass;
    }
    //#endregion

    //#region Orbital Mechanics
    static calculateOrbitalElements(position: THREE.Vector3, velocity: THREE.Vector3, mu: number): OrbitalElements {
        const r = position.length();
        if (r < 1e-6) throw new Error('Position vector magnitude too small');

        const vr = velocity.dot(position) / r;
        const hVec = this.getVector().copy(position).cross(velocity);
        const h = hVec.length();
        if (h < 1e-6) throw new Error('Angular momentum too small');

        const i = Math.acos(hVec.z / h);
        const nVec = this.getVector().set(-hVec.y, hVec.x, 0);
        const n = nVec.length();
        if (n < 1e-6) throw new Error('Undefined ascending node');

        const eVec = this.getVector()
            .copy(velocity)
            .cross(hVec)
            .divideScalar(mu)
            .sub(position.clone().divideScalar(r));
        const e = eVec.length();
        const semiMajorAxis = h ** 2 / (mu * (1 - e ** 2));

        let omega = Math.acos(nVec.x / n);
        omega = nVec.y < 0 ? 2 * Math.PI - omega : omega;

        let w = Math.acos(nVec.dot(eVec) / (n * e));
        w = eVec.z < 0 ? 2 * Math.PI - w : w;

        let trueAnomaly = Math.acos(eVec.dot(position) / (e * r));
        trueAnomaly = vr < 0 ? 2 * Math.PI - trueAnomaly : trueAnomaly;

        this.releaseVector(hVec, nVec, eVec);
        return { h, e, i, omega, w, trueAnomaly, semiMajorAxis };
    }

    static computeOrbit(elements: OrbitalElements, mu: number, numPoints = 100): THREE.Vector3[] {
        if (elements.e >= 1) throw new Error('Hyperbolic orbits not supported');

        const points: THREE.Vector3[] = [];
        const step = 2 * Math.PI / numPoints;
        const { h, e, i, omega, w } = elements;

        for (let f = 0; f < 2 * Math.PI; f += step) {
            const r = (h ** 2 / mu) / (1 + e * Math.cos(f));
            const pos = this.getVector()
                .set(r * Math.cos(f), r * Math.sin(f), 0)
                .applyAxisAngle(new THREE.Vector3(0, 0, 1), w)
                .applyAxisAngle(new THREE.Vector3(1, 0, 0), i)
                .applyAxisAngle(new THREE.Vector3(0, 0, 1), omega)
                .multiplyScalar(Constants.metersToKm * Constants.scale);

            points.push(pos.clone());
            this.releaseVector(pos);
        }

        return points;
    }
    //#endregion

    //#region Atmospheric Physics
    static calculateAtmosphericDensity(altitude: number): number {
        return Constants.atmosphereSeaLevelDensity *
            Math.exp(-altitude / Constants.atmosphereScaleHeight);
    }

    static calculateDragForce(
        velocity: number,
        dragCoefficient: number,
        area: number,
        density: number
    ): number {
        return 0.5 * dragCoefficient * area * density * velocity ** 2;
    }
    //#endregion

    //#region Coordinate Transformations
    static eciToEcef(position: THREE.Vector3, gmst: number): THREE.Vector3 {
        const cosθ = Math.cos(gmst);
        const sinθ = Math.sin(gmst);
        return this.getVector().set(
            position.x * cosθ + position.y * sinθ,
            -position.x * sinθ + position.y * cosθ,
            position.z
        );
    }

    static calculateGMST(date: number): number {
        const jd = date / 86400000 + 2440587.5;
        const T = (jd - 2451545.0) / 36525.0;
        const GMST = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
            0.000387933 * T ** 2 - T ** 3 / 38710000.0;
        return THREE.MathUtils.degToRad(GMST % 360);
    }

    static convertLatLonToCartesian(
        lat: number,
        lon: number,
        radius: number = Constants.earthRadius * Constants.metersToKm * Constants.scale
    ): THREE.Vector3 {
        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon);
        return this.getVector().set(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    static ecefToGeodetic(x: number, y: number, z: number): {
        latitude: number;
        longitude: number;
        altitude: number
    } {
        const a = Constants.earthRadius;
        const b = Constants.earthPolarRadius;
        const e2 = 1 - (b ** 2) / (a ** 2);
        const p = Math.sqrt(x ** 2 + y ** 2);
        const theta = Math.atan2(z * a, p * b);

        const lon = Math.atan2(y, x);
        const lat = Math.atan2(
            z + e2 * b * Math.sin(theta) ** 3,
            p - e2 * a * Math.cos(theta) ** 3
        );

        const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
        const alt = p / Math.cos(lat) - N;

        return {
            latitude: THREE.MathUtils.radToDeg(lat),
            longitude: THREE.MathUtils.radToDeg(lon),
            altitude: alt
        };
    }
    //#endregion

    //#region Advanced Orbital Calculations
    static calculatePositionAndVelocityFromOrbitalElements(
        semiMajorAxis: number,
        eccentricity: number,
        inclination: number,
        argumentOfPeriapsis: number,
        raan: number,
        trueAnomaly: number
    ): { positionECI: THREE.Vector3; velocityECI: THREE.Vector3 } {
        const mu = Constants.earthGravitationalParameter;
        const p = semiMajorAxis * (1 - eccentricity ** 2);
        if (p <= 0) throw new Error('Invalid semi-latus rectum');

        const r = p / (1 + eccentricity * Math.cos(trueAnomaly));
        const position = this.getVector().set(
            r * Math.cos(trueAnomaly),
            r * Math.sin(trueAnomaly),
            0
        );

        const velocity = this.getVector().set(
            -Math.sqrt(mu / p) * Math.sin(trueAnomaly),
            Math.sqrt(mu / p) * (eccentricity + Math.cos(trueAnomaly)),
            0
        );

        position.applyAxisAngle(new THREE.Vector3(0, 0, 1), argumentOfPeriapsis)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), inclination)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), raan);

        velocity.applyAxisAngle(new THREE.Vector3(0, 0, 1), argumentOfPeriapsis)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), inclination)
            .applyAxisAngle(new THREE.Vector3(0, 0, 1), raan);

        return {
            positionECI: position.multiplyScalar(Constants.metersToKm * Constants.scale),
            velocityECI: velocity
        };
    }

    static calculateVelocity(
        velocity: number,
        latRad: number,
        lonRad: number,
        azimuthRad: number,
        angleOfAttackRad: number
    ): THREE.Vector3 {
        const velocityVector = this.getVector().set(
            velocity * Math.cos(angleOfAttackRad) * Math.cos(azimuthRad),
            velocity * Math.cos(angleOfAttackRad) * Math.sin(azimuthRad),
            velocity * Math.sin(angleOfAttackRad)
        );

        const rotation = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(latRad, lonRad, 0, 'XYZ'));

        return velocityVector.applyQuaternion(rotation);
    }

    static calculateEarthSurfaceVelocity(
        satellitePosition: THREE.Vector3,
        earthRadius: number,
        earthRotationSpeed: number,
        earthInclination: number
    ): THREE.Vector3 {
        const surfaceVelocity = this.getVector().set(
            -earthRotationSpeed * earthRadius * Math.sin(earthInclination),
            0,
            earthRotationSpeed * earthRadius * Math.cos(earthInclination)
        );
        return surfaceVelocity.add(satellitePosition);
    }
    //#endregion

    //#region Utility Methods
    static solveKeplersEquation(M: number, e: number, tol = 1e-9): number {
        let E = M;
        for (let i = 0; i < 100; i++) {
            const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
            E -= delta;
            if (Math.abs(delta) < tol) break;
        }
        return E;
    }

    static calculateHohmannOrbitRaiseDeltaV(
        r1: number,
        r2: number,
        mu = Constants.earthGravitationalParameter
    ) {
        const a_transfer = (r1 + r2) / 2;
        const v1 = Math.sqrt(mu / r1);
        const v_transfer1 = Math.sqrt(mu * (2 / r1 - 1 / a_transfer));
        const v_transfer2 = Math.sqrt(mu * (2 / r2 - 1 / a_transfer));
        const v2 = Math.sqrt(mu / r2);
        return {
            deltaV1: v_transfer1 - v1,
            deltaV2: v2 - v_transfer2,
            totalDeltaV: (v_transfer1 - v1) + (v2 - v_transfer2)
        };
    }

    static calculateIntersectionWithEarth(position: THREE.Vector3): THREE.Vector3 {
        const earthRadius = Constants.earthRadius * Constants.metersToKm * Constants.scale;
        const direction = position.clone().normalize();
        return direction.multiplyScalar(earthRadius);
    }
    //#endregion
}