import * as THREE from 'three';
import { Constants } from '../../utils/Constants';

export class GroundTrack {
    constructor(earth, color) {
        if (!earth || !earth.rotationGroup) {
            console.error('Earth or Earth rotation group not provided to GroundTrack');
            return;
        }
        this.earth = earth;
        this.color = color;
        this.maxTracePoints = 1000; 
        this.groundTracePoints = [];
        this.visible = false;
        
        this._relativePosition = new THREE.Vector3();
        this._localSatellitePosition = new THREE.Vector3();
        this._groundPoint = new THREE.Vector3();
        
        this._positions = new Float32Array(this.maxTracePoints * 3);
        
        this.initializeGroundTrace();
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

        const earthCenter = this.earth.earthMesh.position;
        this._relativePosition.copy(satellitePosition).sub(earthCenter);
        this._localSatellitePosition.copy(this._relativePosition).applyMatrix4(this.earth.rotationGroup.matrixWorld.clone().invert());
        this._groundPoint.copy(this._localSatellitePosition).normalize().multiplyScalar(Constants.earthRadius * Constants.metersToKm);

        const currentLength = this.groundTracePoints.length;
        if (currentLength >= this.maxTracePoints) {
            this._positions.copyWithin(0, 3, this.maxTracePoints * 3);
            this.groundTracePoints.shift();
        }

        const idx = this.groundTracePoints.length * 3;
        this._positions[idx] = this._groundPoint.x * Constants.scale;
        this._positions[idx + 1] = this._groundPoint.y * Constants.scale;
        this._positions[idx + 2] = this._groundPoint.z * Constants.scale;
        
        this.groundTracePoints.push(this._groundPoint.clone().multiplyScalar(Constants.scale)); 
        
        const geometry = this.groundTraceLine.geometry;
        geometry.attributes.position.needsUpdate = true;
        geometry.setDrawRange(0, this.groundTracePoints.length);
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
    }
}
