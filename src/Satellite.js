import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Constants } from './Constants.js';
import { PhysicsUtils } from './PhysicsUtils.js';

export class Satellite {
    constructor(scene, world, earth, initialPosition, initialVelocity) {
        this.scene = scene;
        this.world = world;
        this.earth = earth;
        this.earth_mass = Constants.earthMass;
        this.color = Math.random() * 0xffffff;
        this.size = 1; // Scaled down size
        this.initMesh(initialPosition);
        this.initPhysics(initialPosition, initialVelocity);
        this.initTraceLine();
        this.lastTraceUpdateTime = 0; // Initialize last update time for trace
        this.traceUpdateInterval = 0.5; // Update trace every 0.5 seconds
        this.gravityVector = new CANNON.Vec3(); // Store the last calculated gravity vector
        this.dragForce = new CANNON.Vec3(); // Store the last calculated drag force
        this.altitude = 0; // Initialize altitude
        this.position = new CANNON.Vec3(initialPosition.x, initialPosition.y, initialPosition.z);
        
    }

    get velocity() {
        return this.body.velocity.length();  // Returns the scalar magnitude of the velocity
    }

    set velocity(newVelocityMagnitude) {
        // Assuming we want to set the velocity while maintaining the direction
        const normalizedVelocity = new CANNON.Vec3(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z).normalize();
        normalizedVelocity.scale(newVelocityMagnitude, normalizedVelocity);
        this.body.velocity.copy(normalizedVelocity);
    }

    initMesh(initialPosition) {
        const geometry = new THREE.SphereGeometry(this.size, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: this.color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(initialPosition); // Ensure the mesh is placed at the initial position
        this.scene.add(this.mesh);
    }

    initPhysics(initialPosition, initialVelocity) {
        const mass = 10 * Constants.massScale;  // Satellite mass, adjust if scaling is necessary
        const position = new CANNON.Vec3(
            initialPosition.x * Constants.threeJsCannon / Constants.scale,
            initialPosition.y * Constants.threeJsCannon / Constants.scale,
            initialPosition.z * Constants.threeJsCannon / Constants.scale
        );
        const velocity = new CANNON.Vec3(
            initialVelocity.x * Constants.threeJsCannon / Constants.scale,
            initialVelocity.y * Constants.threeJsCannon / Constants.scale,
            initialVelocity.z * Constants.threeJsCannon / Constants.scale
        );
        const earthPosition = new CANNON.Vec3(
            this.earth.earthBody.position.x,
            this.earth.earthBody.position.y,
            this.earth.earthBody.position.z
        );
        this.earthPosition = earthPosition;
        const shape = new CANNON.Sphere(this.size);  // Ensure size is converted if necessary
        this.body = new CANNON.Body({ mass, position, shape });
        this.body.angularDamping = 0;
        this.body.linearDamping = 0;
        this.bodyMassKg = mass / Constants.massScale;  // Store mass in kg for calculations
        this.body.velocity.copy(velocity);
        this.world.addBody(this.body);
    }

    initTraceLine() {
        this.maxTracePoints = 10000; // Example size, adjust as needed
        this.dynamicPositions = [];
        this.creationTimes = [];

        const positions = new Float32Array(this.maxTracePoints * 3);
        const colors = new Float32Array(this.maxTracePoints * 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const material = new THREE.LineBasicMaterial({
            color: this.color,
            linewidth: 2, // Note: linewidth might not be visible on Windows due to ANGLE
            transparent: true
        });
        this.traceLine = new THREE.Line(geometry, material);
        this.scene.add(this.traceLine);
        this.currentTraceIndex = 0;
    }

    initOrbitVisualization(orbitPoints) {
        const geometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const orbitLine = new THREE.LineLoop(geometry, material);
        this.scene.add(orbitLine);
    }

    updateSatellite(currentTime, realDeltaTime, warpedDeltaTime) {
        this.updatePhysics(realDeltaTime); // Real delta for accurate physics
    
        // Apply warped delta time for position updates that affect rendering and other timed elements
        this.mesh.position.set(
            this.body.position.x * Constants.scale * Constants.metersToKm, // Convert units as necessary
            this.body.position.y * Constants.scale * Constants.metersToKm,
            this.body.position.z * Constants.scale * Constants.metersToKm
        );

        this.updateTraceLine(currentTime);
    }

    updatePhysics(deltaTime) {
        // Get the position of the Earth and the satellite from the world state
        const earthPosition = new THREE.Vector3(this.earthPosition.x, this.earthPosition.y, this.earthPosition.z);
        const satellitePosition = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
        
        // Calculate the distance between the Earth and the satellite
        const distance = satellitePosition.distanceTo(earthPosition);
        this.altitude = satellitePosition.length() - Constants.earthRadius;

        // Calculate the direction of the force (towards the Earth)
        const forceDirection = earthPosition.clone().sub(satellitePosition).normalize();
        
        // Use PhysicsUtils to calculate gravitational force
        const forceMagnitude = PhysicsUtils.calculateGravitationalForce(this.earth_mass, this.bodyMassKg, distance);

        // Calculate the force vector
        const force = forceDirection.multiplyScalar(forceMagnitude * 3.0001e-3);

        // Calculate atmospheric drag
        const Cd = 2.2; // Assume some value, needs to be adapted based on satellite shape
        const A = Math.PI * Math.pow(this.size / 2, 2); // Assuming spherical satellite
        const rho = this.calculateAtmosphericDensity();
        const velocity = new THREE.Vector3(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);
        const v = velocity.length();
        const dragMagnitude = 0.5 * Cd * A * rho * v * v;

        // Drag force direction is opposite to velocity
        const dragForce = velocity.normalize().multiplyScalar(-dragMagnitude * 3.0001e-3);

        // Apply the drag force
        this.body.applyForce(dragForce, this.body.position);
        this.body.applyForce(force, this.body.position);

        // Store the force vectors for later use
        this.dragForce.copy(dragForce);
        this.gravityVector.copy(force);
    }

    calculateAtmosphericDensity() {
        const rho0 = 1.225; // kg/m^3
        const H = 8500; // meters
        let h = this.getCurrentAltitude() * 1000; // Convert km to meters
        return rho0 * Math.exp(-h / H);
    }

    deleteSatellite() {
        this.scene.remove(this.mesh);
        this.scene.remove(this.traceLine);
        if (this.body) {
            this.world.removeBody(this.body);
        }
        // remove traces
        this.dynamicPositions = [];
        this.creationTimes = [];
        this.traceLine.geometry.dispose();
    }

    updateTraceLine(currentTime) {
        // Capture current position of the satellite
        const currentPosition = new THREE.Vector3().copy(this.mesh.position);
        this.dynamicPositions.push(currentPosition);
        this.creationTimes.push(currentTime);

        // Remove the oldest point if we exceed the maximum trace length
        if (this.dynamicPositions.length > this.maxTracePoints) {
            this.dynamicPositions.shift();
            this.creationTimes.shift();
        }

        // Update positions in the geometry
        const positions = this.traceLine.geometry.attributes.position.array;
        let index = 0;
        for (let i = 0; i < this.dynamicPositions.length; i++) {
            positions[index++] = this.dynamicPositions[i].x;
            positions[index++] = this.dynamicPositions[i].y;
            positions[index++] = this.dynamicPositions[i].z;
        }
        this.traceLine.geometry.attributes.position.needsUpdate = true;

        // Optionally update colors
        // const colors = this.traceLine.geometry.attributes.color.array;
        // index = 0;
        // for (let i = 0; i < this.dynamicPositions.length; i++) {
        //     const age = (currentTime - this.creationTimes[i]) / 10000000; // example to fade based on age
        //     const alpha = 1 - Math.min(age, 1);
        //     colors[index++] = alpha; // Assuming white color fades to transparent
        //     colors[index++] = alpha;
        //     colors[index++] = alpha;
        // }
        // this.traceLine.geometry.attributes.color.needsUpdate = true;
    }

    getCurrentAltitude() {
        return this.altitude;
    }

    getCurrentVelocity() {
        return this.body.velocity.length();
    }

    getCurrentAcceleration() {
        return this.gravityVector.length();
    }

    getCurrentDragForce() {
        return this.dragForce.length();
    }

    setColor(color) {
        this.mesh.material = new THREE.MeshBasicMaterial({ color });
        this.traceLine.material = new THREE.LineBasicMaterial({ color });
    }

}
