import * as THREE from 'three';
import { Constants } from '../../utils/Constants';

export class GroundTrack {
    constructor(earth, color, id) {
        if (!earth || !earth.rotationGroup) {
            console.error('Earth or Earth rotation group not provided to GroundTrack');
            return;
        }
        this.earth = earth;
        this.color = color;
        this.id = id;
        this.maxTracePoints = 1000;
        this.visible = false;

        this._positions = new Float32Array(this.maxTracePoints * 3);
        this.initializeGroundTrace();

        // Setup worker
        this.worker = new Worker(new URL('../../workers/groundTrackWorker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => {
            if (e.data.type === 'GROUND_TRACK_UPDATE' && e.data.id === this.id) {
                this.updateGeometry(e.data.groundTracePoints);
            }
        };

        // For local calculations
        this._relativePosition = new THREE.Vector3();
        this._localSatellitePosition = new THREE.Vector3();
        this._groundPoint = new THREE.Vector3();
    }

    initializeGroundTrace() {
        if (!this.earth || !this.earth.rotationGroup) return;

        const groundTraceGeometry = new THREE.BufferGeometry();
        groundTraceGeometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
        groundTraceGeometry.setDrawRange(0, 0);

        const lineMaterial = new THREE.LineBasicMaterial({
            color: this.color,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            depthTest: true
        });
        this.groundTraceLine = new THREE.Line(groundTraceGeometry, lineMaterial);
        this.groundTraceLine.renderOrder = 2;
        this.groundTraceLine.frustumCulled = false;
        this.groundTraceLine.visible = this.visible;
        this.earth.rotationGroup.add(this.groundTraceLine);
    }

    update(satellitePosition) {
        if (!this.earth || !this.groundTraceLine) return;
        // --- Restore old logic: transform to local Earth frame ---
        const earthCenter = this.earth.earthMesh.position;
        this._relativePosition.copy(satellitePosition).sub(earthCenter);
        this._localSatellitePosition.copy(this._relativePosition).applyMatrix4(this.earth.rotationGroup.matrixWorld.clone().invert());
        this._groundPoint.copy(this._localSatellitePosition).normalize().multiplyScalar(Constants.earthRadius * Constants.metersToKm);
        // Send to worker for history management
        this.worker.postMessage({
            type: 'UPDATE_GROUND_POINT',
            id: this.id,
            groundPoint: {
                x: this._groundPoint.x * Constants.scale,
                y: this._groundPoint.y * Constants.scale,
                z: this._groundPoint.z * Constants.scale
            }
        });
    }

    updateGeometry(groundTracePoints) {
        const len = Math.min(groundTracePoints.length, this.maxTracePoints);
        for (let i = 0; i < len; i++) {
            const pt = groundTracePoints[i];
            this._positions[i * 3] = pt.x;
            this._positions[i * 3 + 1] = pt.y;
            this._positions[i * 3 + 2] = pt.z;
        }
        const geometry = this.groundTraceLine.geometry;
        geometry.attributes.position.needsUpdate = true;
        geometry.setDrawRange(0, len);
    }

    setVisible(visible) {
        this.visible = visible;
        if (this.groundTraceLine) {
            this.groundTraceLine.visible = visible;
        }
    }

    setColor(color) {
        this.color = color;
        if (this.groundTraceLine) {
            this.groundTraceLine.material.color.set(color);
        }
    }

    dispose() {
        if (this.earth && this.earth.rotationGroup && this.groundTraceLine) {
            this.earth.rotationGroup.remove(this.groundTraceLine);
            if (this.groundTraceLine.geometry) {
                this.groundTraceLine.geometry.dispose();
            }
            if (this.groundTraceLine.material) {
                this.groundTraceLine.material.dispose();
            }
        }
        if (this.worker) {
            this.worker.terminate();
        }
    }
}
