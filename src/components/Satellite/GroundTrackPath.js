import * as THREE from 'three';

export class GroundTrackPath {
    constructor(color, id, maxTracePoints = 1000) {
        this.id = id;
        this.maxTracePoints = maxTracePoints;
        // Local buffer of ground track points in km-scale
        this.groundTrackPoints = [];
        // Preallocate geometry for ground track (maxTracePoints vertices)
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxTracePoints * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);
        this.groundTrackLine = new THREE.Line(
            geometry,
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
    }

    update(groundPoint) {
        // Append local ground track point in km-scale
        this.groundTrackPoints.push({ x: groundPoint.x, y: groundPoint.y, z: groundPoint.z });
        if (this.groundTrackPoints.length > this.maxTracePoints) {
            this.groundTrackPoints.shift();
        }
        // Update geometry buffer inline
        const attr = this.groundTrackLine.geometry.attributes.position;
        const arr = attr.array;
        const count = this.groundTrackPoints.length;
        for (let i = 0; i < count; i++) {
            const pt = this.groundTrackPoints[i];
            const idx = i * 3;
            arr[idx] = pt.x;
            arr[idx + 1] = pt.y;
            arr[idx + 2] = pt.z;
        }
        this.groundTrackLine.geometry.setDrawRange(0, count);
        attr.needsUpdate = true;
    }

    setVisible(visible) {
        this.groundTrackLine.visible = visible;
        if (!visible) {
            const geom = this.groundTrackLine.geometry;
            geom.setDrawRange(0, 0);
            geom.attributes.position.needsUpdate = true;
        }
    }

    setColor(color) {
        if (this.groundTrackLine.material) {
            this.groundTrackLine.material.color.set(color);
        }
    }

    dispose() {
        // Clean up visual
        if (this.groundTrackLine.geometry) this.groundTrackLine.geometry.dispose();
        if (this.groundTrackLine.material) this.groundTrackLine.material.dispose();
    }
} 