import { Satellite } from './components/Satellite.js';
import { PhysicsUtils } from './utils/PhysicsUtils.js';

export function createSatellite(scene, world, earth, moon, satellites, vectors, latitude, longitude, altitude, velocity, azimuth, angleOfAttack) {
    const earthQuaternion = earth.rotationGroup.quaternion;
    const tiltQuaternion = earth.tiltGroup.quaternion;

    const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
        latitude,
        longitude,
        altitude,
        velocity,
        azimuth,
        angleOfAttack,
        earthQuaternion,
        tiltQuaternion
    );

    // Get the next possible ID, which is the length of the satellites array
    let id = satellites.length;
    
    // Check if a satellite with the same ID already exists
    const existingSatellite = satellites.find(satellite => satellite.id === id);
    
    // If the satellite with the given ID already exists, skip creating it
    if (existingSatellite) {
        id = id + 1;
    }
    
    const color = Math.random() * 0xffffff;

    const newSatellite = new Satellite(scene, world, earth, moon, positionECEF, velocityECEF, id, color);
    satellites.push(newSatellite);
    vectors.addSatellite(newSatellite);
    vectors.setSatVisible(true);

    return newSatellite;
}
