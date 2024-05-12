import { Constants } from './Constants.js';
import * as THREE from 'three';

export class PhysicsUtils {
    static calculateGravitationalForce(m1, m2, r) {
        // Calculate the gravitational force between two masses
        // F = G * (m1 * m2) / r^2
        // G is the gravitational constant in m^3 kg^-1 s^-2
        // m1 and m2 are the masses of the two objects in kg
        // r is the distance between the centers of the two objects in meters
        return Constants.G * (m1 * m2) / (r * r);
    }

    static calculateOrbitalVelocity(mass, radius) {
        // Calculate the orbital velocity needed for a circular orbit
        // v = sqrt(G * M / r)
        // G is the gravitational constant in m^3 kg^-1 s^-2
        // M is the mass of the central body in kg
        // r is the distance from the center of the central body in meters
        return Math.sqrt(Constants.G * mass / radius);
    }

    static calculateEscapeVelocity(mass, radius) {
        // Calculate the escape velocity from a body
        // v = sqrt(2 * G * M / r)
        // G is the gravitational constant in m^3 kg^-1 s^-2
        // M is the mass of the body in kg
        // r is the radius of the body in meters
        return Math.sqrt(2 * Constants.G * mass / radius);
    }

    static calculateGravityAcceleration(mass, radius) {
        // Calculate the acceleration due to gravity at a certain radius
        // a = G * M / r^2
        // G is the gravitational constant in m^3 kg^-1 s^-2
        // M is the mass of the body in kg
        // r is the distance from the center of the body in meters
        return Constants.G * mass / (radius * radius);
    }

    static calculateAcceleration(force, mass) {
        // Calculate acceleration from a force and mass
        // F = m * a
        // a = F / m
        // F is the force in Newtons
        // m is the mass in kg
        // a is the acceleration in m/s^2
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

    static computeOrbit({h, e, i, omega, w, theta}, mu, numPoints = 100) {
        const points = [];
        const step = 2 * Math.PI / numPoints;

        for (let f = 0; f < 2 * Math.PI; f += step) {
            let r = (h * h / mu) / (1 + e * Math.cos(f));
            const oX = r * (Math.cos(omega) * Math.cos(w + f) - Math.sin(omega) * Math.sin(w + f) * Math.cos(i));
            const oY = r * (Math.sin(omega) * Math.cos(w + f) + Math.cos(omega) * Math.sin(w + f) * Math.cos(i));
            const oZ = r * (Math.sin(i) * Math.sin(w + f));
            points.push(new THREE.Vector3(oX, oY, oZ));
        }

        return points;
    }

    static calculateVerticalAcceleration(planetRadius, planetMass, altitude) {
        // Calculate the acceleration due to gravity at a certain altitude
        // a = G * M / (r + h)^2
        // G is the gravitational constant in m^3 kg^-1 s^-2
        // M is the mass of the body in kg
        // r is the radius of the body in meters
        // h is the altitude in meters
        return Constants.G * planetMass / Math.pow(planetRadius + altitude, 2);
    }
}
