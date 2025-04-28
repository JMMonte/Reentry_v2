import { Constants } from '../utils/Constants.js';
import { adaptiveIntegrate, computeDragAcceleration } from '../utils/OrbitIntegrator.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import * as THREE from 'three';
// Declarations for satellites managed by the worker
let satellites = [];
let manuallyManagedSatellites = []; // To store satellites managed manually
// --- Simulation loop state ---
let simulationInterval = null;
let lastSimTime = null;
let timeWarp = 1; // Default time warp
// Scale factor for third-body perturbations (Moon and Sun)
let perturbationScale = 1.0;
// Dynamic bodies list supplied via updateBodies messages
let dynamicBodies = [];

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
            // Receive dynamic bodies list
            if (data.bodies) dynamicBodies = data.bodies;
            break;
        case 'setPerturbationScale':
            // Scale for Moon/Sun perturbations (0 to 1)
            perturbationScale = Number(data.value);
            break;
        case 'setTimeStep':
            // Update integration time step (in seconds) for adaptive integrator
            Constants.timeStep = Number(data.value);
            break;
        case 'setBallisticCoefficient':
            // Update drag ballistic coefficient
            Constants.ballisticCoefficient = Number(data.value);
            break;
        case 'setAtmosphereCutoffAltitude':
            // Update atmosphere cutoff altitude for drag
            Constants.atmosphereCutoffAltitude = Number(data.value);
            break;
        default:
            console.error('Unknown message type:', type);
    }
};

function initPhysics(data) {
    Object.assign(Constants, data);
    satellites = [];
    // dynamicBodies will be set via updateBodies messages
    // Set initial perturbation scale if provided
    if (data.perturbationScale !== undefined) perturbationScale = Number(data.perturbationScale);
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

    // Full RK45 integration and debug metrics
    const bodiesArray = dynamicBodies;  // each has {name, position, mass}
    satellites.forEach(satellite => {
        // per-satellite ballistic coefficient
        Constants.ballisticCoefficient = satellite.ballisticCoefficient;
        const posArr = satellite.position;
        const velArr = satellite.velocity;
        // integrate one step
        const { pos, vel } = adaptiveIntegrate(
            posArr, velArr, warpedDeltaTime,
            bodiesArray, perturbationScale
        );
        satellite.position = pos;
        satellite.velocity = vel;

        // drag debug
        const r = Math.hypot(pos[0], pos[1], pos[2]);
        const altitude = r - Constants.earthRadius;
        const density = PhysicsUtils.calculateAtmosphericDensity(altitude);
        const omega = 2 * Math.PI / Constants.siderialDay;
        const vAtmX = -omega * pos[1];
        const vAtmY = omega * pos[0];
        const relativeVelocity = { x: vel[0] - vAtmX, y: vel[1] - vAtmY, z: vel[2] };
        const dragArr = computeDragAcceleration(posArr, velArr, satellite.ballisticCoefficient);
        const dragAcceleration = { x: dragArr[0], y: dragArr[1], z: dragArr[2] };

        // normalized velocity vector for visualization
        const velMag = Math.hypot(vel[0], vel[1], vel[2]);
        const velDir = velMag
            ? { x: vel[0] / velMag, y: vel[1] / velMag, z: vel[2] / velMag }
            : { x: 0, y: 0, z: 0 };
        
        // apsis debug
        const posVec = new THREE.Vector3(...pos);
        const velVec = new THREE.Vector3(...vel);
        const apsisData = PhysicsUtils.calculateDetailedOrbitalElements(
            posVec, velVec, Constants.earthGravitationalParameter
        );

        // perturbation debug (per-body) with unit directions
        const G = Constants.G;
        const massSat = satellite.mass;
        let totalAcc = { x: 0, y: 0, z: 0 };
        let totalForce = { x: 0, y: 0, z: 0 };
        const accBreakdown = {};
        const forceBreakdown = {};
        const accDirBreakdown = {};
        bodiesArray.forEach(b => {
            const name = b.name;
            const dx = b.position.x - pos[0];
            const dy = b.position.y - pos[1];
            const dz = b.position.z - pos[2];
            const r2 = dx*dx + dy*dy + dz*dz;
            if (r2 === 0) return;
            const rLen = Math.sqrt(r2);
            const dir = { x: dx/rLen, y: dy/rLen, z: dz/rLen };
            const mu = G * b.mass;
            const aMag = mu / r2; // GM/r^2 magnitude
            const a = { x: dir.x * aMag, y: dir.y * aMag, z: dir.z * aMag };
            totalAcc.x += a.x; totalAcc.y += a.y; totalAcc.z += a.z;
            const f = { x: a.x * massSat, y: a.y * massSat, z: a.z * massSat };
            totalForce.x += f.x; totalForce.y += f.y; totalForce.z += f.z;
            accBreakdown[name] = a;
            forceBreakdown[name] = f;
            accDirBreakdown[name] = dir;
        });

        satellite.debug = {
            dragData: { altitude, density, relativeVelocity, dragAcceleration },
            apsisData,
            velDir,
            perturbation: {
                acc: { total: totalAcc, ...accBreakdown },
                accDir: accDirBreakdown,
                force: { total: totalForce, ...forceBreakdown }
            }
        };
    });

    // emit full debug data
    self.postMessage({
        type: 'satellitesUpdate',
        data: satellites.map(sat => ({ id: sat.id, position: sat.position, velocity: sat.velocity, debug: sat.debug }))
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
    // Derive ballistic coefficient per satellite: mass / (Cd * cross-sectional area)
    // Assume drag coefficient Cd = 2.2 for a sphere
    const area = Math.PI * size * size;
    const Cd = 2.2;
    satellite.ballisticCoefficient = mass / (Cd * area);

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
