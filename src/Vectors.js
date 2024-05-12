import * as THREE from 'three';

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
        if (this.satellites.length > 0) {
            this.initSatelliteVectors(this.satellites);
        }
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

    initSatelliteVectors() {
        this.satellites.forEach(satellite => {
            this.addSatellite(satellite);
        });
    }

    updateSatelliteVectors() {
        this.satellites.forEach(entry => {
            if (entry && entry.velocityVector && entry.satellite && entry.satellite.body && entry.satellite.body.velocity) {
                try {
                    const satellite = entry.satellite;
                    const velocityVector = entry.velocityVector;
    
                    // Update the position of the velocity vector to match the satellite's current position
                    velocityVector.position.copy(satellite.mesh.position);
    
                    // Normalize the velocity to use as the new direction for the vector
                    const velocity = new THREE.Vector3(
                        satellite.body.velocity.x,
                        satellite.body.velocity.y,
                        satellite.body.velocity.z
                    ).normalize();
    
                    // Calculate the current velocity magnitude for scaling the length of the vector
                    const velocityLength = satellite.body.velocity.length();
    
                    // Set the updated direction and scale the length of the velocity vector
                    velocityVector.setDirection(velocity);
                    velocityVector.setLength(velocityLength * 0.1, this.scale * 0.02, this.scale * 0.005);


                    // Update Gravity Vector
                    const gravityDirection = new THREE.Vector3().subVectors(
                        this.earth.earthMesh.position,
                        entry.satellite.mesh.position
                    ).normalize();
                    
                    const gravityMagnitude = gravityDirection.length() * this.scale * 0.05; // Keep consistent with initialization
                    
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
        // Using the methods from TimeUtils to update vector directions
        this.velocityVector.setDirection(this.timeUtils.calculateEarthVelocity().normalize());
        this.northPoleVector.setDirection(this.timeUtils.getEarthTilt());
        this.sunDirectionArrow.setDirection(this.timeUtils.getSunPosition().normalize());
        this.updateSatelliteVectors();
    }

    setVisible(visible) {
        // Visibility toggle for all vectors
        this.velocityVector.visible = visible;
        this.northPoleVector.visible = visible;
        this.sunDirectionArrow.visible = visible;
    }

    removeSatellite(satellite) {
        const index = this.satellites.findIndex(entry => entry.satellite === satellite);
        if (index !== -1) {
            this.scene.remove(this.satellites[index].velocityVector);
            this.scene.remove(this.satellites[index].gravityVector); // If a gravity vector exists
            this.satellites.splice(index, 1);
        }
    }

    addSatellite(satellite) {
        const velocityDirection = new THREE.Vector3(1, 0, 0); // Replace with actual velocity if known
        const velocityVector = new THREE.ArrowHelper(
            velocityDirection.normalize(),
            satellite.mesh.position,
            this.scale * 0.2, 0xff0000
        );
        this.scene.add(velocityVector);

        // Initialize gravity vector
        const gravityDirection = new THREE.Vector3().subVectors(
            this.earth.earthMesh.position,
            satellite.mesh.position
        ).normalize();
        
        // Example gravitational force formula: F = G * (m1 * m2) / r^2
        // Simplified to a visualization factor here
        const gravityMagnitude = gravityDirection.length() * this.scale * 0.05; // Adjust scaling factor as needed

        const gravityVector = new THREE.ArrowHelper(
            gravityDirection,
            satellite.mesh.position,
            gravityMagnitude, 0x00ff00,
            this.scale * 0.05, // Head length, matching velocity vector
            this.scale * 0.01  // Head width
        );
        this.scene.add(gravityVector);

        this.satellites.push({
            satellite: satellite,
            velocityVector: velocityVector,
            gravityVector: gravityVector
        });
    }

}
