import * as THREE from 'three';

export class GroundTrackPath {
    constructor(color, id, maxTracePoints = 1000) {
        this.id = id;
        this.maxTracePoints = maxTracePoints;
        this.groundTrackPoints = [];
        this.groundTrackLine = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: 0.5,
                depthWrite: false,
                depthTest: true
            })
        );
        this.groundTrackLine.renderOrder = 2;
        this.groundTrackLine.frustumCulled = false;
        this.groundTrackLine.visible = false;
        this.worker = new Worker(new URL('../../workers/groundTrackWorker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => {
            if (e.data.type === 'GROUND_TRACK_UPDATE' && e.data.id === this.id) {
                this.groundTrackPoints = e.data.groundTracePoints.map(pt => new THREE.Vector3(pt.x, pt.y, pt.z));

                if (this.groundTrackLine.visible) {
                    this.groundTrackLine.geometry.setFromPoints(this.groundTrackPoints);
                    this.groundTrackLine.geometry.computeBoundingSphere();
                }
            }
        };
    }

    update(groundPoint) {
        this.worker.postMessage({
            type: 'UPDATE_GROUND_POINT',
            id: this.id,
            groundPoint: { x: groundPoint.x, y: groundPoint.y, z: groundPoint.z }
        });
    }

    setVisible(visible) {
        this.groundTrackLine.visible = visible;
    }

    setColor(color) {
        if (this.groundTrackLine.material) {
            this.groundTrackLine.material.color.set(color);
        }
    }

    dispose() {
        if (this.groundTrackLine.geometry) this.groundTrackLine.geometry.dispose();
        if (this.groundTrackLine.material) this.groundTrackLine.material.dispose();
        if (this.worker) this.worker.terminate();
    }
} 