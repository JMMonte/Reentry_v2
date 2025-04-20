import { Constants } from '../utils/Constants.js';

let satellites = [];
let manuallyManagedSatellites = []; // To store satellites managed manually
// --- Simulation loop state ---
let simulationInterval = null;
let lastSimTime = null;
let timeWarp = 1; // Default time warp
let earthPosition = { x: 0, y: 0, z: 0 };
let moonPosition = { x: 0, y: 0, z: 0 };
let sunPosition = { x: 0, y: 0, z: 0 };

self.onmessage = function (event) {
    let messageData;

    if (typeof event.data === 'string') {
        try {
            messageData = JSON.parse(event.data);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return;
        }
    } else {
        messageData = event.data;
    }

    const { type, data } = messageData;

    switch (type) {
        case 'init':
            initPhysics(data);
            break;
        case 'addSatellite':
            addSatellite(data);
            break;
        case 'removeSatellite':
            removeSatellite(data.id);
            break;
        case 'setTimeWarp':
            timeWarp = Number(data.value);
            break;
        case 'updateBodies':
            // Update earth/moon positions from main thread
            if (data.earthPosition) earthPosition = data.earthPosition;
            if (data.moonPosition) moonPosition = data.moonPosition;
            if (data.sunPosition) sunPosition = data.sunPosition;
            break;
        default:
            console.error('Unknown message type:', type);
    }
};

function initPhysics(data) {
    Object.assign(Constants, data);
    satellites = [];
    // Set initial earth/moon positions if provided
    if (data.earthPosition) earthPosition = data.earthPosition;
    if (data.moonPosition) moonPosition = data.moonPosition;
    // Notify that initialization is complete
    self.postMessage({
        type: 'initialized'
    });
    // Start simulation loop (30 Hz)
    if (simulationInterval) clearInterval(simulationInterval);
    lastSimTime = Date.now();
    simulationInterval = setInterval(simulationLoop, 1000 / 30);
}

function simulationLoop() {
    if (satellites.length === 0) return;
    const now = Date.now();
    const realDeltaTime = (now - lastSimTime) / 1000;
    lastSimTime = now;
    const warpedDeltaTime = realDeltaTime * timeWarp;
    if (warpedDeltaTime <= 0) return;
    const maxTimeStep = 1.0; // 1 second
    const numSteps = Math.ceil(warpedDeltaTime / maxTimeStep);
    const subTimeStep = warpedDeltaTime / numSteps;
    // Helper: compute acceleration (m/s^2) due to Earth & Moon at given position array
    function computeAccel(mass, posArr) {
        // positions from main thread are in meters
        const [px, py, pz] = posArr;
        // vector from satellite to Earth
        const dxE = earthPosition.x - px, dyE = earthPosition.y - py, dzE = earthPosition.z - pz;
        const rE2 = dxE*dxE + dyE*dyE + dzE*dzE;
        const rE = Math.sqrt(rE2);
        const fE = Constants.G * mass * Constants.earthMass / rE2;
        const uxE = dxE / rE, uyE = dyE / rE, uzE = dzE / rE;
        // vector from satellite to Moon
        const dxM = moonPosition.x - px, dyM = moonPosition.y - py, dzM = moonPosition.z - pz;
        const rM2 = dxM*dxM + dyM*dyM + dzM*dzM;
        const rM = Math.sqrt(rM2);
        const fM = Constants.G * mass * Constants.moonMass / rM2;
        const uxM = dxM / rM, uyM = dyM / rM, uzM = dzM / rM;
        // vector from satellite to Sun
        const dxS = sunPosition.x - px, dyS = sunPosition.y - py, dzS = sunPosition.z - pz;
        const rS2 = dxS*dxS + dyS*dyS + dzS*dzS;
        const rS = Math.sqrt(rS2);
        const fS = Constants.G * mass * Constants.sunMass / rS2;
        const uxS = dxS / rS, uyS = dyS / rS, uzS = dzS / rS;
        // Sum accelerations, then divide by satellite mass
        const ax = (fE*uxE + fM*uxM + fS*uxS) / mass;
        const ay = (fE*uyE + fM*uyM + fS*uyS) / mass;
        const az = (fE*uzE + fM*uzM + fS*uzS) / mass;
        return { x: ax, y: ay, z: az };
    }
    for (let i = 0; i < numSteps; i++) {
        satellites.forEach(satellite => {
            const m = satellite.mass;
            const h = subTimeStep;
            // initial state
            const p0 = satellite.position;
            const v0 = satellite.velocity;
            // k1
            const a0 = computeAccel(m, p0);
            const k1p = [v0[0], v0[1], v0[2]];
            const k1v = [a0.x, a0.y, a0.z];
            // k2
            const p1 = [p0[0] + k1p[0]*h/2, p0[1] + k1p[1]*h/2, p0[2] + k1p[2]*h/2];
            const v1 = [v0[0] + k1v[0]*h/2, v0[1] + k1v[1]*h/2, v0[2] + k1v[2]*h/2];
            const a1 = computeAccel(m, p1);
            const k2p = [v1[0], v1[1], v1[2]];
            const k2v = [a1.x, a1.y, a1.z];
            // k3
            const p2 = [p0[0] + k2p[0]*h/2, p0[1] + k2p[1]*h/2, p0[2] + k2p[2]*h/2];
            const v2 = [v0[0] + k2v[0]*h/2, v0[1] + k2v[1]*h/2, v0[2] + k2v[2]*h/2];
            const a2 = computeAccel(m, p2);
            const k3p = [v2[0], v2[1], v2[2]];
            const k3v = [a2.x, a2.y, a2.z];
            // k4
            const p3 = [p0[0] + k3p[0]*h, p0[1] + k3p[1]*h, p0[2] + k3p[2]*h];
            const v3 = [v0[0] + k3v[0]*h, v0[1] + k3v[1]*h, v0[2] + k3v[2]*h];
            const a3 = computeAccel(m, p3);
            const k4p = [v3[0], v3[1], v3[2]];
            const k4v = [a3.x, a3.y, a3.z];
            // integrate
            const c = h/6;
            satellite.position[0] += c*(k1p[0] + 2*k2p[0] + 2*k3p[0] + k4p[0]);
            satellite.position[1] += c*(k1p[1] + 2*k2p[1] + 2*k3p[1] + k4p[1]);
            satellite.position[2] += c*(k1p[2] + 2*k2p[2] + 2*k3p[2] + k4p[2]);
            satellite.velocity[0] += c*(k1v[0] + 2*k2v[0] + 2*k3v[0] + k4v[0]);
            satellite.velocity[1] += c*(k1v[1] + 2*k2v[1] + 2*k3v[1] + k4v[1]);
            satellite.velocity[2] += c*(k1v[2] + 2*k2v[2] + 2*k3v[2] + k4v[2]);
        });
    }
    // Send all satellite updates (no orbits)
    self.postMessage({
        type: 'satellitesUpdate',
        data: satellites.map(sat => ({
            id: sat.id,
            position: sat.position,
            velocity: sat.velocity
        }))
    });
}

function addSatellite(data) {
    const { id, mass, size, position, velocity } = data;

    // Convert position and velocity to arrays if they're not already
    const posArray = Array.isArray(position) ? position :
        position.toArray ? position.toArray() :
            [position.x, position.y, position.z];

    const velArray = Array.isArray(velocity) ? velocity :
        velocity.toArray ? velocity.toArray() :
            [velocity.x, velocity.y, velocity.z];

    // Create satellite object
    const satellite = {
        id,
        mass,
        size,
        position: posArray,
        velocity: velArray
    };

    satellites.push(satellite);

    // Send confirmation
    self.postMessage({
        type: 'satelliteAdded',
        data: { id }
    });
}

function removeSatellite(id) {
    const index = satellites.findIndex(sat => sat.id === id);
    if (index !== -1) {
        satellites.splice(index, 1);
    }

    // Also remove from manually managed satellites if it exists there
    const managedIndex = manuallyManagedSatellites.findIndex(sat => sat.id === id);
    if (managedIndex !== -1) {
        manuallyManagedSatellites.splice(managedIndex, 1);
    }
}
