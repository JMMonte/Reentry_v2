// Worker for managing orbit path for satellites

console.log('[orbitPathWorker] Worker loaded');

// Map of satellite id -> orbit path points array
let orbitPathMap = {};

// Import PhysicsUtils dynamically (for worker context)
let PhysicsUtils = null;
let Constants = null;

async function ensureUtils() {
    if (!PhysicsUtils) {
        const utils = await import('../utils/PhysicsUtils.js');
        PhysicsUtils = utils.PhysicsUtils;
        Constants = (await import('../utils/Constants.js')).Constants;
    }
}

self.onmessage = async function (e) {
    await ensureUtils();
    if (e.data.type === 'UPDATE_ORBIT') {
        const { id, position, velocity, constants } = e.data;
        if (id === undefined || id === null) return;
        // Update constants if provided
        if (constants) Object.assign(Constants, constants);
        // Convert to THREE.Vector3
        const pos = new self.THREE.Vector3(position.x, position.y, position.z);
        const vel = new self.THREE.Vector3(velocity.x, velocity.y, velocity.z);
        const mu = Constants.G * Constants.earthMass;
        const elements = PhysicsUtils.calculateOrbitalElements(pos, vel, mu);
        if (!elements) return;
        const orbitPoints = PhysicsUtils.computeOrbit(elements, mu, 180);
        orbitPathMap[id] = orbitPoints.map(pt => ({ x: pt.x, y: pt.y, z: pt.z }));
        self.postMessage({
            type: 'ORBIT_PATH_UPDATE',
            id,
            orbitPoints: orbitPathMap[id]
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