import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Constants } from '../utils/Constants.js';
import PhysicsWorkerURL from 'url:../workers/physicsWorker.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { ManeuverCalculator } from './ManeuverCalculator.js'; // Import the ManeuverCalculator class

class ManeuverNode {
    constructor(time, direction, deltaV) {
        this.time = time; // Exact time in the simulation when the maneuver should occur
        this.direction = direction; // THREE.Vector3 representing the direction of the thrust
        this.deltaV = deltaV; // The amount of delta-v (change in velocity) necessary
    }
}

export class Satellite {
    constructor(scene, world, earth, moon, position, velocity, id, color) {
        this.scene = scene;
        this.world = world;
        this.earth = earth;
        this.moon = moon;
        this.id = id;
        this.color = color;
        this.initialized = false;
        this.updateBuffer = [];
        this.landed = false;

        // Centralize materials
        this.materials = {
            satellite: new THREE.MeshBasicMaterial({
                color: this.color
            }),
            traceLine: new THREE.LineBasicMaterial({
                color: this.color,
                linewidth: 1
            }),
            orbitLine: new THREE.LineBasicMaterial({
                color: this.color,
                opacity: 0.2,
                transparent: true
            }),
            periapsis: new THREE.PointsMaterial({
                color: 0xff0000,
                size: 5,
                opacity: 0.5,
                transparent: true,
                sizeAttenuation: false,
            }),
            apoapsis: new THREE.PointsMaterial({
                color: 0x0000ff,
                size: 5,
                opacity: 0.5,
                transparent: true,
                sizeAttenuation: false,
            }) 
        };

        if (!position || !velocity) {
            throw new Error("Position and velocity must be defined");
        }

        this.initProperties(position, velocity);
        this.initWorker();
        this.initTraceLine();
        this.initOrbitLine();
        this.initApsides();

        this.maneuverNodes = []; // List to store maneuver nodes
        this.maneuverCalculator = new ManeuverCalculator(); // Initialize the ManeuverCalculator
    }

    initProperties(position, velocity) {
        const material = new CANNON.Material({ friction: 0.0, restitution: 0.3 });
        const size = new CANNON.Vec3(Constants.satelliteRadius, Constants.satelliteRadius, Constants.satelliteRadius * 2);
        const shape = new CANNON.Box(size);
        const volume = size.x * size.y * size.z;
        const aluminumDensity = 2700; // kg/m^3
        const monopropellantDensity = 800; // kg/m^3
        this.satelliteMass = (0.1 * volume * aluminumDensity) + (0.1 * volume * monopropellantDensity);
        this.body = new CANNON.Body({ mass: this.satelliteMass, shape, material });

        this.body.position.copy(position); // Ensure position is defined
        this.body.velocity.copy(velocity); // Ensure velocity is defined

        const geometry = new THREE.ConeGeometry(
            Constants.satelliteRadius,
            Constants.satelliteRadius * 2,
            3,
            1
        );
        this.mesh = new THREE.Mesh(geometry, this.materials.satellite);
        this.scene.add(this.mesh);

        this.gravityVector = new CANNON.Vec3();
        this.dragForce = new CANNON.Vec3();
        this.dynamicPositions = [];
        this.creationTimes = [];
        this.maxTracePoints = 10000;
    }

    initWorker() {
        this.worker = new Worker(PhysicsWorkerURL);
        this.worker.onmessage = (event) => {
            const { type, data } = event.data;
            if (type === 'initComplete') {
                this.initialized = true;
                this.world.addBody(this.body);
            } else if (type === 'stepComplete' && data.id === this.id) {
                this.updateBuffer.push(data);
            } else if (type === 'landed' && data.id === this.id) {
                this.handleLanding(data.position);
            }
        };

        this.worker.postMessage({
            type: 'init',
            data: {
                earthMass: Constants.earthMass,
                moonMass: Constants.moonMass,
                satellites: []
            }
        });

        const satelliteData = this.serialize();
        this.worker.postMessage({
            type: 'createSatellite',
            data: satelliteData
        });
    }

    handleLanding(position) {
        this.landed = true;
        this.body.position.copy(position);
        this.body.velocity.set(0, 0, 0);
        this.body.mass = 0; // Make the satellite static

        // Remove the satellite from the physics world
        this.world.removeBody(this.body);

        // Attach the satellite to the Earth's rotation group
        this.earth.rotationGroup.add(this.mesh);

        // Update the satellite's position relative to Earth's rotation group
        const scaleFactor = Constants.metersToKm * Constants.scale;
        this.mesh.position.set(
            position.x * scaleFactor,
            position.y * scaleFactor,
            position.z * scaleFactor
        );
    }

    initTraceLine() {
        const traceLineGeometry = new THREE.BufferGeometry();
        traceLineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxTracePoints * 3), 3));
        this.traceLine = new THREE.Line(traceLineGeometry, this.materials.traceLine);
        this.traceLine.frustumCulled = false;
        this.scene.add(this.traceLine);
    }

    initOrbitLine() {
        const orbitLineGeometry = new THREE.BufferGeometry();
        this.orbitLine = new THREE.Line(orbitLineGeometry, this.materials.orbitLine);
        this.orbitLine.frustumCulled = false;
        this.scene.add(this.orbitLine);
    }

    initApsides() {
        const sphereGeometry = new THREE.BufferGeometry();
        sphereGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));

        this.periapsisMesh = new THREE.Points(sphereGeometry, this.materials.periapsis);
        this.apoapsisMesh = new THREE.Points(sphereGeometry, this.materials.apoapsis);

        this.scene.add(this.periapsisMesh);
        this.scene.add(this.apoapsisMesh);
    }

    updateApsides(orbitalElements) {
        const { h, e, i, omega, w } = orbitalElements;
        const mu = Constants.G * Constants.earthMass;

        // Calculate periapsis and apoapsis distances
        const rPeriapsis = h * h / (mu * (1 + e));
        const rApoapsis = h * h / (mu * (1 - e));

        // Calculate position vectors in the orbital plane
        const periapsisVector = new THREE.Vector3(rPeriapsis, 0, 0);
        const apoapsisVector = new THREE.Vector3(-rApoapsis, 0, 0); // Apoapsis is in the opposite direction

        // Rotate by argument of periapsis
        periapsisVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);
        apoapsisVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);

        // Rotate by inclination
        periapsisVector.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);
        apoapsisVector.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);

        // Rotate by longitude of ascending node
        periapsisVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);
        apoapsisVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);

        // Convert to kilometers for Three.js
        periapsisVector.multiplyScalar(Constants.metersToKm * Constants.scale);
        apoapsisVector.multiplyScalar(Constants.metersToKm * Constants.scale);

        // Set positions
        this.periapsisMesh.position.copy(periapsisVector);
        this.apoapsisMesh.position.copy(apoapsisVector);
    }

    serialize() {
        return {
            id: this.id,
            mass: this.body.mass,
            position: { x: this.body.position.x, y: this.body.position.y, z: this.body.position.z },
            velocity: { x: this.body.velocity.x, y: this.body.velocity.y, z: this.body.velocity.z },
            size: Constants.satelliteRadius,
        };
    }

    updateFromSerialized(data) {
        this.body.position.copy(data.position);
        this.body.velocity.copy(data.velocity);
        this.altitude = data.altitude;
        this.gravityVector.copy(data.acceleration);
        this.dragForce.copy(data.dragForce);
    
        this.updateMeshPosition();
        this.updateOrbitalElements();
    }

    updateMeshPosition() {
        const scaleFactor = Constants.metersToKm * Constants.scale;
        this.mesh.position.set(
            this.body.position.x * scaleFactor,
            this.body.position.y * scaleFactor,
            this.body.position.z * scaleFactor
        );
        this.mesh.quaternion.copy(this.body.quaternion);
    }

    deleteSatellite() {
        this.scene.remove(this.mesh);
        this.world.removeBody(this.body);
        this.scene.remove(this.traceLine);
        this.scene.remove(this.orbitLine);
        this.scene.remove(this.periapsisMesh);
        this.scene.remove(this.apoapsisMesh);
        this.worker.terminate();
    }

    getCurrentAltitude() {
        return this.altitude;
    }

    getCurrentVelocity() {
        return this.body.velocity.length();
    }

    getCurrentEarthGravityForce() {
        return this.gravityVector; // Avoid division by zero
    }

    getCurrentDragForce() {
        return this.dragForce.length();
    }

    setColor(color) {
        this.color = color;
        this.mesh.material.color.set(color);
        this.traceLine.material.color.set(color);
        this.orbitLine.material.color.set(color);
    }

    updateSatellite(currentTime, realDeltaTime, warpedDeltaTime) {
        if (!this.initialized) return;

        const utcCurrentTime = new Date(currentTime).toISOString();

        if (!this.landed) {
            // Check for any maneuvers that need to be executed
            this.executeManeuvers(currentTime);

            this.worker.postMessage({
                type: 'step',
                data: {
                    currentTime: utcCurrentTime,
                    realDeltaTime,
                    warpedDeltaTime,
                    earthPosition: this.earth.earthBody.position,
                    moonPosition: this.moon.moonBody.position,
                    earthRadius: Constants.earthRadius,
                    id: this.id
                }
            });

            this.updateMeshPosition();
        } else {
            // Update position to follow Earth's rotation
            this.updatePositionRelativeToEarth();
        }
    }

    updatePositionRelativeToEarth() {
        const position = this.body.position;
        const scaleFactor = Constants.metersToKm * Constants.scale;
        this.mesh.position.set(
            position.x * scaleFactor,
            position.y * scaleFactor,
            position.z * scaleFactor
        );
    }

    applyBufferedUpdates() {
        if (this.updateBuffer.length > 0) {
            const data = this.updateBuffer.shift();
            this.updateFromSerialized(data);
            this.updateTraceLine(Date.now());
        }
    }

    updateTraceLine(currentTime) {
        const currentPosition = new THREE.Vector3().copy(this.mesh.position);
        this.dynamicPositions.push(currentPosition);
        this.creationTimes.push(currentTime);

        if (this.dynamicPositions.length > this.maxTracePoints) {
            this.dynamicPositions.shift();
            this.creationTimes.shift();
        }

        const positions = new Float32Array(this.dynamicPositions.length * 3);
        this.dynamicPositions.forEach((pos, i) => {
            positions.set([pos.x, pos.y, pos.z], i * 3);
        });

        this.traceLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.traceLine.geometry.attributes.position.needsUpdate = true;
        this.traceLine.geometry.setDrawRange(0, this.dynamicPositions.length);
    }

    updateOrbitalElements() {
        const mu = Constants.G * Constants.earthMass; // Standard gravitational parameter for Earth
        const position = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
        const velocity = new THREE.Vector3(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);
        const orbitalElements = PhysicsUtils.calculateOrbitalElements(position, velocity, mu);

        this.maneuverCalculator.setCurrentOrbit(orbitalElements); // Update current orbit in ManeuverCalculator

        // Compute orbit points
        const orbitPoints = PhysicsUtils.computeOrbit(orbitalElements, mu);

        // Update orbit line geometry
        const positions = new Float32Array(orbitPoints.length * 3);
        orbitPoints.forEach((point, i) => {
            positions.set([point.x, point.y, point.z], i * 3);
        });

        this.orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.orbitLine.geometry.attributes.position.needsUpdate = true;

        // Update periapsis and apoapsis positions
        this.updateApsides(orbitalElements);
    }

    setTargetOrbit(targetElements) {
        this.maneuverCalculator.setTargetOrbit(targetElements);
    }

    calculateDeltaV() {
        return this.maneuverCalculator.calculateDeltaV();
    }

    applyDeltaV(deltaV, direction) {
        if (!this.initialized || this.landed) return;

        // Get the current velocity vector
        const velocity = this.body.velocity.clone();
        const velocityLength = velocity.length();

        if (velocityLength === 0) return; // Avoid division by zero

        // Normalize the velocity vector to get the direction
        const normalizedVelocity = velocity.clone().normalize();

        // Calculate the thrust vector in the direction of the velocity
        const thrustVector = new CANNON.Vec3(
            normalizedVelocity.x * direction.x,
            normalizedVelocity.y * direction.y,
            normalizedVelocity.z * direction.z
        );

        // Scale the thrust vector by the deltaV
        thrustVector.scale(deltaV, thrustVector);

        // Apply the force to the satellite body
        this.body.applyImpulse(thrustVector, this.body.position);
    }

    updateOrbitTrace() {
        const positionAttribute = this.traceLine.geometry.attributes.position;
        const tracePositions = positionAttribute.array;

        if (this.dynamicPositions.length > this.maxTracePoints) {
            this.dynamicPositions.shift();
        }

        this.dynamicPositions.push(this.mesh.position.clone());

        for (let i = 0; i < this.dynamicPositions.length; i++) {
            tracePositions[i * 3] = this.dynamicPositions[i].x;
            tracePositions[i * 3 + 1] = this.dynamicPositions[i].y;
            tracePositions[i * 3 + 2] = this.dynamicPositions[i].z;
        }

        positionAttribute.needsUpdate = true;
    }

    calculateBestMomentDeltaV(targetElements) {
        return this.maneuverCalculator.calculateBestMomentDeltaV(targetElements);
    }

    executeManeuvers(currentTime) {
        // Sort maneuvers by time
        this.maneuverNodes.sort((a, b) => a.time - b.time);

        // Execute maneuvers that are due
        while (this.maneuverNodes.length > 0 && this.maneuverNodes[0].time <= currentTime) {
            const node = this.maneuverNodes.shift();
            this.applyDeltaV(node.deltaV, node.direction);
        }
    }

    updateOrbitLine(orbitPoints) {
        const positions = [];
        for (const point of orbitPoints) {
            positions.push(point.x, point.y, point.z);
        }
        this.orbitLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.orbitLine.geometry.attributes.position.needsUpdate = true;
    }

    renderTargetOrbit(targetElements) {
        const orbitPoints = PhysicsUtils.computeOrbit(targetElements, Constants.G * Constants.earthMass);
        this.updateOrbitLine(orbitPoints);
    }

    addManeuverNode(time, direction, deltaV) {
        const maneuverNode = new ManeuverNode(time, direction, deltaV);
        this.maneuverNodes.push(maneuverNode);
    }

    renderManeuverNode(time) {
        const position = this.getPositionAtTime(time);
        if (!this.maneuverNodeMesh) {
            const sphereGeometry = new THREE.SphereGeometry(10, 16, 16);
            this.maneuverNodeMesh = new THREE.Points(sphereGeometry, this.materials.maneuverNode);
            this.scene.add(this.maneuverNodeMesh);
        }
        this.maneuverNodeMesh.position.copy(position);
    }

    getPositionAtTime(time) {
        const mu = Constants.G * Constants.earthMass;
        const a = this.maneuverCalculator.currentOrbitalElements.semiMajorAxis;
        const e = this.maneuverCalculator.currentOrbitalElements.eccentricity;
        const i = this.maneuverCalculator.currentOrbitalElements.inclination;
        const omega = this.maneuverCalculator.currentOrbitalElements.longitudeOfAscendingNode;
        const w = this.maneuverCalculator.currentOrbitalElements.argumentOfPeriapsis;

        // Mean motion (rad/s)
        const n = Math.sqrt(mu / Math.pow(a, 3));

        // Mean anomaly
        const M = n * time;

        // Solve Kepler's equation for Eccentric anomaly (E)
        const E = PhysicsUtils.solveKeplersEquation(M, e);

        // True anomaly
        const trueAnomaly = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));

        // Distance to the central body
        const r = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));

        // Position in the orbital plane
        const x = r * Math.cos(trueAnomaly);
        const y = r * Math.sin(trueAnomaly);

        // Rotate by argument of periapsis
        const position = new THREE.Vector3(x, y, 0);
        position.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);

        // Rotate by inclination
        position.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);

        // Rotate by longitude of ascending node
        position.applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);

        // Convert to kilometers for Three.js
        position.multiplyScalar(Constants.metersToKm * Constants.scale);

        return position;
    }

}
