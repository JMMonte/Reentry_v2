import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Constants } from './constants.js';

const G = Constants.G / 1000; // Adjust G proportionally if needed
const earth_mass = Constants.earthMass;

export class Satellite {
    constructor(scene, world, earth, initialPosition, initialVelocity) {
        this.scene = scene;
        this.world = world;
        this.earth = earth;
        this.earth_mass = earth_mass;
        this.color = Math.random() * 0xffffff;
        this.size = 1; // Scaled down size
        this.initMesh(initialPosition);
        this.initPhysics(initialPosition, initialVelocity);
        this.initTraceLine();
        this.lastTraceUpdateTime = 0; // Initialize last update time for trace
        this.traceUpdateInterval = 0.5; // Update trace every 0.5 seconds
    }

    initMesh(initialPosition) {
        const geometry = new THREE.SphereGeometry(this.size, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: this.color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(initialPosition); // Ensure the mesh is placed at the initial position
        this.scene.add(this.mesh);
    }

    initPhysics(initialPosition, initialVelocity) {
        const mass = 100; // Satellite mass
        const shape = new CANNON.Sphere(this.size);
        this.body = new CANNON.Body({ mass: mass, position: initialPosition, shape: shape });
        this.body.velocity = new CANNON.Vec3(initialVelocity.x, initialVelocity.y, initialVelocity.z);
        this.body.linearDamping = 0;
        this.body.angularDamping = 0;
        this.world.addBody(this.body);
    }

    initTraceLine() {
        const maxTracePoints = 20; // Example size, adjust as needed
        this.tracePositions = new Float32Array(maxTracePoints * 3);
        this.traceColors = new Float32Array(maxTracePoints * 3); // Added for fading effect
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.tracePositions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(this.traceColors, 3)); // Add color attribute
        const material = new THREE.LineBasicMaterial({
            color: this.color,
            vertexColors: THREE.VertexColors, // Enable vertex colors
            linewidth: 5 // Increase line thickness
        });
        this.traceLine = new THREE.Line(geometry, material);
        this.scene.add(this.traceLine);
        this.currentTraceIndex = 0;
        this.maxTracePoints = maxTracePoints;
    }

    updateSatellite(currentTime) {
        this.updatePhysics();
        this.mesh.position.copy(this.body.position); // Update the mesh position from the physics body
    
        // Check if 0.5 seconds have passed since the last trace update
        if (currentTime - this.lastTraceUpdateTime >= this.traceUpdateInterval) {
            this.updateTraceLine(); // Use the updated mesh position for the trace
            this.lastTraceUpdateTime = currentTime; // Reset the last update time
        }
    }

    updatePhysics() {
        const earthPosition = new CANNON.Vec3(0, 0, 0);
        let forceDirection = this.body.position.vsub(earthPosition);
        const distance = forceDirection.length();

        if (distance < 1e-5) {
            console.error('Distance too small, likely collision or initialization issue.');
            return;
        }

        const gravityStrength = G * this.earth_mass * this.body.mass / (distance * distance);
        forceDirection.normalize();
        const gravityForce = forceDirection.scale(-gravityStrength); // Invert the gravity force

        if (isNaN(gravityForce.x) || isNaN(gravityForce.y) || isNaN(gravityForce.z)) {
            console.error('NaN gravitational force calculated:', gravityForce);
            return;
        }
        this.body.applyForce(gravityForce, this.body.position);
    }

    updateTraceLine() {
        const idx = this.currentTraceIndex * 3;
        this.tracePositions[idx] = this.mesh.position.x;
        this.tracePositions[idx + 1] = this.mesh.position.y;
        this.tracePositions[idx + 2] = this.mesh.position.z;
    
        // Calculate color fade based on the buffer position
        const fadeFactor = this.currentTraceIndex / this.maxTracePoints;
        const colorValue = 1 - fadeFactor; // Fade to black
    
        this.traceColors[idx] = colorValue; // R
        this.traceColors[idx + 1] = colorValue; // G
        this.traceColors[idx + 2] = colorValue; // B
    
        // Update buffer attributes
        this.traceLine.geometry.attributes.position.needsUpdate = true;
        this.traceLine.geometry.attributes.color.needsUpdate = true;
    
        // Ensure correct rendering when buffer wraps
        if (this.currentTraceIndex < this.maxTracePoints - 1) {
            // Buffer not yet full, draw from 0 to current index
            this.traceLine.geometry.setDrawRange(0, this.currentTraceIndex + 1);
        } else {
            // Buffer is full, draw from next index to max points (wraps around)
            const startIdx = (this.currentTraceIndex + 1) % this.maxTracePoints;
            if (startIdx > 0) {
                // If not wrapping to the beginning, draw from startIdx to the end of the buffer
                this.traceLine.geometry.setDrawRange(startIdx, this.maxTracePoints - startIdx);
            } else {
                // StartIdx is 0, meaning we're wrapping around to the beginning
                this.traceLine.geometry.setDrawRange(0, this.maxTracePoints);
            }
        }
    
        // Increment the index and wrap around if necessary
        this.currentTraceIndex = (this.currentTraceIndex + 1) % this.maxTracePoints;
    }
    
}
