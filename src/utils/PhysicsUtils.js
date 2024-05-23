import { Constants } from './Constants.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class PhysicsUtils {
    static calculateGravitationalForce(m1, m2, r) {
        if (r === 0) {
            console.error('Distance r is zero, returning zero force to avoid division by zero.');
            return 0;
        }
        return Constants.G * (m1 * m2) / (r * r);
    }

    static calculateOrbitalVelocity(mass, radius) {
        return Math.sqrt(Constants.G * mass / radius);
    }

    static calculateEscapeVelocity(mass, radius) {
        return Math.sqrt(2 * Constants.G * mass / radius);
    }

    static calculateGravityAcceleration(mass, radius) {
        return Constants.G * mass / (radius * radius);
    }

    static calculateAcceleration(force, mass) {
        return force / mass;
    }

    static calculateOrbitalElements(position, velocity, mu) {
        const r = position.length();
        const v = velocity.length();
        const vr = velocity.dot(position) / r;
        const hVec = position.cross(velocity);
        const h = hVec.length();
        const i = Math.acos(hVec.z / h);
        const nVec = new THREE.Vector3(0, 0, 1).cross(hVec);
        const n = nVec.length();
        const eVec = (velocity.cross(hVec)).divideScalar(mu).sub(position.divideScalar(r));
        const e = eVec.length();
        let omega = Math.acos(nVec.x / n);
        if (nVec.y < 0) omega = 2 * Math.PI - omega;
        let w = Math.acos(nVec.dot(eVec) / (n * e));
        if (eVec.z < 0) w = 2 * Math.PI - w;
        let theta = Math.acos(eVec.dot(position) / (e * r));
        if (vr < 0) theta = 2 * Math.PI - theta;
        return { h, e, i, omega, w, theta };
    }

    static computeOrbit({ h, e, i, omega, w, theta }, mu, numPoints = 100) {
        const points = [];
        const step = 2 * Math.PI / numPoints;
        for (let f = 0; f < 2 * Math.PI; f += step) {
            const r = (h * h / mu) / (1 + e * Math.cos(f));
            const oX = r * (Math.cos(omega) * Math.cos(w + f) - Math.sin(omega) * Math.sin(w + f) * Math.cos(i));
            const oY = r * (Math.sin(omega) * Math.cos(w + f) + Math.cos(omega) * Math.sin(w + f) * Math.cos(i));
            const oZ = r * (Math.sin(i) * Math.sin(w + f));
            points.push(new THREE.Vector3(oX, oY, oZ));
        }
        return points;
    }

    static calculateVerticalAcceleration(planetRadius, planetMass, altitude) {
        return Constants.G * planetMass / Math.pow(planetRadius + altitude, 2);
    }

    static calculateDragForce(velocity, dragCoefficient, crossSectionalArea, atmosphericDensity) {
        return 0.5 * dragCoefficient * crossSectionalArea * atmosphericDensity * velocity * velocity;
    }

    static calculateAtmosphericDensity(altitude) {
        const rho0 = Constants.atmosphereSeaLevelDensity; // kg/m^3 at sea level
        const H = Constants.atmosphereScaleHeight; // Scale height in meters
        return rho0 * Math.exp(-altitude / H);
    }

    static calculateEarthSurfaceVelocity(satellitePosition, earthRadius, earthRotationSpeed, earthInclination) {
        const earthSurfaceVelocity = new CANNON.Vec3(
            -earthRotationSpeed * earthRadius * Math.sin(earthInclination * Math.PI / 180),
            0,
            earthRotationSpeed * earthRadius * Math.cos(earthInclination * Math.PI / 180)
        );
        earthSurfaceVelocity.vadd(satellitePosition, earthSurfaceVelocity);
        return earthSurfaceVelocity;
    }

    static calculatePositionAndVelocity(latitude, longitude, altitude, velocity, azimuth, angleOfAttack, timeUtils, tiltQuaternion, earthQuaternion) {
        const latRad = THREE.MathUtils.degToRad(latitude);
        const lonRad = THREE.MathUtils.degToRad(-longitude);
        const azimuthRad = THREE.MathUtils.degToRad(azimuth);
        const angleOfAttackRad = THREE.MathUtils.degToRad(angleOfAttack);
        const a = Constants.earthRadius;
        const b = Constants.earthPolarRadius;
        const e2 = 1 - (b * b) / (a * a);
        const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
        const X = (N + altitude) * Math.cos(latRad) * Math.cos(lonRad);
        const Z = (N + altitude) * Math.cos(latRad) * Math.sin(lonRad);
        const Y = ((1 - e2) * N + altitude) * Math.sin(latRad);
        let positionECI = new THREE.Vector3(X, Y, Z);
        const up = new THREE.Vector3(X, Y, Z).normalize();
        const north = new THREE.Vector3(
            -Math.sin(latRad) * Math.cos(lonRad),
            Math.cos(latRad),
            -Math.sin(latRad) * Math.sin(lonRad)
        ).normalize();
        const east = new THREE.Vector3().crossVectors(north, up).normalize();
        const horizontalVelocityENU = new THREE.Vector3(
            Math.cos(azimuthRad) * north.x + Math.sin(azimuthRad) * east.x,
            Math.cos(azimuthRad) * north.y + Math.sin(azimuthRad) * east.y,
            Math.cos(azimuthRad) * north.z + Math.sin(azimuthRad) * east.z
        ).normalize();
        const velocityENU = new THREE.Vector3(
            horizontalVelocityENU.x * Math.cos(angleOfAttackRad) + up.x * Math.sin(angleOfAttackRad),
            horizontalVelocityENU.y * Math.cos(angleOfAttackRad) + up.y * Math.sin(angleOfAttackRad),
            horizontalVelocityENU.z * Math.cos(angleOfAttackRad) + up.z * Math.sin(angleOfAttackRad)
        ).multiplyScalar(velocity);
        const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        positionECI.applyQuaternion(correctionQuaternion);
        velocityENU.applyQuaternion(correctionQuaternion);
        positionECI.applyQuaternion(tiltQuaternion);
        velocityENU.applyQuaternion(tiltQuaternion);
        positionECI.applyQuaternion(earthQuaternion);
        velocityENU.applyQuaternion(earthQuaternion);
        const position = new CANNON.Vec3(positionECI.x, positionECI.y, positionECI.z);
        const velocityECEF = new CANNON.Vec3(velocityENU.x, velocityENU.y, velocityENU.z);
        return { positionECEF: position, velocityECEF: velocityECEF };
    }
}
