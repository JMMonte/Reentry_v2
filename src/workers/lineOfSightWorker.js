// Worker for calculating line of sight between satellites
// Removed heavy THREE import, keeping only Constants for math
import { earthRadius } from '../physics/bodies/planets/Earth.js';
import { moonRadius } from '../physics/bodies/moons/EarthMoons.js';

let satellites = [];
let moonPosition = { x: 0, y: 0, z: 0 };
const EARTH_RADIUS = earthRadius; // in km
const ATMOSPHERE_HEIGHT = 100; // 100 km
const MOON_RADIUS = moonRadius;

self.onmessage = function (e) {
    if (e.data.type === 'UPDATE_SATELLITES') {
        satellites = e.data.satellites;
        calculateLineOfSight();
    } else if (e.data.type === 'UPDATE_BODIES') {
        // Update positions of celestial bodies if needed
        if (e.data.moonPosition) {
            moonPosition = e.data.moonPosition;
        }
        calculateLineOfSight();
    }
};

// Compute line of sight using plain JS vector math
function calculateLineOfSight() {
    const connections = [];
    for (let i = 0; i < satellites.length; i++) {
        for (let j = i + 1; j < satellites.length; j++) {
            const a = satellites[i], b = satellites[j];
            const ox = a.position.x, oy = a.position.y, oz = a.position.z;
            const dx = b.position.x - ox, dy = b.position.y - oy, dz = b.position.z - oz;
            const dist = Math.hypot(dx, dy, dz);
            if (dist <= 0) continue;
            const invD = 1 / dist;
            const rdx = dx * invD, rdy = dy * invD, rdz = dz * invD;
            const hitEarth = sphereIntersect(ox, oy, oz, rdx, rdy, rdz, 0, 0, 0, EARTH_RADIUS, dist);
            const hitAtmos = sphereIntersect(ox, oy, oz, rdx, rdy, rdz, 0, 0, 0, EARTH_RADIUS + ATMOSPHERE_HEIGHT, dist);
            const hitMoon = sphereIntersect(ox, oy, oz, rdx, rdy, rdz, moonPosition.x, moonPosition.y, moonPosition.z, MOON_RADIUS, dist);
            if (!hitEarth && !hitMoon) {
                connections.push({
                    from: a.id,
                    to: b.id,
                    points: [[ox, oy, oz], [b.position.x, b.position.y, b.position.z]],
                    color: hitAtmos ? 'red' : 'green'
                });
            }
        }
    }
    self.postMessage({ type: 'CONNECTIONS_UPDATED', connections });
}

// Ray-sphere intersection: returns true if the ray intersects the sphere within maxDistance
function sphereIntersect(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius, maxDistance) {
    const ocx = ox - cx, ocy = oy - cy, ocz = oz - cz;
    const b = 2 * (ocx * dx + ocy * dy + ocz * dz);
    const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius;
    const disc = b * b - 4 * c;
    if (disc < 0) return false;
    const sd = Math.sqrt(disc);
    const t1 = (-b - sd) * 0.5;
    const t2 = (-b + sd) * 0.5;
    return (t1 > 0 && t1 < maxDistance) || (t2 > 0 && t2 < maxDistance);
}
