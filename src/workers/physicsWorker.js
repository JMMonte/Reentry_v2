import { Constants } from '../utils/Constants.js';
import { adaptiveIntegrate, computeDragAcceleration } from '../utils/OrbitIntegrator.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import * as THREE from 'three';

let satellites = [];
let manuallyManagedSatellites = []; // To store satellites managed manually
// --- Simulation loop state ---
let simulationInterval = null;
let lastSimTime = null;
let timeWarp = 1; // Default time warp
let earthPosition = { x: 0, y: 0, z: 0 };
let moonPosition = { x: 0, y: 0, z: 0 };
let sunPosition = { x: 0, y: 0, z: 0 };
// Scale factor for third-body perturbations (Moon and Sun)
let perturbationScale = 1.0;

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
        case 'setPerturbationScale':
            // Scale for Moon/Sun perturbations (0 to 1)
            perturbationScale = Number(data.value);
            break;
        case 'setTimeStep':
            // Update integration time step (in seconds) for adaptive integrator
            Constants.timeStep = Number(data.value);
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

    // Adaptive integration per satellite over warpedDeltaTime using shared integrator
    const bodiesArray = [
        { position: earthPosition, mass: Constants.earthMass },
        { position: moonPosition, mass: Constants.moonMass },
        { position: sunPosition, mass: Constants.sunMass }
    ];
    satellites.forEach(satellite => {
        const posArr = satellite.position;
        const velArr = satellite.velocity;
        const { pos, vel } = adaptiveIntegrate(posArr, velArr, warpedDeltaTime, bodiesArray, perturbationScale);
        satellite.position = pos;
        satellite.velocity = vel;

        // Compute drag data
        const r = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]);
        const altitude = r - Constants.earthRadius;
        const density = PhysicsUtils.calculateAtmosphericDensity(altitude);
        const omega = 2 * Math.PI / Constants.siderialDay;
        const vAtmX = -omega * pos[1];
        const vAtmY = omega * pos[0];
        const relativeVelocity = { x: vel[0] - vAtmX, y: vel[1] - vAtmY, z: vel[2] };
        const dragArr = computeDragAcceleration(posArr, velArr);
        const dragAcceleration = { x: dragArr[0], y: dragArr[1], z: dragArr[2] };

        // Compute apsis data
        const posVec = new THREE.Vector3(pos[0], pos[1], pos[2]);
        const velVec = new THREE.Vector3(vel[0], vel[1], vel[2]);
        const apsisData = PhysicsUtils.calculateDetailedOrbitalElements(
            posVec,
            velVec,
            Constants.earthGravitationalParameter
        );

        // Compute perturbations: gravitational acceleration and force breakdown
        const G = Constants.G;
        const massSat = satellite.mass;
        const x = pos[0], y = pos[1], z = pos[2];
        // Earth
        const muE = G * Constants.earthMass;
        const rMagE = Math.sqrt(x*x + y*y + z*z);
        const aEarth = { x: -x * muE / Math.pow(rMagE,3), y: -y * muE / Math.pow(rMagE,3), z: -z * muE / Math.pow(rMagE,3) };
        // Moon
        const moonPos = bodiesArray[1].position;
        const dxM = moonPos.x - x, dyM = moonPos.y - y, dzM = moonPos.z - z;
        const rMagM = Math.sqrt(dxM*dxM + dyM*dyM + dzM*dzM);
        let aMoon = { x: 0, y: 0, z: 0 };
        if (rMagM > 0) {
            const muM = G * Constants.moonMass;
            aMoon = { x: dxM * muM / Math.pow(rMagM,3), y: dyM * muM / Math.pow(rMagM,3), z: dzM * muM / Math.pow(rMagM,3) };
        }
        // Sun
        const sunPos = bodiesArray[2].position;
        const dxS = sunPos.x - x, dyS = sunPos.y - y, dzS = sunPos.z - z;
        const rMagS = Math.sqrt(dxS*dxS + dyS*dyS + dzS*dzS);
        let aSun = { x: 0, y: 0, z: 0 };
        if (rMagS > 0) {
            const muS = G * Constants.sunMass;
            aSun = { x: dxS * muS / Math.pow(rMagS,3), y: dyS * muS / Math.pow(rMagS,3), z: dzS * muS / Math.pow(rMagS,3) };
        }
        // Total acceleration and force
        const totalAcc = { x: aEarth.x + aMoon.x + aSun.x, y: aEarth.y + aMoon.y + aSun.y, z: aEarth.z + aMoon.z + aSun.z };
        const forceEarth = { x: aEarth.x * massSat, y: aEarth.y * massSat, z: aEarth.z * massSat };
        const forceMoon  = { x: aMoon.x  * massSat, y: aMoon.y  * massSat, z: aMoon.z  * massSat };
        const forceSun   = { x: aSun.x   * massSat, y: aSun.y   * massSat, z: aSun.z   * massSat };
        const totalForce = { x: forceEarth.x + forceMoon.x + forceSun.x, y: forceEarth.y + forceMoon.y + forceSun.y, z: forceEarth.z + forceMoon.z + forceSun.z };
        const perturbation = {
            acc:   { total: totalAcc, earth: aEarth, moon: aMoon, sun: aSun },
            force: { total: totalForce, earth: forceEarth, moon: forceMoon, sun: forceSun }
        };
        // Attach all debug metrics
        satellite.debug = { dragData: { altitude, density, relativeVelocity, dragAcceleration }, apsisData, perturbation };
    });

    // Send all satellite updates (no orbits)
    self.postMessage({
        type: 'satellitesUpdate',
        data: satellites.map(sat => ({
            id: sat.id,
            position: sat.position,
            velocity: sat.velocity,
            debug: sat.debug
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
