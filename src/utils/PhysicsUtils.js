import { Constants } from './Constants.js';
import * as THREE from 'three';

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
        const n = nVec.length();

        const eVec = (velocity.cross(hVec)).divideScalar(mu).sub(position.divideScalar(r));
        const e = eVec.length(); // Eccentricity

        const omega = Math.acos(nVec.x / n); // Longitude of ascending node
        if (nVec.y < 0) omega = 2 * Math.PI - omega;

        const w = Math.acos(nVec.dot(eVec) / (n * e)); // Argument of periapsis
        if (eVec.z < 0) w = 2 * Math.PI - w;

        const theta = Math.acos(eVec.dot(position) / (e * r)); // True anomaly
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
}
