import * as CANNON from 'cannon-es';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { Constants } from '../utils/Constants.js';

let world, satellites = [], earthMass, moonMass;
let manuallyManagedSatellites = []; // To store satellites managed manually
let timeStep = 0.01; // Default time step for high precision
let precision = 'high';

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
        case 'step':
            if (world) {
                stepPhysics(data);
            } else {
                console.error('Physics world is not initialized. Please send an "init" message first.');
            }
            break;
        case 'addSatellite':
            addSatellite(data);
            break;
        case 'removeSatellite':
            removeSatellite(data.id);
            break;
        case 'setPrecision':
            setPrecision(data);
            break;
        default:
            console.error('Unknown message type:', type);
    }
};

function initPhysics(data) {
    world = new CANNON.World();
    world.gravity.set(0, 0, 0);
    Object.assign(Constants, data);
    satellites = [];
    // Notify that initialization is complete
    self.postMessage({
        type: 'initialized'
    });
}

function stepPhysics(data) {
    const { realDeltaTime, earthPosition, earthRadius, moonPosition, timeWarp } = data;
    const warpedDeltaTime = realDeltaTime * timeWarp;

    if (warpedDeltaTime <= 0 || satellites.length === 0) {
        return;
    }

    // Cap the maximum time step to prevent instability, but subdivide into smaller steps for high time warps
    const maxTimeStep = 1.0; // 1 second
    const numSteps = Math.ceil(warpedDeltaTime / maxTimeStep);
    const subTimeStep = warpedDeltaTime / numSteps;

    // Run multiple smaller steps to maintain accuracy
    for (let i = 0; i < numSteps; i++) {
        satellites.forEach(satellite => {
            // Calculate gravitational forces
            const satPos = satellite.position;

            // Convert Earth and Moon positions from scaled km to meters
            const earthPosMeters = {
                x: earthPosition.x / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters,
                y: earthPosition.y / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters,
                z: earthPosition.z / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters
            };

            const moonPosMeters = {
                x: moonPosition.x / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters,
                y: moonPosition.y / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters,
                z: moonPosition.z / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters
            };

            // Force from Earth (all calculations in meters)
            const earthForce = calculateGravitationalForce(
                satellite.mass,
                Constants.earthMass,
                satPos,
                earthPosMeters
            );

            // Force from Moon (all calculations in meters)
            const moonForce = calculateGravitationalForce(
                satellite.mass,
                Constants.moonMass,
                satPos,
                moonPosMeters
            );

            // Total acceleration (F = ma, so a = F/m) in m/s²
            const totalAccel = {
                x: (earthForce.x + moonForce.x) / satellite.mass,
                y: (earthForce.y + moonForce.y) / satellite.mass,
                z: (earthForce.z + moonForce.z) / satellite.mass
            };

            // Update velocity (a * dt) in m/s
            satellite.velocity[0] += totalAccel.x * subTimeStep;
            satellite.velocity[1] += totalAccel.y * subTimeStep;
            satellite.velocity[2] += totalAccel.z * subTimeStep;

            // Update position (v * dt) in meters
            satellite.position[0] += satellite.velocity[0] * subTimeStep;
            satellite.position[1] += satellite.velocity[1] * subTimeStep;
            satellite.position[2] += satellite.velocity[2] * subTimeStep;

            // Send update to main thread (positions and velocities in meters)
            self.postMessage({
                type: 'satelliteUpdate',
                data: {
                    id: satellite.id,
                    position: satellite.position,
                    velocity: satellite.velocity
                }
            });
        });
    }
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

function calculateGravitationalForce(mass1, mass2, pos1, pos2) {
    const dx = pos2.x - pos1[0];
    const dy = pos2.y - pos1[1];
    const dz = pos2.z - pos1[2];

    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Use the centralized function to calculate the force magnitude
    const forceMagnitude = PhysicsUtils.calculateGravitationalForce(mass1, mass2, distance);

    // Unit vector components
    const ux = dx / distance;
    const uy = dy / distance;
    const uz = dz / distance;

    return {
        x: forceMagnitude * ux,
        y: forceMagnitude * uy,
        z: forceMagnitude * uz
    };
}

function setPrecision(data) {
    timeStep = data.timeStep || 0.01; // Set the time step for desired precision
    precision = data.precision || 'high';
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
