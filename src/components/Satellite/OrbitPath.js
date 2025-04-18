import * as THREE from 'three';

export class OrbitPath {
    constructor(color) {
        this.orbitPoints = [];
        this.orbitLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
                color,
                linewidth: 2,
                transparent: true,
                opacity: 0.7
            })
        );
        this.orbitLine.frustumCulled = false;
        this.orbitLine.visible = false;
        this.worker = new Worker(new URL('../../workers/orbitPathWorker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => {
            if (e.data.type === 'ORBIT_PATH_UPDATE' && this._currentId && e.data.id === this._currentId) {
                this.orbitPoints = e.data.orbitPoints.map(pt => new THREE.Vector3(pt.x, pt.y, pt.z));
                if (this.orbitLine.visible) {
                    this.orbitLine.geometry.setFromPoints(this.orbitPoints);
                    this.orbitLine.geometry.computeBoundingSphere();
                }
            }
        };
    }

    update(position, velocity, id, constants) {
        this._currentId = id;
        this.worker.postMessage({
            type: 'UPDATE_ORBIT',
            id,
            position: { x: position.x, y: position.y, z: position.z },
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
            constants
        });
    }

    setVisible(visible) {
        this.orbitLine.visible = visible;
    }

    setColor(color) {
        if (this.orbitLine.material) {
            this.orbitLine.material.color.set(color);
        }
    }

    dispose() {
        if (this.orbitLine.geometry) this.orbitLine.geometry.dispose();
        if (this.orbitLine.material) this.orbitLine.material.dispose();
        if (this.worker) this.worker.terminate();
    }
} 