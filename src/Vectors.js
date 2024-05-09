import * as THREE from 'three';

export class Vectors {
    constructor(earth, scene, sun) {
        this.earth = earth;
        this.sun = sun;
        this.scene = scene;
        this.scale = this.earth.EARTH_RADIUS * 2;  // Scaled for visibility
        this.initVectors();
    }

    // Initialization of vectors
    initVectors() {
        this.initVelocityVector();
        this.initNorthPoleVector();
        this.initGreenwichMarker();
        this.initSunDirection();  // Initialize the Sun direction vector
    }

    // Initialize Earth's velocity vector
    initVelocityVector() {
        const velocityDirection = new THREE.Vector3(1, 0, 0);  // Will be updated dynamically
        this.velocityVector = new THREE.ArrowHelper(
            velocityDirection.normalize(), 
            this.earth.earthMesh.position, 
            this.scale,
            0xff0000  // Color: Red
        );
        this.scene.add(this.velocityVector);
    }

    // Initialize North Pole vector
    initNorthPoleVector() {
        const northPoleDirection = new THREE.Vector3(1, 0, 0);
        this.northPoleVector = new THREE.ArrowHelper(
            northPoleDirection, 
            this.earth.earthMesh.position, 
            this.scale,
            0x0000ff  // Color: Blue
        );
        this.scene.add(this.northPoleVector);
        this.updateNorthPoleOrientation();
    }

    initSunDirection() {
        // Placeholder vector pointing upwards initially
        const sunDirection = new THREE.Vector3(0, 1, 0);
        this.sunDirectionArrow = new THREE.ArrowHelper(
            sunDirection, 
            this.earth.earthMesh.position,
            this.scale,
            0xffff00  // Color: Yellow
        );
        this.scene.add(this.sunDirectionArrow);
    }

    initGreenwichMarker() {
        this.greenwichVector = new THREE.Vector3(0, 0, 1);
        this.greenwichMarker = new THREE.ArrowHelper(
            this.greenwichVector,
            new THREE.Vector3(0, 0, 0),
            this.scale,
            0x00ff00  // Color: Green
        );
        this.scene.add(this.greenwichMarker);
    }

    // Update vectors based on simulated time
    updateVectors(simulatedTime) {
        this.updateVelocityVector(simulatedTime);
        this.updateNorthPoleOrientation();
        this.updateGreenwichMarker();
        this.updateSunDirection(simulatedTime);  // Update the Sun direction
    }

    updateSunDirection(simulatedTime) {
        // Assume 'sun' is an instance of the Sun class associated with the Earth class.
        const sunPosition = this.sun.getSunPosition(new Date(simulatedTime));  // Get the Sun's position for the given simulated time
        const earthPosition = new THREE.Vector3();

        // Compute the direction from Earth to the Sun
        const sunDirection = new THREE.Vector3().subVectors(sunPosition, earthPosition).normalize();
        this.sunDirectionArrow.setDirection(sunDirection);
        this.sunDirectionArrow.position.copy(earthPosition);
    }

    updateGreenwichMarker() {
        this.greenwichMarker.setDirection(this.earth.rotationGroup.localToWorld(this.greenwichVector.clone()).normalize());
    }

    updateNorthPoleOrientation() {
        // Align the North Pole vector to match Earth's axial tilt
        const tiltAxis = new THREE.Vector3(0, 1, 0); // Earth is tilted along its X-axis
        this.northPoleVector.setDirection(tiltAxis.clone().applyQuaternion(this.earth.tiltGroup.quaternion));
        this.northPoleVector.position.copy(this.earth.earthMesh.position);
    }

    updateVelocityVector(simulatedTime) {
        const newDirection = this.calculateEarthVelocity(simulatedTime).normalize();
        this.velocityVector.setDirection(newDirection);
        this.velocityVector.position.copy(this.earth.earthMesh.position);
    }

    // Mathematical calculations for vectors
    calculateEarthVelocity(simulatedTime) {
        const dayOfYear = this.getDayOfYear(simulatedTime);
        return new THREE.Vector3(-Math.sin(2 * Math.PI * dayOfYear / 365.25), 0, Math.cos(2 * Math.PI * dayOfYear / 365.25));
    }

    // Utility function to compute the day of the year
    getDayOfYear(simulatedTime) {
        const start = new Date(simulatedTime.getFullYear(), 0, 0);
        const diff = simulatedTime - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }
}
