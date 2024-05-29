import * as CANNON from 'cannon-es';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';

let world, satellites = [], earthMass, moonMass;
let manuallyManagedSatellites = []; // To store satellites managed manually

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
        case 'createSatellite':
            addSatellite(data);
            break;
        case 'removeSatellite':
            removeSatellite(data.id);
            break;
    }
};

function initPhysics(data) {
    world = new CANNON.World();
    world.gravity.set(0, 0, 0);
    earthMass = data.earthMass;
    moonMass = data.moonMass; // Initialize Moon's mass

    satellites = data.satellites.map(satData => {
        const satellite = {
            id: satData.id,
            body: new CANNON.Body({
                mass: satData.mass,
                position: new CANNON.Vec3(satData.position.x, satData.position.y, satData.position.z),
                shape: new CANNON.Sphere(satData.size)
            }),
            velocity: new CANNON.Vec3(satData.velocity.x, satData.velocity.y, satData.velocity.z),
            altitude: satData.altitude
        };

        satellite.body.linearDamping = 0;
        satellite.body.angularDamping = 0;

        satellite.body.velocity.copy(satellite.velocity);
        world.addBody(satellite.body);
        return satellite;
    });

    // Notify that initialization is complete
    self.postMessage({
        type: 'initComplete'
    });
}

function stepPhysics(data) {
    const { currentTime, warpedDeltaTime, earthPosition, earthRadius, moonPosition } = data;
    if (warpedDeltaTime <= 0) {
        console.error('Invalid warpedDeltaTime:', warpedDeltaTime);
        return;
    }

    // Update positions and velocities using Runge-Kutta
    satellites.forEach(satellite => {
        rungeKuttaStep(satellite, warpedDeltaTime, earthPosition, moonPosition, earthMass, moonMass, earthRadius);
        const satellitePosition = satellite.body.position;
        const distanceToEarth = satellitePosition.distanceTo(new CANNON.Vec3(earthPosition.x, earthPosition.y, earthPosition.z));
        const altitude = distanceToEarth - earthRadius;

        self.postMessage({
            type: 'stepComplete',
            data: {
                id: satellite.id,
                position: satellitePosition,
                velocity: satellite.body.velocity,
                altitude: altitude,
                earthGravity: calculateGravitationalForce(new CANNON.Vec3(earthPosition.x, earthPosition.y, earthPosition.z), satellitePosition, distanceToEarth, earthMass, satellite),
                moonGravity: calculateGravitationalForce(new CANNON.Vec3(moonPosition.x, moonPosition.y, moonPosition.z), satellitePosition, satellitePosition.distanceTo(new CANNON.Vec3(moonPosition.x, moonPosition.y, moonPosition.z)), moonMass, satellite),
                dragForce: calculateDragForce(altitude, satellite),
                currentTime: currentTime  // Include current time for synchronization
            }
        });
    });

    // Update positions of manually managed satellites (if any)
    manuallyManagedSatellites.forEach(managedSat => {
        updateManuallyManagedSatellite(managedSat, earthPosition, warpedDeltaTime);
        self.postMessage({
            type: 'stepComplete',
            data: {
                id: managedSat.id,
                position: managedSat.position,
                velocity: new CANNON.Vec3(0, 0, 0),
                altitude: managedSat.altitude,
                earthGravity: new CANNON.Vec3(0, 0, 0),
                moonGravity: new CANNON.Vec3(0, 0, 0),
                dragForce: new CANNON.Vec3(0, 0, 0),
                currentTime: currentTime  // Include current time for synchronization
            }
        });
    });
}

function rungeKuttaStep(satellite, dt, earthPosition, moonPosition, earthMass, moonMass, earthRadius) {
    const k1 = calculateDerivatives(satellite, { position: satellite.body.position, velocity: satellite.body.velocity }, earthPosition, moonPosition, earthMass, moonMass, earthRadius);
    const k2 = calculateDerivatives(satellite, { 
        position: satellite.body.position.vadd(k1.position.scale(dt / 2)), 
        velocity: satellite.body.velocity.vadd(k1.velocity.scale(dt / 2)) 
    }, earthPosition, moonPosition, earthMass, moonMass, earthRadius);
    const k3 = calculateDerivatives(satellite, { 
        position: satellite.body.position.vadd(k2.position.scale(dt / 2)), 
        velocity: satellite.body.velocity.vadd(k2.velocity.scale(dt / 2)) 
    }, earthPosition, moonPosition, earthMass, moonMass, earthRadius);
    const k4 = calculateDerivatives(satellite, { 
        position: satellite.body.position.vadd(k3.position.scale(dt)), 
        velocity: satellite.body.velocity.vadd(k3.velocity.scale(dt)) 
    }, earthPosition, moonPosition, earthMass, moonMass, earthRadius);

    const positionChange = k1.position.vadd(k2.position.scale(2)).vadd(k3.position.scale(2)).vadd(k4.position).scale(dt / 6);
    const velocityChange = k1.velocity.vadd(k2.velocity.scale(2)).vadd(k3.velocity.scale(2)).vadd(k4.velocity).scale(dt / 6);

    satellite.body.position.vadd(positionChange, satellite.body.position);
    satellite.body.velocity.vadd(velocityChange, satellite.body.velocity);
}

function calculateDerivatives(satellite, state, earthPosition, moonPosition, earthMass, moonMass, earthRadius) {
    const position = state.position;
    const velocity = state.velocity;
    const acceleration = calculateTotalAcceleration(satellite, position, earthPosition, moonPosition, earthMass, moonMass, earthRadius);

    return {
        position: velocity,
        velocity: acceleration
    };
}

function calculateTotalAcceleration(satellite, position, earthPosition, moonPosition, earthMass, moonMass, earthRadius) {
    const earthPos = new CANNON.Vec3(earthPosition.x, earthPosition.y, earthPosition.z);
    const moonPos = new CANNON.Vec3(moonPosition.x, moonPosition.y, moonPosition.z);

    const distanceToEarth = position.distanceTo(earthPos);
    const distanceToMoon = position.distanceTo(moonPos);

    const gravitationalForceEarth = calculateGravitationalForce(earthPos, position, distanceToEarth, earthMass, satellite);
    const gravitationalForceMoon = calculateGravitationalForce(moonPos, position, distanceToMoon, moonMass, satellite);

    const totalGravitationalForce = gravitationalForceEarth.vadd(gravitationalForceMoon);
    const dragForce = calculateDragForce(distanceToEarth - earthRadius, satellite);

    const totalForce = totalGravitationalForce.vadd(dragForce);
    const acceleration = totalForce.scale(1 / satellite.body.mass);

    return acceleration;
}

function calculateGravitationalForce(bodyPosition, satellitePosition, distance, bodyMass, satellite) {
    if (distance <= 0) {
        console.error('Invalid distance:', distance);
        return new CANNON.Vec3(0, 0, 0);
    }

    const forceDirection = new CANNON.Vec3(
        bodyPosition.x - satellitePosition.x,
        bodyPosition.y - satellitePosition.y,
        bodyPosition.z - satellitePosition.z
    );
    forceDirection.normalize();

    const forceMagnitude = PhysicsUtils.calculateGravitationalForce(bodyMass, satellite.body.mass, distance);
    if (isNaN(forceMagnitude) || forceMagnitude <= 0) {
        console.error('Invalid forceMagnitude:', forceMagnitude);
        return new CANNON.Vec3(0, 0, 0);
    }
    const gravitationalForce = forceDirection.scale(forceMagnitude);
    return gravitationalForce;
}

function calculateDragForce(altitude, satellite) {
    if (altitude < 0) {
        console.error('Invalid altitude:', altitude);
        return new CANNON.Vec3(0, 0, 0);
    }
    if (altitude > 4000000) {
        return new CANNON.Vec3(0, 0, 0); // Ignore drag force if altitude is over 400km
    }
    const Cd = 2.2;
    const A = Math.PI * Math.pow(satellite.body.shapes[0].radius, 2);
    const rho = PhysicsUtils.calculateAtmosphericDensity(altitude);
    const v = satellite.body.velocity.length();

    const dragMagnitude = PhysicsUtils.calculateDragForce(v, Cd, A, rho);

    const dragDirection = new CANNON.Vec3(
        satellite.body.velocity.x * -1,
        satellite.body.velocity.y * -1,
        satellite.body.velocity.z * -1
    );
    dragDirection.normalize();
    const dragForce = dragDirection.scale(dragMagnitude);

    return dragForce;
}

function manuallyManageSatellite(satellite, altitude, earthRadius) {
    satellite.altitude = altitude;
    satellite.position = satellite.body.position.clone();
    manuallyManagedSatellites.push(satellite);
}

function removeSatelliteFromPhysicsWorld(satellite) {
    world.removeBody(satellite.body);
    satellites = satellites.filter(sat => sat.id !== satellite.id);
}

function updateManuallyManagedSatellite(satellite, earthPosition, warpedDeltaTime) {
    // Update the satellite's position based on Earth's rotation
    const earthRotationSpeed = 7.2921150e-5; // radians per second
    const earthRotationAngle = earthRotationSpeed * warpedDeltaTime;
    const rotationQuaternion = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), earthRotationAngle);
    satellite.position.applyQuaternion(rotationQuaternion);
}

function addSatellite(satData) {
    const satellite = {
        id: satData.id,
        body: new CANNON.Body({
            mass: satData.mass,
            position: new CANNON.Vec3(satData.position.x, satData.position.y, satData.position.z),
            shape: new CANNON.Sphere(satData.size)
        }),
        velocity: new CANNON.Vec3(satData.velocity.x, satData.velocity.y, satData.velocity.z),
        altitude: satData.altitude
    };

    satellite.body.linearDamping = 0;
    satellite.body.angularDamping = 0;

    satellite.body.velocity.copy(satellite.velocity);
    world.addBody(satellite.body);
    satellites.push(satellite);
}

function removeSatellite(id) {
    const index = satellites.findIndex(sat => sat.id === id);
    if (index !== -1) {
        world.removeBody(satellites[index].body);
        satellites.splice(index, 1);
    }

    // Also remove from manually managed satellites if it exists there
    const managedIndex = manuallyManagedSatellites.findIndex(sat => sat.id === id);
    if (managedIndex !== -1) {
        manuallyManagedSatellites.splice(managedIndex, 1);
    }
}
