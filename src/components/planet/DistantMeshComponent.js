import * as THREE from 'three';
import { Planet } from './Planet.js';

export class DistantMeshComponent {
    constructor(planet) {
        this.planet = planet;
        const geo = new THREE.SphereGeometry(1, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: planet.dotColor, transparent: true, opacity: 0.7 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.visible = false;
        planet.orbitGroup.add(this.mesh);
    }

    update() {
        if (!Planet.camera) return;
        const planetPos = new THREE.Vector3();
        this.planet.planetMesh.getWorldPosition(planetPos);
        const camPos = Planet.camera.position;
        const dist = planetPos.distanceTo(camPos);
        const fovY = THREE.MathUtils.degToRad(Planet.camera.fov);
        const scrH = window.innerHeight;
        const pix = (2 * Math.atan(this.planet.radius / dist) / fovY) * scrH;

        if (pix < this.planet.dotPixelSizeThreshold) {
            this.mesh.visible = true;
            this.planet.planetMesh.visible = false;
            const ang = (this.planet.dotPixelSizeThreshold / scrH) * fovY;
            this.mesh.scale.setScalar(Math.tan(ang / 2) * dist);
        } else {
            this.mesh.visible = false;
            this.planet.planetMesh.visible = true;
            this.planet.planetLOD && this.planet.planetLOD.update(Planet.camera);
        }
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.planet.orbitGroup.remove(this.mesh);
    }
} 