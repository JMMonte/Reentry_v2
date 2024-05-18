import { Constants } from './Constants.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TimeUtils } from './TimeUtils.js';

export class PhysicsUtils {
    static calculateGravitationalForce(m1, m2, r) {
        // Calculate the gravitational force between two masses
        if (r === 0) {
            console.error('Distance r is zero, returning zero force to avoid division by zero.');
            return 0;  // Prevent division by zero
        }
        return Constants.G * (m1 * m2) / (r * r);
    }

    static calculateOrbitalVelocity(mass, radius) {
        // Calculate the orbital velocity needed for a circular orbit
        return Math.sqrt(Constants.G * mass / radius);
    }

    static calculateEscapeVelocity(mass, radius) {
        // Calculate the escape velocity from a body
        return Math.sqrt(2 * Constants.G * mass / radius);
    }

    static calculateGravityAcceleration(mass, radius) {
        // Calculate the acceleration due to gravity at a certain radius
        return Constants.G * mass / (radius * radius);
    }

    static calculateAcceleration(force, mass) {
        // Calculate acceleration from a force and mass
        return force / mass;
    }

    static calculateOrbitalElements(position, velocity, mu) {
        // Standard gravitational parameter (mu = G * M)
        // Position and velocity are vectors
    
        const r = position.length();
        const v = velocity.length();
    
        const vr = velocity.dot(position) / r;
    
        const hVec = position.cross(velocity);
        const h = hVec.length();
    
        const i = Math.acos(hVec.z / h); // Inclination
    
        const nVec = new THREE.Vector3(0, 0, 1).cross(hVec);
        let n = nVec.length(); // Change 'const' to 'let' here
    
        const eVec = (velocity.cross(hVec)).divideScalar(mu).sub(position.divideScalar(r));
        const e = eVec.length(); // Eccentricity
    
        let omega = Math.acos(nVec.x / n); // Longitude of ascending node
        if (nVec.y < 0) omega = 2 * Math.PI - omega;
    
        let w = Math.acos(nVec.dot(eVec) / (n * e)); // Argument of periapsis
        if (eVec.z < 0) w = 2 * Math.PI - w;
    
        let theta = Math.acos(eVec.dot(position) / (e * r)); // True anomaly
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
        // Calculate the acceleration due to gravity at a certain altitude
        return Constants.G * planetMass / Math.pow(planetRadius + altitude, 2);
    }

    static calculateDragForce(velocity, dragCoefficient, crossSectionalArea, atmosphericDensity) {
        // Calculate the drag force acting on an object
        return 0.5 * dragCoefficient * crossSectionalArea * atmosphericDensity * velocity * velocity;
    }

    static calculateAtmosphericDensity(altitude) {
        // Calculate the atmospheric density at a certain altitude
        const rho0 = 1.225; // kg/m^3 at sea level
        const H = 8500; // Scale height in meters
        return rho0 * Math.exp(-altitude / H);
    }

    static calculateEarthSurfaceVelocity(satellitePosition, earthRadius, earthRotationSpeed, earthInclination) {
        // Calculate the velocity of a satellite at the surface of the Earth
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
        const lonRad = THREE.MathUtils.degToRad(-longitude); // Reverse the sign of longitude
        const azimuthRad = THREE.MathUtils.degToRad(azimuth); // Use azimuth directly
        const angleOfAttackRad = THREE.MathUtils.degToRad(angleOfAttack); // Convert AoA to radians
    
        // WGS84 ellipsoid constants
        const a = 6378137.0;  // Semi-major axis in meters
        const b = 6356752.314245;  // Semi-minor axis in meters
        const e2 = 1 - (b * b) / (a * a);  // Eccentricity squared
    
        // Calculate prime vertical radius of curvature
        const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
    
        // Position in ECEF coordinates (adapted to Three.js axis conventions)
        const X = (N + altitude) * Math.cos(latRad) * Math.cos(lonRad);
        const Z = (N + altitude) * Math.cos(latRad) * Math.sin(lonRad);
        const Y = ((1 - e2) * N + altitude) * Math.sin(latRad);
    
        // Position vector
        let positionECI = new THREE.Vector3(X, Y, Z);
    
        // Up direction
        const up = new THREE.Vector3(X, Y, Z).normalize();
    
        // North direction
        const north = new THREE.Vector3(
            -Math.sin(latRad) * Math.cos(lonRad),
            Math.cos(latRad),
            -Math.sin(latRad) * Math.sin(lonRad)
        ).normalize();
    
        // East direction
        const east = new THREE.Vector3().crossVectors(north, up).normalize();
    
        // Compute the horizontal velocity vector in the local ENU frame based on the azimuth
        const horizontalVelocityENU = new THREE.Vector3(
            Math.cos(azimuthRad) * north.x + Math.sin(azimuthRad) * east.x,
            Math.cos(azimuthRad) * north.y + Math.sin(azimuthRad) * east.y,
            Math.cos(azimuthRad) * north.z + Math.sin(azimuthRad) * east.z
        ).normalize();
    
        // Compute the final velocity vector considering the angle of attack
        const velocityENU = new THREE.Vector3(
            horizontalVelocityENU.x * Math.cos(angleOfAttackRad) + up.x * Math.sin(angleOfAttackRad),
            horizontalVelocityENU.y * Math.cos(angleOfAttackRad) + up.y * Math.sin(angleOfAttackRad),
            horizontalVelocityENU.z * Math.cos(angleOfAttackRad) + up.z * Math.sin(angleOfAttackRad)
        ).multiplyScalar(velocity);
    
        // Correction quaternion for -90 degrees around the y-axis
        const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    
        // Apply correction quaternion to position and velocity vectors
        positionECI.applyQuaternion(correctionQuaternion);
        velocityENU.applyQuaternion(correctionQuaternion);
    
        // Apply Earth's tilt quaternion to position and velocity vectors
        positionECI.applyQuaternion(tiltQuaternion);
        velocityENU.applyQuaternion(tiltQuaternion);
    
        // Apply Earth's rotation quaternion to position and velocity vectors
        positionECI.applyQuaternion(earthQuaternion);
        velocityENU.applyQuaternion(earthQuaternion);
    
        // Convert position and velocity to CANNON vectors
        const position = new CANNON.Vec3(positionECI.x, positionECI.y, positionECI.z);
        const velocityECEF = new CANNON.Vec3(velocityENU.x, velocityENU.y, velocityENU.z);
    
        return { positionECEF: position, velocityECEF: velocityECEF };
    }
}
