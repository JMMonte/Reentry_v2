import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import { PhysicsUtils } from './PhysicsUtils.js';

const { MakeTime, RotationAxis, Rotation_EQJ_ECL, RotateVector } = Astronomy;

/**
 * Advanced satellite coordinate system using Astronomy Engine and planet quaternions.
 * Provides accurate transformations between different reference frames.
 */
export class SatelliteCoordinates {
    
    /**
     * Create satellite from lat/lon using planet's Three.js quaternion
     * @param {Object} params - Satellite parameters (lat, lon, altitude, azimuth, etc.)
     * @param {Object} planet - Planet object with Three.js quaternion
     * @param {Date} time - Current simulation time
     * @returns {Object} - { position: [x,y,z], velocity: [vx,vy,vz] } in planet-centric coordinates
     */
    static createFromLatLon(params, planet, time) {
        const {
            latitude, longitude, altitude = 400,
            velocity = 7.8, azimuth = 0, angleOfAttack = 0
        } = params;

        // 1. Calculate ECEF position (planet-centric)
        const position = SatelliteCoordinates._latLonAltToECEF(
            latitude, longitude, altitude, planet.radius, planet.polarRadius
        );

        // 2. Calculate velocity in local ENU frame
        const velocityENU = SatelliteCoordinates._calculateENUVelocity(
            latitude, longitude, velocity, azimuth, angleOfAttack
        );

        // 3. Transform velocity to planet-centric frame using planet's quaternion
        const finalVelocity = SatelliteCoordinates._transformWithPlanetQuaternion(
            velocityENU, planet, time
        );

        console.log(`[SatelliteCoordinates] Created from lat/lon: pos=${position.map(p => p.toFixed(2))}, vel=${finalVelocity.map(v => v.toFixed(3))}`);

        return {
            position,
            velocity: finalVelocity
        };
    }

    /**
     * Create satellite from orbital elements using PhysicsUtils and planet quaternion
     * @param {Object} params - Orbital element parameters
     * @param {Object} planet - Planet object
     * @param {Date} time - Current simulation time
     * @returns {Object} - { position: [x,y,z], velocity: [vx,vy,vz] } in planet-centric coordinates
     */
    static createFromOrbitalElements(params, planet, time) {
        const {
            semiMajorAxis, eccentricity, inclination,
            argumentOfPeriapsis, raan, trueAnomaly
        } = params;

        // 1. Calculate orbital state vectors using PhysicsUtils
        const { positionECI, velocityECI } = PhysicsUtils.calculatePositionAndVelocityFromOrbitalElements(
            semiMajorAxis, eccentricity, inclination,
            argumentOfPeriapsis, raan, trueAnomaly, planet.GM
        );

        // 2. Convert THREE.Vector3 to arrays
        const position = [positionECI.x, positionECI.y, positionECI.z];
        const velocity = [velocityECI.x, velocityECI.y, velocityECI.z];

        // 3. Apply planet's current orientation if needed
        // (For now, keep ECI coordinates as they are planet-centric)
        
        console.log(`[SatelliteCoordinates] Created from orbital elements: pos=${position.map(p => p.toFixed(2))}, vel=${velocity.map(v => v.toFixed(3))}`);

        return { position, velocity };
    }

    /**
     * Calculate ECEF position from lat/lon/alt
     */
    static _latLonAltToECEF(latitude, longitude, altitude, equatorialRadius, polarRadius) {
        const lat = THREE.MathUtils.degToRad(latitude);
        const lon = THREE.MathUtils.degToRad(longitude);
        const a = equatorialRadius;
        const b = polarRadius || a;
        const e2 = 1 - (b * b) / (a * a);
        const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);

        // ECEF position in kilometers
        const X = (N + altitude) * Math.cos(lat) * Math.cos(lon);
        const Y = (N + altitude) * Math.cos(lat) * Math.sin(lon);
        const Z = ((1 - e2) * N + altitude) * Math.sin(lat);

        return [X, Y, Z];
    }

    /**
     * Calculate velocity in East-North-Up (ENU) frame
     */
    static _calculateENUVelocity(latitude, longitude, speed, azimuth, angleOfAttack) {
        const lat = THREE.MathUtils.degToRad(latitude);
        const lon = THREE.MathUtils.degToRad(longitude);
        const az = THREE.MathUtils.degToRad(azimuth);
        const aoa = THREE.MathUtils.degToRad(angleOfAttack);

        // Local ENU basis vectors in ECEF
        const up = new THREE.Vector3(
            Math.cos(lat) * Math.cos(lon),
            Math.cos(lat) * Math.sin(lon),
            Math.sin(lat)
        ).normalize();
        
        const north = new THREE.Vector3(
            -Math.sin(lat) * Math.cos(lon),
            -Math.sin(lat) * Math.sin(lon),
            Math.cos(lat)
        ).normalize();
        
        const east = new THREE.Vector3().crossVectors(north, up).normalize();

        // Velocity components: 0° = North, 90° = East
        const horizontalSpeed = speed * Math.cos(aoa);
        const verticalSpeed = speed * Math.sin(aoa);
        
        const northVel = horizontalSpeed * Math.cos(az);
        const eastVel = horizontalSpeed * Math.sin(az);
        
        // Combine into ECEF velocity vector
        const velocity = new THREE.Vector3()
            .addScaledVector(north, northVel)
            .addScaledVector(east, eastVel)
            .addScaledVector(up, verticalSpeed);

        return [velocity.x, velocity.y, velocity.z];
    }

    /**
     * Transform coordinates using planet's quaternion and time-based corrections
     */
    static _transformWithPlanetQuaternion(vector, planet, time) {
        // For now, return the vector as-is since ECEF coordinates are already planet-centric
        // Future enhancement: apply planet rotation and orientation corrections here
        
        // Get planet's current orientation if needed
        // const planetQuat = planet.targetOrientation || planet.orientationGroup?.quaternion;
        
        return vector;
    }

    /**
     * Fallback orbital elements calculation if not available on planet
     */
    static _calculateOrbitalElements(params, mu) {
        const {
            semiMajorAxis: a, eccentricity: e, inclination: i,
            argumentOfPeriapsis: omega, raan: Omega, trueAnomaly: f
        } = params;

        const iRad = THREE.MathUtils.degToRad(i);
        const omegaRad = THREE.MathUtils.degToRad(omega);
        const OmegaRad = THREE.MathUtils.degToRad(Omega);
        const fRad = THREE.MathUtils.degToRad(f);

        // Standard orbital mechanics calculations
        const p = a * (1 - e * e);
        const r = p / (1 + e * Math.cos(fRad));

        const xP = r * Math.cos(fRad);
        const yP = r * Math.sin(fRad);

        const h = Math.sqrt(mu * p);
        const vxP = -mu / h * Math.sin(fRad);
        const vyP = mu / h * (e + Math.cos(fRad));

        // Rotation matrices
        const cosOmega = Math.cos(OmegaRad), sinOmega = Math.sin(OmegaRad);
        const cosi = Math.cos(iRad), sini = Math.sin(iRad);
        const cosomega = Math.cos(omegaRad), sinomega = Math.sin(omegaRad);

        const R11 = cosOmega * cosomega - sinOmega * sinomega * cosi;
        const R12 = -cosOmega * sinomega - sinOmega * cosomega * cosi;
        const R21 = sinOmega * cosomega + cosOmega * sinomega * cosi;
        const R22 = -sinOmega * sinomega + cosOmega * cosomega * cosi;
        const R31 = sinomega * sini;
        const R32 = cosomega * sini;

        return {
            positionECI: new THREE.Vector3(
                R11 * xP + R12 * yP,
                R21 * xP + R22 * yP,
                R31 * xP + R32 * yP
            ),
            velocityECI: new THREE.Vector3(
                R11 * vxP + R12 * vyP,
                R21 * vxP + R22 * vyP,
                R31 * vxP + R32 * vyP
            )
        };
    }
}