// Worker for managing orbit path for satellites

console.log('[orbitPathWorker] Worker loaded');

// Map of satellite id -> orbit path points array
let orbitPathMap = {};

// Import PhysicsUtils and THREE dynamically (for worker context)
let PhysicsUtils = null;
let Constants = null;
let THREE = null;

async function ensureUtils() {
    if (!PhysicsUtils || !THREE) {
        const utils = await import('../utils/PhysicsUtils.js');
        PhysicsUtils = utils.PhysicsUtils;
        Constants = (await import('../utils/Constants.js')).Constants;
        THREE = (await import('three')).default || (await import('three'));
    }
}

self.onmessage = async function (e) {
    await ensureUtils();
    if (e.data.type === 'UPDATE_ORBIT') {
        const { id, position, velocity, bodies, period, numPoints, seq } = e.data;
        if (id === undefined || id === null) return;
        // Convert to THREE.Vector3
        const pos = new THREE.Vector3(position.x, position.y, position.z);
        const vel = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
        let points3D;
        // Multi-body propagation if bodies and period provided
        if (Array.isArray(bodies) && bodies.length > 0 && period != null && numPoints != null) {
            // Prepare bodies for propagation
            const gravBodies = bodies.map(b => ({ position: new THREE.Vector3(b.position.x, b.position.y, b.position.z), mass: b.mass }));
            points3D = PhysicsUtils.propagateOrbit(pos, vel, gravBodies, period, numPoints);
        } else {
            // Fallback to two-body elliptical orbit
            const mu = Constants.G * Constants.earthMass;
            const elements = PhysicsUtils.calculateOrbitalElements(pos, vel, mu);
            if (!elements) return;
            // Use provided numPoints or default to 180
            const count = numPoints != null ? numPoints : 180;
            points3D = PhysicsUtils.computeOrbit(elements, mu, count);
        }
        orbitPathMap[id] = points3D.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }));
        self.postMessage({
            type: 'ORBIT_PATH_UPDATE',
            id,
            orbitPoints: orbitPathMap[id],
            seq
        });
    } else if (e.data.type === 'RESET') {
        if (e.data.id) {
            delete orbitPathMap[e.data.id];
        } else {
            orbitPathMap = {};
        }
        console.log('[orbitPathWorker] Reset orbit path map');
    }
}; 