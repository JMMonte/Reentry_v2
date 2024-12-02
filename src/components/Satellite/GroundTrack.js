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
        this.maxTracePoints = 10000;
        this.groundTracePoints = [];
        this.initializeGroundTrace();
    }

    initializeGroundTrace() {
        if (!this.earth || !this.earth.rotationGroup) return;
        
        const groundTraceGeometry = new THREE.BufferGeometry();
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: this.color,
            transparent: true,
            opacity: 0.5
        });
        this.groundTraceLine = new THREE.Line(groundTraceGeometry, lineMaterial);
        this.groundTraceLine.frustumCulled = false;
        this.earth.rotationGroup.add(this.groundTraceLine);
    }

    update(satellitePosition) {
        if (!this.earth || !this.groundTraceLine) return;

        const earthCenter = this.earth.earthMesh.position;
        const relativePosition = satellitePosition.clone().sub(earthCenter);
        const earthInverseMatrix = this.earth.rotationGroup.matrixWorld.clone().invert();
        const localSatellitePosition = relativePosition.applyMatrix4(earthInverseMatrix);
        
        // Use the correct Earth radius from Constants
        const groundPoint = localSatellitePosition.normalize().multiplyScalar(Constants.earthRadius * Constants.metersToKm * Constants.scale);

        this.groundTracePoints.push(groundPoint);

        if (this.groundTracePoints.length > this.maxTracePoints) {
            this.groundTracePoints.shift();
        }

        this.updateGroundTraceLine();
    }

    updateGroundTraceLine() {
        if (!this.groundTraceLine) return;

        const positions = new Float32Array(this.groundTracePoints.length * 3);
        this.groundTracePoints.forEach((point, index) => {
            positions[index * 3] = point.x;
            positions[index * 3 + 1] = point.y;
            positions[index * 3 + 2] = point.z;
        });

        this.groundTraceLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.groundTraceLine.geometry.attributes.position.needsUpdate = true;
    }

    setVisible(visible) {
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
