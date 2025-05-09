import * as THREE from 'three';
import { RENDER_ORDER } from './Planet.js';

export class SoiComponent {
    constructor(planet) {
        this.planet = planet;
        this.mesh = null;
        const radius = planet.soiRadius;
        if (!radius) return;
        const geo = new THREE.SphereGeometry(radius, 64, 32);
        const mat = planet.materials.getSOIMaterial();
        if (!mat) return;
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.renderOrder = planet.renderOrderOverrides.SOI ?? RENDER_ORDER.SOI;
        planet.tiltGroup.add(this.mesh);
    }

    update() {
        // SOI mesh is static each frame
    }

    setVisible(v) {
        if (this.mesh) this.mesh.visible = v;
    }

    dispose() {
        if (!this.mesh) return;
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.planet.tiltGroup.remove(this.mesh);
    }
} 