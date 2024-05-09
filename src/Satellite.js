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
        this.maxTracePoints = 100; // Example size, adjust as needed
        this.dynamicPositions = [];
        this.creationTimes = [];
    
        const positions = new Float32Array(this.maxTracePoints * 3);
        const colors = new Float32Array(this.maxTracePoints * 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const material = new THREE.LineBasicMaterial({
            vertexColors: THREE.VertexColors,
            linewidth: 2, // Note: linewidth might not be visible on Windows due to ANGLE
            transparent: true
        });
        this.traceLine = new THREE.Line(geometry, material);
        this.scene.add(this.traceLine);
        this.currentTraceIndex = 0;
    }
    

    updateSatellite(currentTime, timeWarp) {
        this.updatePhysics(timeWarp);
        this.mesh.position.copy(this.body.position); // Update the mesh position from the physics body
    
        // Check if 0.5 seconds have passed since the last trace update
        if (currentTime - this.lastTraceUpdateTime >= this.traceUpdateInterval) {
            this.updateTraceLine(currentTime); // Use the updated mesh position for the trace
            this.lastTraceUpdateTime = currentTime; // Reset the last update time
        }
    }

    updatePhysics(timeWarp) {
        const earthPosition = new CANNON.Vec3(0, 0, 0);
        let forceDirection = this.body.position.vsub(earthPosition);
        const distance = forceDirection.length();

        if (distance < 1e-5) {
            console.error('Distance too small, likely collision or initialization issue.');
            return;
        }

        const gravityStrength = G * this.earth_mass * this.body.mass / (distance * distance);

        forceDirection.normalize();
        const gravityForce = forceDirection.scale(-gravityStrength * timeWarp); // Invert the gravity force and apply time warp

        if (isNaN(gravityForce.x) || isNaN(gravityForce.y) || isNaN(gravityForce.z)) {
            console.error('NaN gravitational force calculated:', gravityForce);
            return;
        }
        this.body.applyForce(gravityForce, this.body.position);
    }

    updateTraceLine(currentTime) {
        // Add current position to the dynamic array if not initialized
        if (!this.dynamicPositions) {
            this.dynamicPositions = [];
            this.creationTimes = [];
        }
    
        // Append the current position and time
        this.dynamicPositions.push(this.mesh.position.clone());
        this.creationTimes.push(currentTime);
    
        let positions = [];
        let colors = [];
        let activePoints = 0;
    
        // Recalculate and update positions and colors
        for (let i = 0; i < this.dynamicPositions.length; i++) {
            const age = currentTime - this.creationTimes[i];
            const halfLife = 10; // Adjust the half-life as necessary
    
            if (age <= 2 * halfLife) { // Only keep points within twice the half-life
                const decayFactor = Math.exp(-Math.log(2) * age / halfLife);
                const colorValue = decayFactor;
                const idx = activePoints * 3;
    
                positions.push(this.dynamicPositions[i].x, this.dynamicPositions[i].y, this.dynamicPositions[i].z);
                colors.push(colorValue, colorValue, colorValue); // RGB
                activePoints++;
            }
        }
    
        // Update the Float32Array data
        const floatPositions = new Float32Array(positions);
        const floatColors = new Float32Array(colors);
    
        // Set the new attribute data
        this.traceLine.geometry.setAttribute('position', new THREE.BufferAttribute(floatPositions, 3));
        this.traceLine.geometry.setAttribute('color', new THREE.BufferAttribute(floatColors, 3));
    
        // Notify THREE.js to update the attributes
        this.traceLine.geometry.attributes.position.needsUpdate = true;
        this.traceLine.geometry.attributes.color.needsUpdate = true;
        this.traceLine.geometry.setDrawRange(0, activePoints);
    }
    
}
