import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Constants } from '../utils/Constants.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { ManeuverCalculator } from './ManeuverCalculator.js';
import PhysicsWorkerURL from 'url:../workers/physicsWorker.js';

class ManeuverNode {
    constructor(time, direction, deltaV) {
        this.time = time; // Exact time in the simulation when the maneuver should occur
        this.direction = direction; // THREE.Vector3 representing the direction of the thrust
        this.deltaV = deltaV; // The amount of delta-v (change in velocity) necessary
    }
}

export class Satellite {
    constructor(scene, world, earth, moon, position, velocity, id, color) {
        // Properties
        this.scene = scene;
        this.world = world;
        this.earth = earth;
        this.moon = moon;
        this.id = id;
        this.color = color;
        this.initialized = false;
        this.updateBuffer = [];
        this.landed = false;

        this.materials = this.createMaterials(color);

        if (!position || !velocity) {
            throw new Error("Position and velocity must be defined");
        }

        this.initProperties(position, velocity);
        this.initWorker();
        this.initVisualElements();

        this.maneuverNodes = [];
        this.maneuverCalculator = new ManeuverCalculator();

        // Dummy controllers for properties, to avoid undefined errors
        this.initDummyControllers();
    }

    // Initialization methods
    initProperties(position, velocity) {
        const material = new CANNON.Material({ friction: 0.0, restitution: 0.3 });
        const size = new CANNON.Vec3(Constants.satelliteRadius, Constants.satelliteRadius, Constants.satelliteRadius * 2);
        const shape = new CANNON.Box(size);
        const volume = size.x * size.y * size.z;
        const aluminumDensity = 2700; // kg/m^3
        const monopropellantDensity = 800; // kg/m^3
        this.satelliteMass = (0.1 * volume * aluminumDensity) + (0.1 * volume * monopropellantDensity);
        this.body = new CANNON.Body({ mass: this.satelliteMass, shape, material });

        this.body.position.copy(position);
        this.body.velocity.copy(velocity);

        const geometry = new THREE.ConeGeometry(Constants.satelliteRadius, Constants.satelliteRadius * 2, 3, 1);
        this.mesh = new THREE.Mesh(geometry, this.materials.satellite);
        this.scene.add(this.mesh);

        this.gravityVector = new CANNON.Vec3();
        this.moonGravityVector = new CANNON.Vec3();
        this.dragForce = new CANNON.Vec3();
        this.dynamicPositions = [];
        this.creationTimes = [];
        this.maxTracePoints = 10000;
        this.groundTracePoints = [];
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

    initVisualElements() {
        this.initTraceLine();
        this.initOrbitLine();
        this.initTargetOrbitLine();
        this.initApsides();
        this.initGroundTrace(); // Initialize ground trace
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

    initTargetOrbitLine() {
        const targetOrbitLineGeometry = new THREE.BufferGeometry();
        this.targetOrbitLine = new THREE.Line(targetOrbitLineGeometry, this.materials.targetOrbitLine);
        this.targetOrbitLine.frustumCulled = false;
        this.scene.add(this.targetOrbitLine);
    }

    initApsides() {
        const sphereGeometry = new THREE.BufferGeometry();
        sphereGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));

        this.periapsisMesh = new THREE.Points(sphereGeometry, this.materials.periapsis);
        this.apoapsisMesh = new THREE.Points(sphereGeometry, this.materials.apoapsis);

        this.scene.add(this.periapsisMesh);
        this.scene.add(this.apoapsisMesh);
    }

    initGroundTrace() {
        const groundTraceGeometry = new THREE.BufferGeometry();
        groundTraceGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxTracePoints * 3), 3));
        this.groundTrace = new THREE.Line(groundTraceGeometry, this.materials.traceLine);
        this.groundTrace.frustumCulled = false;
        this.scene.add(this.groundTrace); // Add to the scene initially
    }

    initDummyControllers() {
        this.altitudeController = { setValue: () => this, updateDisplay: () => {} };
        this.velocityController = { setValue: () => this, updateDisplay: () => {} };
        this.earthGravityForceController = { setValue: () => this, updateDisplay: () => {} };
        this.moonGravityForceController = { setValue: () => this, updateDisplay: () => {} };
        this.dragController = { setValue: () => this, updateDisplay: () => {} };
    }

    // Serialization methods
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
        this.gravityVector.copy(data.earthGravity);
        this.moonGravityVector.copy(data.moonGravity);
        this.dragForce.copy(data.dragForce);

        this.updateMeshPosition();
        this.updateOrbitalElements();
    }

    // Update methods
    updateSatellite(currentTime, realDeltaTime, warpedDeltaTime) {
        if (!this.initialized) return;

        const utcCurrentTime = new Date(currentTime).toISOString();

        if (!this.landed) {
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
            this.updateGroundTrace(); // Add this line
        } else {
            this.updatePositionRelativeToEarth();
        }
    }

    applyBufferedUpdates() {
        if (this.updateBuffer.length > 0) {
            const data = this.updateBuffer.shift();
            this.updateFromSerialized(data);
            this.updateTraceLine(Date.now());
        }
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

    updateGroundTrace() {
        const currentPosition = this.mesh.position.clone();
        const earthPosition = this.earth.earthMesh.position.clone();
    
        // Calculate relative position to Earth
        const relativePosition = currentPosition.sub(earthPosition);
    
        // Normalize the relative position and scale by Earth's radius to project onto the surface
        const radius = Constants.earthRadius * Constants.metersToKm * Constants.scale;
        const normalizedPosition = relativePosition.normalize();
        const surfacePosition = normalizedPosition.multiplyScalar(radius);
    
        // Convert the projected position to latitude and longitude
        const lat = Math.asin(surfacePosition.z / radius);
        const lon = Math.atan2(surfacePosition.y, surfacePosition.x);
    
        // Convert latitude and longitude back to ECI coordinates
        const groundPoint = new THREE.Vector3(
            radius * Math.cos(lat) * Math.cos(lon),
            radius * Math.cos(lat) * Math.sin(lon),
            radius * Math.sin(lat)
        );
    
        // Store the point in the ground trace points array
        this.groundTracePoints.push(groundPoint);
    
        // Remove the oldest point if we exceed the maximum number of points
        if (this.groundTracePoints.length > this.maxTracePoints) {
            this.groundTracePoints.shift();
        }
    
        // Update the ground trace line geometry
        const positions = new Float32Array(this.groundTracePoints.length * 3);
        this.groundTracePoints.forEach((pos, i) => {
            positions.set([pos.x, pos.y, pos.z], i * 3);
        });
    
        this.groundTrace.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.groundTrace.geometry.attributes.position.needsUpdate = true;
        this.groundTrace.geometry.setDrawRange(0, this.groundTracePoints.length);
    }

    updateOrbitalElements() {
        const mu = Constants.G * Constants.earthMass;
        const position = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
        const velocity = new THREE.Vector3(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);
        const orbitalElements = PhysicsUtils.calculateOrbitalElements(position, velocity, mu);

        this.maneuverCalculator.setCurrentOrbit(orbitalElements);

        const orbitPoints = PhysicsUtils.computeOrbit(orbitalElements, mu);

        const positions = new Float32Array(orbitPoints.length * 3);
        orbitPoints.forEach((point, i) => {
            positions.set([point.x, point.y, point.z], i * 3);
        });

        this.orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.orbitLine.geometry.attributes.position.needsUpdate = true;

        this.updateApsides(orbitalElements);
    }

    updateApsides(orbitalElements) {
        const { h, e, i, omega, w } = orbitalElements;
        const mu = Constants.G * Constants.earthMass;

        const rPeriapsis = h * h / (mu * (1 + e));
        const rApoapsis = h * h / (mu * (1 - e));

        const periapsisVector = new THREE.Vector3(rPeriapsis, 0, 0);
        const apoapsisVector = new THREE.Vector3(-rApoapsis, 0, 0);

        periapsisVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);
        apoapsisVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), w);

        periapsisVector.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);
        apoapsisVector.applyAxisAngle(new THREE.Vector3(1, 0, 0), i);

        periapsisVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);
        apoapsisVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), omega);

        periapsisVector.multiplyScalar(Constants.metersToKm * Constants.scale);
        apoapsisVector.multiplyScalar(Constants.metersToKm * Constants.scale);

        this.periapsisMesh.position.copy(periapsisVector);
        this.apoapsisMesh.position.copy(apoapsisVector);
    }

    // Maneuver methods
    executeManeuvers(currentTime) {
        this.maneuverNodes.sort((a, b) => a.time - b.time);

        while (this.maneuverNodes.length > 0 && this.maneuverNodes[0].time <= currentTime) {
            const node = this.maneuverNodes.shift();
            this.applyDeltaV(node.deltaV, node.direction);
        }
    }

    applyDeltaV(deltaV, direction) {
        if (!this.initialized || this.landed) return;

        const velocity = this.body.velocity.clone();
        const velocityLength = velocity.length();

        if (velocityLength === 0) return;

        const normalizedVelocity = velocity.clone().normalize();

        const thrustVector = new CANNON.Vec3(
            normalizedVelocity.x * direction.x,
            normalizedVelocity.y * direction.y,
            normalizedVelocity.z * direction.z
        );

        thrustVector.scale(deltaV, thrustVector);

        this.body.applyImpulse(thrustVector, this.body.position);
    }

    calculateDeltaV() {
        return this.maneuverCalculator.calculateDeltaV();
    }

    calculateBestMomentDeltaV(targetElements) {
        return this.maneuverCalculator.calculateBestMomentDeltaV(targetElements);
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
        return PhysicsUtils.getPositionAtTime(this.maneuverCalculator.currentOrbitalElements, time);
    }

    // Render methods
    renderTargetOrbit(targetElements) {
        const orbitPoints = PhysicsUtils.computeOrbit(targetElements, Constants.G * Constants.earthMass);
        this.updateTargetOrbitLine(orbitPoints);
    }

    updateOrbitLine(orbitPoints) {
        const positions = [];
        for (const point of orbitPoints) {
            positions.push(point.x, point.y, point.z);
        }
        this.orbitLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.orbitLine.geometry.attributes.position.needsUpdate = true;
    }

    updateTargetOrbitLine(orbitPoints) {
        const positions = [];
        for (const point of orbitPoints) {
            positions.push(point.x, point.y, point.z);
        }
        this.targetOrbitLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.targetOrbitLine.geometry.attributes.position.needsUpdate = true;
    }

    // Getters
    getCurrentAltitude() {
        return this.altitude;
    }

    getCurrentVelocity() {
        return this.body.velocity.length();
    }

    getCurrentEarthGravityForce() {
        return this.gravityVector;
    }

    getCurrentMoonGravityForce() {
        return this.moonGravityVector.length();
    }

    getCurrentDragForce() {
        return this.dragForce.length();
    }

    getPeriapsisAltitude() {
        const periapsisDistance = this.periapsisMesh.position.length();
        return (periapsisDistance / Constants.scale - Constants.earthRadius * Constants.metersToKm) * Constants.kmToMeters;
    }

    getApoapsisAltitude() {
        const apoapsisDistance = this.apoapsisMesh.position.length();
        return (apoapsisDistance / Constants.scale - Constants.earthRadius * Constants.metersToKm) * Constants.kmToMeters;
    }

    getMesh() {
        return this.mesh;
    }

    // Setters
    setColor(color) {
        this.color = color;
        this.mesh.material.color.set(color);
        this.traceLine.material.color.set(color);
        this.orbitLine.material.color.set(color);
        this.groundTrace.material.color.set(color);
    }

    // Visibility methods
    setOrbitVisible(visible) {
        this.orbitLine.visible = visible;
        this.apoapsisMesh.visible = visible;
        this.periapsisMesh.visible = visible;
    }

    setTraceVisible(visible) {
        this.traceLine.visible = visible;
    }

    setGroundTraceVisible(visible) {
        this.groundTrace.visible = visible;
    }

    // Utility methods
    handleLanding(position) {
        this.landed = true;
        this.body.position.copy(position);
        this.body.velocity.set(0, 0, 0);
        this.body.mass = 0;

        this.world.removeBody(this.body);

        this.earth.rotationGroup.add(this.mesh);

        const scaleFactor = Constants.metersToKm * Constants.scale;
        this.mesh.position.set(
            position.x * scaleFactor,
            position.y * scaleFactor,
            position.z * scaleFactor
        );

        // Convert ECI to ground coordinates
        const gmst = PhysicsUtils.calculateGMST(new Date());
        const groundPosition = PhysicsUtils.eciToGroundPosition(position, gmst);
        this.earth.addImpactPoint(groundPosition);
    }

    updatePositionRelativeToEarth() {
        const earthPosition = this.earth.earthBody.position.clone();
        const relativePosition = this.mesh.position.sub(earthPosition);

        this.mesh.position.copy(relativePosition);
    }

    createMaterials(color) {
        return {
            satellite: new THREE.MeshBasicMaterial({ color }),
            traceLine: new THREE.LineBasicMaterial({ color, linewidth: 1 }),
            orbitLine: new THREE.LineBasicMaterial({ color, opacity: 0.2, transparent: true }),
            periapsis: new THREE.PointsMaterial({ color: 0xff0000, size: 5, opacity: 0.5, transparent: true, sizeAttenuation: false }),
            apoapsis: new THREE.PointsMaterial({ color: 0x0000ff, size: 5, opacity: 0.5, transparent: true, sizeAttenuation: false }),
            maneuverNode: new THREE.PointsMaterial({ color: 0x00ff00, size: 5, opacity: 0.5, transparent: true, sizeAttenuation: false }),
            targetOrbitLine: new THREE.LineBasicMaterial({ color: 0xff00ff, opacity: 0.5, transparent: true })
        };
    }
}
