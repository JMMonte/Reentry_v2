import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Satellite {
    constructor(scene, world, earth) {
        this.scene = scene;
        this.world = world;
        this.earthRadius = earth.earthRadius; // Make sure earthRadius is properly initialized in Earth class
        this.initMesh();
        this.initPhysics();
        this.initTraceLine();
    }

    initMesh() {
        const geometry = new THREE.SphereGeometry(100, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.satelliteMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.satelliteMesh);
    }

    initPhysics() {
        const position = new CANNON.Vec3(0, this.earthRadius + 2000, 0); // Ensure non-colliding start position
        const velocity = new CANNON.Vec3(7.5, 0, 0); // Ensure sufficient initial velocity
        const shape = new CANNON.Sphere(100);
        this.satelliteBody = new CANNON.Body({ mass: 100, position, shape });
        this.satelliteBody.velocity = velocity;
        this.world.addBody(this.satelliteBody);
    }

    initTraceLine() {
        this.traceMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
        this.traceGeometry = new THREE.BufferGeometry();
        this.tracePositions = new Float32Array(1000 * 3);  // 1000 points * 3 coordinates
        this.traceGeometry.setAttribute('position', new THREE.BufferAttribute(this.tracePositions, 3));
        this.traceLine = new THREE.Line(this.traceGeometry, this.traceMaterial);
        this.scene.add(this.traceLine);
        this.maxTracePoints = 1000;
        this.currentTraceIndex = 0;
    }

    updateSatellite() {
        this.satelliteMesh.position.copy(this.satelliteBody.position);
        this.updateTraceLine();
        this.updatePhysics();
    }

    updatePhysics() {
        // Ensuring satellite position and quaternion are valid before copying
        if (!isNaN(this.satelliteBody.position.x)) {
            this.satelliteMesh.position.copy(this.satelliteBody.position);
            this.satelliteMesh.quaternion.copy(this.satelliteBody.quaternion);
        }
    }

    updateTraceLine() {
        const index = this.currentTraceIndex * 3;
        if (this.currentTraceIndex < this.maxTracePoints) {
            this.tracePositions.set([this.satelliteMesh.position.x, this.satelliteMesh.position.y, this.satelliteMesh.position.z], index);
            this.currentTraceIndex++;
        } else {
            this.tracePositions.copyWithin(0, 3);  // Shift all data one position backwards
            this.tracePositions.set([this.satelliteMesh.position.x, this.satelliteMesh.position.y, this.satelliteMesh.position.z], this.tracePositions.length - 3);
        }
        this.traceGeometry.attributes.position.needsUpdate = true;
    }
}
