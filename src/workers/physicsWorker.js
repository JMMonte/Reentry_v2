import * as CANNON from 'cannon-es';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { Constants } from '../utils/Constants.js';
import * as THREE from 'three';

let world, satellites = [], earthMass, moonMass;
let manuallyManagedSatellites = []; // To store satellites managed manually
let lastSimulatedTime = null;

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
    const { simulatedTime, earthPosition, moonPosition } = data;

    if (satellites.length === 0) return;

    // Calculate time step
    if (!lastSimulatedTime) {
        lastSimulatedTime = simulatedTime;
        return;
    }

    // Time step in seconds
    const dt = (simulatedTime - lastSimulatedTime) / 1000;
    lastSimulatedTime = simulatedTime;

    if (dt <= 0) return;

    // Process each satellite
    satellites.forEach(satellite => {
        // Create position vectors for calculations
        const satPos = new THREE.Vector3(
            satellite.position[0],
            satellite.position[1],
            satellite.position[2]
        );

        const earthPos = new THREE.Vector3(
            earthPosition.x,
            earthPosition.y,
            earthPosition.z
        );

        const moonPos = new THREE.Vector3(
            moonPosition.x,
            moonPosition.y,
            moonPosition.z
        );

        // Calculate distances
        const earthDistance = satPos.distanceTo(earthPos);
        const moonDistance = satPos.distanceTo(moonPos);

        // Calculate accelerations using PhysicsUtils
        const earthAccel = PhysicsUtils.calculateGravityAcceleration(Constants.earthMass, earthDistance);
        const moonAccel = PhysicsUtils.calculateGravityAcceleration(Constants.moonMass, moonDistance);

        // Calculate direction vectors
        const earthDir = earthPos.clone().sub(satPos).normalize();
        const moonDir = moonPos.clone().sub(satPos).normalize();

        // Apply accelerations in the correct directions
        const totalAccel = new THREE.Vector3();
        totalAccel.addScaledVector(earthDir, earthAccel);
        totalAccel.addScaledVector(moonDir, moonAccel);

        // Update velocity (km/s)
        satellite.velocity[0] += totalAccel.x * dt;
        satellite.velocity[1] += totalAccel.y * dt;
        satellite.velocity[2] += totalAccel.z * dt;

        // Update position (km)
        satellite.position[0] += satellite.velocity[0] * dt;
        satellite.position[1] += satellite.velocity[1] * dt;
        satellite.position[2] += satellite.velocity[2] * dt;

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
    // All positions are in meters here
    const dx = pos2.x - pos1[0];
    const dy = pos2.y - pos1[1];
    const dz = pos2.z - pos1[2];

    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    // G is in m³/kg/s², masses in kg, distance in m
    // This gives force in Newtons (kg⋅m/s²)
    const forceMagnitude = (Constants.G * mass1 * mass2) / (distance * distance);

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
