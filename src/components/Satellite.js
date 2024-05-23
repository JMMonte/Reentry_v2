import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Constants } from '../utils/Constants.js';
import PhysicsWorkerURL from 'url:../workers/physicsWorker.js';

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

        this.initProperties(position, velocity);
        this.initWorker();
        this.initTraceLine();
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
        this.body.position.copy(position);
        this.body.velocity.copy(velocity);

        const geometry = new THREE.SphereGeometry(Constants.satelliteRadius, 16, 16);
        const materialThree = new THREE.MeshBasicMaterial({ color: this.color });
        this.mesh = new THREE.Mesh(geometry, materialThree);
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

    initTraceLine() {
        const traceLineGeometry = new THREE.BufferGeometry();
        traceLineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxTracePoints * 3), 3));
        const traceLineMaterial = new THREE.LineBasicMaterial({ color: this.color });
        this.traceLine = new THREE.Line(traceLineGeometry, traceLineMaterial);
        this.scene.add(this.traceLine);
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
    }

    updateMeshPosition() {
        const scaleFactor = Constants.scale * Constants.metersToKm;
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
        this.worker.terminate();
    }

    getCurrentAltitude() {
        return this.altitude;
    }

    getCurrentVelocity() {
        return this.body.velocity.length();
    }

    getCurrentAcceleration() {
        const force = this.gravityVector;
        return force.length() / (this.body.mass); // Avoid division by zero
    }

    getCurrentDragForce() {
        return this.dragForce.length();
    }

    setColor(color) {
        this.color = color;
        this.mesh.material.color.set(color);
        this.traceLine.material.color.set(color);
    }

    updateSatellite(currentTime, realDeltaTime, warpedDeltaTime) {
        if (!this.initialized) return;

        const utcCurrentTime = new Date(currentTime).toISOString();

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
}
