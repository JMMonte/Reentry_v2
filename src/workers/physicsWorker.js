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

    world.step(warpedDeltaTime);

    const earthPos = new CANNON.Vec3(earthPosition.x, earthPosition.y, earthPosition.z);
    const moonPos = new CANNON.Vec3(moonPosition.x, moonPosition.y, moonPosition.z);

    satellites.forEach(satellite => {
        const satellitePosition = satellite.body.position;
        const distanceToEarth = satellitePosition.distanceTo(earthPos);
        const distanceToMoon = satellitePosition.distanceTo(moonPos);
        const altitude = distanceToEarth - earthRadius;

        if (altitude <= 10000) { // 10km threshold
            manuallyManageSatellite(satellite, altitude, earthRadius);
            removeSatelliteFromPhysicsWorld(satellite);
        } else {
            const gravitationalForceEarth = calculateGravitationalForce(earthPos, satellitePosition, distanceToEarth, earthMass, satellite);
            const gravitationalForceMoon = calculateGravitationalForce(moonPos, satellitePosition, distanceToMoon, moonMass, satellite);
            const totalGravitationalForce = gravitationalForceEarth.vadd(gravitationalForceMoon);

            if (totalGravitationalForce) {
                satellite.body.applyForce(totalGravitationalForce, satellite.body.position);
            }

            const dragForce = calculateDragForce(altitude, satellite);
            if (dragForce) {
                satellite.body.applyForce(dragForce, satellite.body.position);
            }

            self.postMessage({
                type: 'stepComplete',
                data: {
                    id: satellite.id,
                    position: satellite.body.position,
                    velocity: satellite.body.velocity,
                    altitude: altitude,
                    acceleration: totalGravitationalForce,
                    dragForce: dragForce,
                    currentTime: currentTime  // Include current time for synchronization
                }
            });
        }
    });

    // Update positions of manually managed satellites
    manuallyManagedSatellites.forEach(managedSat => {
        updateManuallyManagedSatellite(managedSat, earthPosition, warpedDeltaTime);
        self.postMessage({
            type: 'stepComplete',
            data: {
                id: managedSat.id,
                position: managedSat.position,
                velocity: new CANNON.Vec3(0, 0, 0),
                altitude: managedSat.altitude,
                acceleration: new CANNON.Vec3(0, 0, 0),
                dragForce: new CANNON.Vec3(0, 0, 0),
                currentTime: currentTime  // Include current time for synchronization
            }
        });
    });
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

function calculateGravitationalForce(bodyPosition, satellitePosition, distance, bodyMass, satellite) {
    const forceDirection = new CANNON.Vec3(
        bodyPosition.x - satellitePosition.x,
        bodyPosition.y - satellitePosition.y,
        bodyPosition.z - satellitePosition.z
    );
    forceDirection.normalize();

    const forceMagnitude = PhysicsUtils.calculateGravitationalForce(bodyMass, satellite.body.mass, distance);
    if (isNaN(forceMagnitude) || forceMagnitude <= 0) {
        console.error('Invalid forceMagnitude:', forceMagnitude);
        return null;
    }
    const gravitationalForce = forceDirection.scale(forceMagnitude);
    return gravitationalForce;
}

function calculateDragForce(altitude, satellite) {
    if (altitude < 0) {
        console.error('Invalid altitude:', altitude);
        return null;
    }
    if (altitude > 4000000) {
        return 0; // Ignore drag force if altitude is over 400km
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
