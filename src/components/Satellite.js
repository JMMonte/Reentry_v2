import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Constants } from '../utils/Constants.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { ManeuverCalculator } from './ManeuverCalculator.js';
import { ApsisVisualizer } from './ApsisVisualizer.js';
import PhysicsWorkerURL from 'url:../workers/physicsWorker.js';

class ManeuverNode {
    constructor(time, direction, deltaV) {
        this.time = time;
        this.direction = direction;
        this.deltaV = deltaV;
    }
}

export class Satellite {
    constructor(scene, world, earth, moon, position, velocity, id, color, name) {
        this.name = name;
        this.initializeProperties(scene, world, earth, moon, id, color);
        this.initializePhysics(position, velocity);
        this.initializeVisuals();
        this.initializeWorker();
    }

    // Initialization methods
    initializeProperties(scene, world, earth, moon, id, color) {
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
        this.maneuverNodes = [];
        this.maneuverCalculator = new ManeuverCalculator();
        this.initializeDummyControllers();
    }

    initializePhysics(position, velocity) {
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

        this.gravityVector = new CANNON.Vec3();
        this.moonGravityVector = new CANNON.Vec3();
        this.dragForce = new CANNON.Vec3();
    }

    initializeVisuals() {
        const geometry = new THREE.BoxGeometry(
            Constants.satelliteRadius * 2,
            Constants.satelliteRadius * 2,
            Constants.satelliteRadius * 4
        );
        this.mesh = new THREE.Mesh(geometry, this.materials.satellite);
        this.scene.add(this.mesh);

        this.dynamicPositions = [];
        this.creationTimes = [];
        this.maxTracePoints = 10000;
        this.groundTracePoints = [];

        this.initializeTraceLine();
        this.initializeOrbitLine();
        this.initializeTargetOrbitLine();
        this.apsisVisualizer = new ApsisVisualizer(this.scene, this.color);
        this.initializeGroundTrace();
    }

    initializeWorker() {
        this.worker = new Worker(PhysicsWorkerURL);
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.sendWorkerInitMessage();
    }

    initializeDummyControllers() {
        const dummyController = { setValue: () => this, updateDisplay: () => {} };
        this.altitudeController = dummyController;
        this.velocityController = dummyController;
        this.earthGravityForceController = dummyController;
        this.moonGravityForceController = dummyController;
        this.dragController = dummyController;
    }

    // Worker communication methods
    handleWorkerMessage(event) {
        const { type, data } = event.data;
        if (type === 'initComplete') {
            this.initialized = true;
            this.world.addBody(this.body);
        } else if (type === 'stepComplete' && data.id === this.id) {
            this.updateBuffer.push(data);
        } else if (type === 'landed' && data.id === this.id) {
            this.handleLanding(data.position);
        }
    }

    sendWorkerInitMessage() {
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

    // Update methods
    updateSatellite(currentTime, realDeltaTime, warpedDeltaTime) {
        if (!this.initialized) return;

        const utcCurrentTime = new Date(currentTime).toISOString();

        if (!this.landed) {
            this.executeManeuvers(currentTime);
            this.sendWorkerStepMessage(utcCurrentTime, realDeltaTime, warpedDeltaTime);
            this.updateMeshPosition();
            this.updateGroundTrace();
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
        const earthCenter = this.earth.earthMesh.position;
        const satellitePosition = this.mesh.position.clone().sub(earthCenter);
        const earthInverseMatrix = this.earth.rotationGroup.matrixWorld.clone().invert();
        const localSatellitePosition = satellitePosition.applyMatrix4(earthInverseMatrix);
        const groundPoint = localSatellitePosition.normalize().multiplyScalar(this.earth.EARTH_RADIUS);

        this.groundTracePoints.push(groundPoint);

        if (this.groundTracePoints.length > this.maxTracePoints) {
            this.groundTracePoints.shift();
        }

        this.updateGroundTraceLine();
    }

    updateGroundTraceLine() {
        if (!this.groundTraceLine) {
            const lineGeometry = new THREE.BufferGeometry();
            const lineMaterial = new THREE.LineBasicMaterial({ color: this.color });
            this.groundTraceLine = new THREE.Line(lineGeometry, lineMaterial);
            this.earth.rotationGroup.add(this.groundTraceLine);
        }

        const positions = new Float32Array(this.groundTracePoints.length * 3);
        this.groundTracePoints.forEach((point, index) => {
            positions[index * 3] = point.x;
            positions[index * 3 + 1] = point.y;
            positions[index * 3 + 2] = point.z;
        });

        this.groundTraceLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.groundTraceLine.geometry.attributes.position.needsUpdate = true;
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
        if (!this.apsisVisualizer) return;
        this.apsisVisualizer.update(this.body.position, this.body.velocity);
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
        const positions = orbitPoints.flatMap(point => [point.x, point.y, point.z]);
        this.orbitLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.orbitLine.geometry.attributes.position.needsUpdate = true;
    }

    updateTargetOrbitLine(orbitPoints) {
        const positions = orbitPoints.flatMap(point => [point.x, point.y, point.z]);
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
        return this.apsisVisualizer.getPeriapsisAltitude();
    }

    getApoapsisAltitude() {
        return this.apsisVisualizer.getApoapsisAltitude();
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
        if (this.apsisVisualizer) {
            this.apsisVisualizer.setVisible(visible);
        }
    }

    setTraceVisible(visible) {
        this.traceLine.visible = visible;
    }

    setGroundTraceVisible(visible) {
        this.groundTraceLine.visible = visible;
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
            satellite: new THREE.MeshPhongMaterial({ color }),
            traceLine: new THREE.LineBasicMaterial({ color, linewidth: 1 }),
            orbitLine: new THREE.LineBasicMaterial({ color, opacity: 0.2, transparent: true }),
            maneuverNode: new THREE.PointsMaterial({ color: 0x00ff00, size: 5, opacity: 0.5, transparent: true, sizeAttenuation: false }),
            targetOrbitLine: new THREE.LineBasicMaterial({ color: 0xff00ff, opacity: 0.5, transparent: true })
        };
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

    // Helper methods for initialization
    initializeTraceLine() {
        const traceLineGeometry = new THREE.BufferGeometry();
        traceLineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxTracePoints * 3), 3));
        this.traceLine = new THREE.Line(traceLineGeometry, this.materials.traceLine);
        this.traceLine.frustumCulled = false;
        this.scene.add(this.traceLine);
    }

    initializeOrbitLine() {
        const orbitLineGeometry = new THREE.BufferGeometry();
        this.orbitLine = new THREE.Line(orbitLineGeometry, this.materials.orbitLine);
        this.orbitLine.frustumCulled = false;
        this.scene.add(this.orbitLine);
    }

    initializeTargetOrbitLine() {
        const targetOrbitLineGeometry = new THREE.BufferGeometry();
        this.targetOrbitLine = new THREE.Line(targetOrbitLineGeometry, this.materials.targetOrbitLine);
        this.targetOrbitLine.frustumCulled = false;
        this.scene.add(this.targetOrbitLine);
    }

    initializeGroundTrace() {
        const groundTraceGeometry = new THREE.BufferGeometry();
        const lineMaterial = new THREE.LineBasicMaterial({ color: this.color });
        this.groundTraceLine = new THREE.Line(groundTraceGeometry, lineMaterial);
        this.groundTraceLine.frustumCulled = false;
        this.earth.rotationGroup.add(this.groundTraceLine);
    }

    // Helper methods for updates
    sendWorkerStepMessage(utcCurrentTime, realDeltaTime, warpedDeltaTime) {
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
    }

    // Cleanup method
    dispose() {
        console.log('Satellite.dispose: Starting disposal of satellite:', { id: this.id, name: this.name });
        
        // Dispatch satellite deleted event BEFORE removing from app3d.satellites
        document.dispatchEvent(new CustomEvent('satelliteDeleted', {
            detail: { 
                id: this.id,
                name: this.name
            }
        }));

        if (this.worker) {
            this.worker.terminate();
        }

        // Remove meshes and lines
        this.scene.remove(this.mesh);
        this.scene.remove(this.traceLine);
        this.scene.remove(this.orbitLine);
        if (this.apsisVisualizer) {
            this.apsisVisualizer.dispose();
        }
        this.earth.rotationGroup.remove(this.groundTraceLine);

        // Dispose of materials and geometries
        this.materials.satellite.dispose();
        this.materials.traceLine.dispose();
        this.materials.orbitLine.dispose();
        this.mesh.geometry.dispose();
        this.traceLine.geometry.dispose();
        this.orbitLine.geometry.dispose();

        if (this.groundTraceLine) {
            this.groundTraceLine.geometry.dispose();
            this.groundTraceLine.material.dispose();
        }

        if (this.world && this.body) {
            this.world.removeBody(this.body);
        }

        console.log('Satellite.dispose: Finished disposal of satellite:', { id: this.id, name: this.name });
    }

    // Coordinate transformation methods
    eciToEcef(positionECI, rotationAngle) {
        const x = positionECI.x * Math.cos(rotationAngle) + positionECI.y * Math.sin(rotationAngle);
        const y = -positionECI.x * Math.sin(rotationAngle) + positionECI.y * Math.cos(rotationAngle);
        const z = positionECI.z;
        return new THREE.Vector3(x, y, z);
    }

    ecefToEci(positionECEF, rotationAngle) {
        const x = positionECEF.x * Math.cos(rotationAngle) - positionECEF.y * Math.sin(rotationAngle);
        const y = positionECEF.x * Math.sin(rotationAngle) + positionECEF.y * Math.cos(rotationAngle);
        const z = positionECEF.z;
        return new THREE.Vector3(x, y, z);
    }
}