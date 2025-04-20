import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

export class TracePath {
    constructor(color, maxTracePoints = 1000) {
        this.maxTracePoints = maxTracePoints;
        this.tracePoints = [];
        // Preallocate geometry for trace points (maxTracePoints vertices)
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxTracePoints * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);
        this.traceLine = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({
                color,
                linewidth: 2,
                transparent: true,
                opacity: 0.5
            })
        );
        this.traceLine.frustumCulled = false;
        this.traceLine.visible = false;
    }

    update(position) {
        // Append a new trace point (position is a Vector3 in km-scale) if within threshold
        const threshold = Constants.earthRadius * Constants.metersToKm * Constants.scale * 2; // ~2x Earth radius
        if (position.length() > threshold) return;
        this.tracePoints.push({ x: position.x, y: position.y, z: position.z });
        if (this.tracePoints.length > this.maxTracePoints) this.tracePoints.shift();
        // Update geometry in-place
        const attr = this.traceLine.geometry.attributes.position;
        const arr = attr.array;
        const count = this.tracePoints.length;
        for (let i = 0; i < count; i++) {
            const pt = this.tracePoints[i];
            const idx = i * 3;
            arr[idx]     = pt.x;
            arr[idx + 1] = pt.y;
            arr[idx + 2] = pt.z;
        }
        this.traceLine.geometry.setDrawRange(0, count);
        attr.needsUpdate = true;
    }

    setVisible(visible) {
        this.traceLine.visible = visible;
        if (!visible) {
            // Clear buffer to prevent stale points on re-show
            this.tracePoints = [];
            const geom = this.traceLine.geometry;
            geom.setDrawRange(0, 0);
            geom.attributes.position.needsUpdate = true;
        }
    }

    setColor(color) {
        if (this.traceLine.material) {
            this.traceLine.material.color.set(color);
        }
    }

    dispose() {
        // Clean up visual elements
        if (this.traceLine.geometry) this.traceLine.geometry.dispose();
        if (this.traceLine.material) this.traceLine.material.dispose();
    }
} 