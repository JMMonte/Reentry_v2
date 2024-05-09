import * as THREE from 'three';

export class Vectors {
    constructor(earth, scene, timeUtils) {
        this.earth = earth;
        this.scene = scene;
        this.timeUtils = timeUtils;  // Using the merged TimeUtils class
        this.scale = this.earth.EARTH_RADIUS * 2;
        this.initVectors();
    }

    initVectors() {
        this.initVelocityVector();
        this.initNorthPoleVector();
        this.initSunDirection();
    }

    initVelocityVector() {
        // Start with a placeholder vector
        const velocityDirection = new THREE.Vector3(1, 0, 0);
        this.velocityVector = new THREE.ArrowHelper(
            velocityDirection.normalize(), 
            this.earth.earthMesh.position, 
            this.scale, 
            0xff0000  // Red for velocity
        );
        this.scene.add(this.velocityVector);
    }

    initNorthPoleVector() {
        // Start with a placeholder vector
        const northPoleDirection = new THREE.Vector3(0, 1, 0);
        this.northPoleVector = new THREE.ArrowHelper(
            northPoleDirection, 
            this.earth.earthMesh.position, 
            this.scale, 
            0x0000ff  // Blue for North Pole
        );
        this.scene.add(this.northPoleVector);
    }

    initSunDirection() {
        // Start with a placeholder vector
        const sunDirection = new THREE.Vector3(0, 1, 0);
        this.sunDirectionArrow = new THREE.ArrowHelper(
            sunDirection, 
            this.earth.earthMesh.position, 
            this.scale, 
            0xffff00  // Yellow for Sun direction
        );
        this.scene.add(this.sunDirectionArrow);
    }

    updateVectors() {
        // Using the methods from TimeUtils to update vector directions
        this.velocityVector.setDirection(this.timeUtils.calculateEarthVelocity().normalize());
        this.northPoleVector.setDirection(this.timeUtils.getEarthTilt());
        this.sunDirectionArrow.setDirection(this.timeUtils.getSunPosition().normalize());
    }

    setVisible(visible) {
        // Visibility toggle for all vectors
        this.velocityVector.visible = visible;
        this.northPoleVector.visible = visible;
        this.sunDirectionArrow.visible = visible;
    }
}
