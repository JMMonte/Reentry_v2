import * as CANNON from 'cannon-es';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';

let world, satellites = [], earthMass;

self.onmessage = function (event) {
    let messageData;

    // Check if the data is a string and parse it
    if (typeof event.data === 'string') {
        try {
            messageData = JSON.parse(event.data);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return;
        }
    } else {
        // If it's already an object, use it directly
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
    }
};

function initPhysics(data) {
    // console.log('Initializing physics world with data:', JSON.stringify(data));
    world = new CANNON.World();
    world.gravity.set(0, 0, 0);  // No gravity, we handle it manually
    earthMass = data.earthMass;

    satellites = data.satellites.map(satData => {
        const satellite = {
            id: satData.id,
            body: new CANNON.Body({
                mass: satData.mass,
                position: new CANNON.Vec3(satData.position.x, satData.position.y, satData.position.z),
                shape: new CANNON.Sphere(satData.size)
            }),
            velocity: new CANNON.Vec3(satData.velocity.x, satData.velocity.y, satData.velocity.z)
        };

        satellite.body.linearDamping = 0;
        satellite.body.angularDamping = 0;

        satellite.body.velocity.copy(satellite.velocity);
        world.addBody(satellite.body);
        return satellite;
    });
}

function stepPhysics(data) {
    const { warpedDeltaTime, earthPosition, earthRadius, id } = data;
    if (warpedDeltaTime <= 0) {
        console.error('Invalid warpedDeltaTime:', warpedDeltaTime);
        return;
    }

    world.step(warpedDeltaTime);

    const earthPos = new CANNON.Vec3(earthPosition.x, earthPosition.y, earthPosition.z);

    const satellite = satellites.find(sat => sat.id === id);
    if (satellite) {
        const satellitePosition = satellite.body.position;
        const distance = satellitePosition.distanceTo(earthPos);
        const altitude = distance - earthRadius;

        if (altitude <= 0) {
            const earthSurfaceVelocity = PhysicsUtils.calculateEarthSurfaceVelocity(satellitePosition, earthRadius, earthRotationSpeed, earthInclination);
            satellite.body.velocity.copy(earthSurfaceVelocity);
        }

        const gravitationalForce = calculateGravitationalForce(earthPos, satellitePosition, distance, satellite);
        if (gravitationalForce) {
            satellite.body.applyForce(gravitationalForce, satellite.body.position);
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
                acceleration: gravitationalForce,
                dragForce: dragForce
            }
        });
    }
}

function calculateGravitationalForce(earthPosition, satellitePosition, distance, satellite) {
    const forceDirection = new CANNON.Vec3(
        earthPosition.x - satellitePosition.x,
        earthPosition.y - satellitePosition.y,
        earthPosition.z - satellitePosition.z
    );
    forceDirection.normalize();

    const forceMagnitude = PhysicsUtils.calculateGravitationalForce(earthMass, satellite.body.mass, distance);
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
