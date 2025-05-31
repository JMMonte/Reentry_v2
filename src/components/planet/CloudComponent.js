import * as THREE from 'three';
import { Planet } from './Planet.js';
import { RENDER_ORDER } from './Planet.js';

export class CloudComponent {
    constructor(planet) {
        this.planet = planet;
        const equR = planet.radius + planet.cloudThickness;
        const polR = planet.radius * (1 - planet.oblateness) + planet.cloudThickness;
        const yScale = polR / equR;
        const material = planet.cloudMaterial;
        if (!material) return;
        // Create LOD for clouds
        this.lod = new THREE.LOD();
        const geometryFn = (r, res) => new THREE.SphereGeometry(r, res, res);
        const lodLevels = planet.lodLevels;
        const defaultRes = planet.cloudRes;
        const renderOrder = planet.renderOrderOverrides.CLOUDS ?? RENDER_ORDER.CLOUDS;
        if (lodLevels?.length) {
            for (const { meshRes, distance } of lodLevels) {
                const mesh = new THREE.Mesh(geometryFn(equR, meshRes), material);
                mesh.scale.set(1, yScale, 1);
                mesh.renderOrder = renderOrder;
                this.lod.addLevel(mesh, distance);
            }
        } else {
            const mesh = new THREE.Mesh(geometryFn(equR, defaultRes), material);
            mesh.scale.set(1, yScale, 1);
            mesh.renderOrder = renderOrder;
            this.lod.addLevel(mesh, 0);
        }
        planet.rotationGroup.add(this.lod);
    }

    update() {
        if (this.lod && Planet.camera) {
            this.lod.update(Planet.camera);
        }
    }

    dispose() {
        if (!this.lod) return;
        this.lod.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => {
                    m.dispose();
                    Object.values(m).forEach(v => v instanceof THREE.Texture && v.dispose());
                });
            }
        });
        this.planet.rotationGroup.remove(this.lod);
    }
}