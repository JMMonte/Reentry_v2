import * as THREE from 'three';
import { TimeUtils } from './TimeUtils.js';
import { Constants } from './Constants.js';

export class Vectors {
    constructor(earth, scene, timeUtils) {
        this.earth = earth;
        this.scene = scene;
        this.timeUtils = timeUtils;  // Using the merged TimeUtils class
        this.scale = this.earth.EARTH_RADIUS * 2;
        this.satellites = []
        this.initVectors();
    }

    initVectors() {
        this.initVelocityVector();
        this.initNorthPoleVector();
        this.initSunDirection();
        this.initGreenwichVector();
        if (this.satellites.length > 0) {
            this.initSatelliteVectors(this.satellites);
        }
    }

    initVelocityVector() {
        const velocityDirection = new THREE.Vector3(1, 0, 0);
        this.velocityVector = new THREE.ArrowHelper(
            velocityDirection.normalize(), 
            this.earth.earthMesh.position, 
            this.scale, 
            0xff0000
        );
        this.velocityVector.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        this.scene.add(this.velocityVector);
    }

    initNorthPoleVector() {
        const northPoleDirection = new THREE.Vector3(0, 1, 0);
        this.northPoleVector = new THREE.ArrowHelper(
            northPoleDirection, 
            this.earth.earthMesh.position, 
            this.scale, 
            0x0000ff
        );
        this.northPoleVector.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        this.scene.add(this.northPoleVector);
    }

    initSunDirection() {
        const sunDirection = new THREE.Vector3(0, 1, 0);
        this.sunDirectionArrow = new THREE.ArrowHelper(
            sunDirection, 
            this.earth.earthMesh.position, 
            this.scale, 
            0xffff00
        );
        this.sunDirectionArrow.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        this.scene.add(this.sunDirectionArrow);
    }

    initSatelliteVectors() {
        this.satellites.forEach(satellite => {
            this.addSatellite(satellite);
        });
    }

    initGreenwichVector() {
        const greenwichDirection = new THREE.Vector3(0, 0, 1);
        this.greenwichVector = new THREE.ArrowHelper(
            greenwichDirection, 
            this.earth.earthMesh.position, 
            this.scale, 
            0x00ff00
        );
        this.greenwichVector.setLength(this.scale * 1, this.scale * 0.02, this.scale * 0.005);
        this.scene.add(this.greenwichVector);
    }

    updateSatelliteVectors() {
        this.satellites.forEach(entry => {
            if (entry && entry.velocityVector && entry.satellite && entry.satellite.body && entry.satellite.body.velocity) {
                try {
                    const satellite = entry.satellite;
                    const velocityVector = entry.velocityVector;
                    velocityVector.position.copy(satellite.mesh.position);
                    const velocity = new THREE.Vector3(
                        satellite.body.velocity.x,
                        satellite.body.velocity.y,
                        satellite.body.velocity.z
                    ).normalize();
                    const velocityLength = satellite.body.velocity.length();
                    velocityVector.setDirection(velocity);
                    velocityVector.setLength(velocityLength * 0.1, this.scale * 0.02, this.scale * 0.005);
                    const gravityDirection = new THREE.Vector3().subVectors(
                        this.earth.earthMesh.position,
                        entry.satellite.mesh.position
                    ).normalize();
                    const gravityMagnitude = gravityDirection.length() * this.scale * 0.05;
                    entry.gravityVector.position.copy(entry.satellite.mesh.position);
                    entry.gravityVector.setDirection(gravityDirection);
                    entry.gravityVector.setLength(gravityMagnitude * 1, this.scale * 0.02, this.scale * 0.005);
                } catch (error) {
                    console.error('Error updating vector for satellite:', entry, error);
                }
            } else {
                console.warn('Missing properties for', entry);
            }
        });
    }

    updateVectors() {
        this.velocityVector.setDirection(this.timeUtils.calculateEarthVelocity().normalize());
        this.northPoleVector.setDirection(this.timeUtils.getEarthTilt());
        this.sunDirectionArrow.setDirection(this.timeUtils.getSunPosition().normalize());
        this.greenwichVector.setDirection(this.timeUtils.getGreenwichPosition().normalize());
        this.updateSatelliteVectors();
    }

    setVisible(visible) {
        this.velocityVector.visible = visible;
        this.northPoleVector.visible = visible;
        this.sunDirectionArrow.visible = visible;
        this.greenwichVector.visible = visible;
    }
    setSatVisible(visible) {
        this.satellites.forEach(entry => {
            if (entry.velocityVector) {
                entry.velocityVector.visible = visible;
            }
            if (entry.gravityVector) {
                entry.gravityVector.visible = visible;
            }
        });
    }

    removeSatellite(satellite) {
        const index = this.satellites.findIndex(entry => entry.satellite === satellite);
        if (index !== -1) {
            this.scene.remove(this.satellites[index].velocityVector);
            this.scene.remove(this.satellites[index].gravityVector);
            this.satellites.splice(index, 1);
        }
    }

    addSatellite(satellite) {
        const velocityDirection = new THREE.Vector3(1, 0, 0);
        const velocityVector = new THREE.ArrowHelper(
            velocityDirection.normalize(),
            satellite.mesh.position,
            this.scale * 0.2, 0xff0000
        );
        this.scene.add(velocityVector);
        const gravityDirection = new THREE.Vector3().subVectors(
            this.earth.earthMesh.position,
            satellite.mesh.position
        ).normalize();
        const gravityMagnitude = gravityDirection.length() * this.scale * 0.05;
        const gravityVector = new THREE.ArrowHelper(
            gravityDirection,
            satellite.mesh.position,
            gravityMagnitude, 0x00ff00,
            this.scale * 0.05,
            this.scale * 0.01
        );
        this.scene.add(gravityVector);
        this.satellites.push({
            satellite: satellite,
            velocityVector: velocityVector,
            gravityVector: gravityVector
        });
    }

    getGreenwichSurfacePosition() {
        const halfScale = this.scale / 2;
        const greenwichPosition = this.greenwichVector.position.clone();
        const greenwichDirection = this.greenwichVector.getDirection(new THREE.Vector3()).normalize();
        const greenwichSurfacePosition = greenwichPosition.add(greenwichDirection.multiplyScalar(halfScale));
        return greenwichSurfacePosition;
    }

    toggleVelocityVectorVisibility(visible) {
        this.velocityVector.visible = visible;
    }

    toggleNorthPoleVectorVisibility(visible) {
        this.northPoleVector.visible = visible;
    }

    toggleSunDirectionArrowVisibility(visible) {
        this.sunDirectionArrow.visible = visible;
    }

    toggleGreenwichVectorVisibility(visible) {
        this.greenwichVector.visible = visible;
    }
}
