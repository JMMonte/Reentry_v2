import * as THREE from 'three';

export class TracePath {
    constructor(color, maxTracePoints = 1000) {
        this.maxTracePoints = maxTracePoints;
        this.tracePoints = [];
        this.traceLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
                color,
                linewidth: 2,
                transparent: true,
                opacity: 0.5
            })
        );
        this.traceLine.frustumCulled = false;
        this.traceLine.visible = false;
        this.worker = new Worker(new URL('../../workers/traceWorker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => {
            if (e.data.type === 'TRACE_UPDATE' && this._currentId && e.data.id === this._currentId) {
                this.tracePoints = e.data.tracePoints.map(pt => new THREE.Vector3(pt.x, pt.y, pt.z));
                if (this.traceLine.visible) {
                    this.traceLine.geometry.setFromPoints(this.tracePoints);
                    this.traceLine.geometry.computeBoundingSphere();
                }
            }
        };
    }

    update(position, id) {
        this._currentId = id;
        this.worker.postMessage({
            type: 'UPDATE_TRACE',
            id,
            position: { x: position.x, y: position.y, z: position.z }
        });
    }

    setVisible(visible) {
        this.traceLine.visible = visible;
    }

    setColor(color) {
        if (this.traceLine.material) {
            this.traceLine.material.color.set(color);
        }
    }

    dispose() {
        if (this.traceLine.geometry) this.traceLine.geometry.dispose();
        if (this.traceLine.material) this.traceLine.material.dispose();
        if (this.worker) this.worker.terminate();
    }
} 