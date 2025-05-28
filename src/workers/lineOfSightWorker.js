// Worker for calculating line of sight between satellites
// Removed heavy THREE import, keeping only Constants for math

let satellites = [];
let bodies = [];

self.onmessage = function (e) {
    if (e.data.type === 'UPDATE_SCENE') {
        satellites = e.data.satellites || [];
        bodies = e.data.bodies || [];
        calculateLineOfSight();
    }
};

// Compute line of sight using plain JS vector math and all bodies as occluders
function calculateLineOfSight() {
    const connections = [];
    for (let i = 0; i < satellites.length; i++) {
        for (let j = i + 1; j < satellites.length; j++) {
            const a = satellites[i], b = satellites[j];
            const ox = a.position[0], oy = a.position[1], oz = a.position[2];
            const dx = b.position[0] - ox, dy = b.position[1] - oy, dz = b.position[2] - oz;
            const dist = Math.hypot(dx, dy, dz);
            if (dist <= 0) continue;
            const invD = 1 / dist;
            const rdx = dx * invD, rdy = dy * invD, rdz = dz * invD;

            let blocked = false;
            for (const body of bodies) {
                // Optionally skip satellites themselves if they are in the bodies list
                if (body.id === a.id || body.id === b.id) continue;
                if (sphereIntersect(ox, oy, oz, rdx, rdy, rdz, body.position[0], body.position[1], body.position[2], body.radius, dist)) {
                    blocked = true;
                    break;
                }
            }

            if (!blocked) {
                connections.push({
                    from: a.id,
                    to: b.id,
                    points: [a.position, b.position],
                    color: 'green'
                });
            } else {
                // Optionally, you could push blocked connections with info
                // connections.push({ from: a.id, to: b.id, blockedBy: blockedBy.id, color: 'red' });
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
