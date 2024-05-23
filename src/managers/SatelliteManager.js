import * as THREE from 'three';
import { Satellite } from '../components/Satellite.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';

class SatelliteManager {
    constructor(scene, world, earth, moon, satellites, vectors, timeUtils, physicsWorker) {
        this.scene = scene;
        this.world = world;
        this.earth = earth;
        this.moon = moon;
        this.satellites = satellites;
        this.vectors = vectors;
        this.timeUtils = timeUtils;
        this.physicsWorker = physicsWorker;
        this.nextSatelliteId = this.calculateNextSatelliteId();
    }

    calculateNextSatelliteId() {
        return this.satellites.length ? Math.max(...this.satellites.map(sat => sat.id)) + 1 : 1;
    }

    createSatellite(latitude, longitude, altitude, velocity, azimuth, angleOfAttack, timestamp) {
        const color = Math.random() * 0xffffff;
        const id = this.nextSatelliteId++;

        const { positionECEF, velocityECEF } = PhysicsUtils.calculatePositionAndVelocity(
            latitude,
            longitude,
            altitude,
            velocity,
            azimuth,
            angleOfAttack, 
            this.timeUtils,
            this.earth.rotationGroup.quaternion,
            this.earth.tiltGroup.quaternion,
        );

        const newSatellite = new Satellite(this.scene, this.world, this.earth, this.moon, positionECEF, velocityECEF, id, color);
        this.satellites.push(newSatellite);
        this.vectors.addSatellite(newSatellite);

        this.physicsWorker.postMessage({
            type: 'createSatellite',
            data: newSatellite.serialize()
        });

        return newSatellite;
    }

    fireThrust(satellite, thrustVector, duration, timestamp) {

    }

    removeSatellite(satellite) {
        const index = this.satellites.indexOf(satellite);
        if (index !== -1) {
            this.satellites.splice(index, 1);
            satellite.deleteSatellite();
            this.vectors.removeSatellite(satellite);

            this.physicsWorker.postMessage({
                type: 'removeSatellite',
                data: { id: satellite.id }
            });
        }
    }
}

export { SatelliteManager };
