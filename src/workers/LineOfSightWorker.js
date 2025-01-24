// Worker for calculating line of sight between satellites
import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';

let satellites = [];
const EARTH_RADIUS = Constants.earthRadius * Constants.metersToKm * Constants.scale; // Convert to simulation units
const ATMOSPHERE_HEIGHT = 100 * Constants.scale; // Approximately 1000km atmosphere height for better visibility

self.onmessage = function (e) {
    if (e.data.type === 'UPDATE_SATELLITES') {
        satellites = e.data.satellites;
        calculateLineOfSight();
    } else if (e.data.type === 'UPDATE_BODIES') {
        // Update positions of celestial bodies if needed
        calculateLineOfSight();
    }
};

function calculateLineOfSight() {
    const connections = [];

    // For each pair of satellites
    for (let i = 0; i < satellites.length; i++) {
        for (let j = i + 1; j < satellites.length; j++) {
            const sat1 = satellites[i];
            const sat2 = satellites[j];

            // Create vectors for the satellites and scale them
            const pos1 = new THREE.Vector3(
                sat1.position.x * Constants.metersToKm * Constants.scale,
                sat1.position.y * Constants.metersToKm * Constants.scale,
                sat1.position.z * Constants.metersToKm * Constants.scale
            );
            const pos2 = new THREE.Vector3(
                sat2.position.x * Constants.metersToKm * Constants.scale,
                sat2.position.y * Constants.metersToKm * Constants.scale,
                sat2.position.z * Constants.metersToKm * Constants.scale
            );

            // Calculate direction vector between satellites
            const direction = new THREE.Vector3().subVectors(pos2, pos1);
            const distance = direction.length();

            // Check intersection with Earth and atmosphere
            const earthCenter = new THREE.Vector3(0, 0, 0);
            const intersectsEarth = checkSphereIntersection(pos1, direction.normalize(), earthCenter, EARTH_RADIUS, distance);
            const intersectsAtmosphere = checkSphereIntersection(pos1, direction.normalize(), earthCenter, EARTH_RADIUS + ATMOSPHERE_HEIGHT, distance);

            // Add connection if it doesn't intersect Earth
            if (!intersectsEarth) {
                connections.push({
                    from: sat1.id,
                    to: sat2.id,
                    points: [
                        [pos1.x, pos1.y, pos1.z],
                        [pos2.x, pos2.y, pos2.z]
                    ],
                    color: intersectsAtmosphere ? 'red' : 'green'
                });
            }
        }
    }

    // Send the connections back to the main thread
    self.postMessage({
        type: 'CONNECTIONS_UPDATED',
        connections: connections
    });
}

function checkSphereIntersection(rayOrigin, rayDirection, sphereCenter, sphereRadius, maxDistance) {
    // Calculate coefficients for quadratic equation
    const oc = rayOrigin.clone().sub(sphereCenter);
    const a = rayDirection.dot(rayDirection);
    const b = 2.0 * oc.dot(rayDirection);
    const c = oc.dot(oc) - sphereRadius * sphereRadius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
        return false;
    }

    // Calculate intersection points
    const t1 = (-b - Math.sqrt(discriminant)) / (2.0 * a);
    const t2 = (-b + Math.sqrt(discriminant)) / (2.0 * a);

    // Check if intersection points are within the line segment
    return (t1 > 0 && t1 < maxDistance) || (t2 > 0 && t2 < maxDistance);
}
