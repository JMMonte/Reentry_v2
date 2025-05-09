import * as THREE from 'three';
import { Planet } from './Planet.js';
import { Constants } from '../../utils/Constants.js';
import { RENDER_ORDER } from './Planet.js';

export class AtmosphereComponent {
    constructor(planet, config, shaders) {
        // Save planet reference for update
        this.planet = planet;
        // Create outer atmosphere shell mesh
        const outer = planet.materials.createAtmosphereMesh(config, shaders);
        if (!outer) return;
        // Use both sides so atmosphere is visible when camera is outside or inside
        outer.material.side = THREE.DoubleSide;

        // Apply oblateness and atmosphere thickness scaling directly to the mesh
        const equR = planet.radius;
        const polR = planet.radius * (1 - planet.oblateness);
        const equAtm = equR + planet.atmosphereThickness;
        const polAtm = polR + planet.atmosphereThickness;
        const yScale = equAtm === 0 ? 1 : polAtm / equAtm;
        outer.scale.set(1, yScale, 1);
        // Render order for the atmosphere mesh
        outer.renderOrder = planet.renderOrderOverrides.ATMOSPHERE ?? RENDER_ORDER.ATMOSPHERE;
        planet.rotationGroup.add(outer);
        this.mesh = outer;
        // Preallocate temporaries
        this._planetPos = new THREE.Vector3();
        this._sunPos = new THREE.Vector3();
        this._camRel = new THREE.Vector3();
        this._worldQuat = new THREE.Quaternion();
        this._invMat = new THREE.Matrix4();
    }

    update() {
        if (!this.mesh) return;
        // Ensure the entire parent chain is up-to-date
        let root = this.mesh;
        while (root.parent) root = root.parent;
        root.updateMatrixWorld(true);
        // Update the single atmosphere mesh material
        const materials = [this.mesh.material];
        // Planet world position
        this.mesh.getWorldPosition(this._planetPos);
        // Camera relative to planet center
        const cam = Planet.camera;
        this._camRel.copy(cam.position).sub(this._planetPos);
        // Sun position
        if (window.app3d?.sun?.sun?.getWorldPosition) {
            window.app3d.sun.sun.getWorldPosition(this._sunPos);
        } else {
            this._sunPos.set(0, 0, 0);
        }
        // Relative sun
        const sunRel = this._sunPos.clone().sub(this._planetPos);
        for (const mat of materials) {
            mat.uniforms.uCameraPosition.value.copy(this._camRel);
            mat.uniforms.uSunPosition.value.copy(sunRel);

            // Planet frame rotation
            this.mesh.getWorldQuaternion(this._worldQuat);
            this._worldQuat.invert();
            this._invMat.makeRotationFromQuaternion(this._worldQuat);
            mat.uniforms.uPlanetFrame.value.setFromMatrix4(this._invMat);

            // Sun intensity
            const dist = this._planetPos.distanceTo(this._sunPos);
            const AU_KM = (typeof Constants.AU === 'number') ? Constants.AU * Constants.metersToKm : 149597870.7;
            const BASE = 10.6;
            const EPS = 1e-6;
            mat.uniforms.uSunIntensity.value = BASE * (AU_KM * AU_KM) / Math.max(dist * dist, EPS);

            // Planet center & radius
            mat.uniforms.uPlanetPositionWorld.value.copy(this._planetPos);
            if (mat.uniforms.uPlanetRadius) mat.uniforms.uPlanetRadius.value = this.planet.radius;
            if (mat.uniforms.uAtmosphereHeight) mat.uniforms.uAtmosphereHeight.value = this.planet.atmosphereThickness;

        }
    }

    dispose() {
        if (this.mesh) {
            this.mesh.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
    }
} 