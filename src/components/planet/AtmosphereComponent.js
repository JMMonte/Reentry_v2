import * as THREE from 'three';
// import { Planet } from './Planet.js'; // Removed unused import
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

        // Store initial atmosphere equatorial radius for dynamic scaling - REMOVED, direct scaling now
        // this._baseEquAtm = equAtm; // Old

        // const yScale = equAtm === 0 ? 1 : polAtm / equAtm; // Old
        // outer.scale.set(1, yScale, 1); // Old, for pre-scaled geometry
        outer.scale.set(equAtm, polAtm, equAtm); // New, for radius 1 geometry from PlanetMaterials

        // Pass actual radii for vertex shader scaling
        if (outer.material.uniforms) { // Check if uniforms exist
            outer.material.uniforms.uEquatorialAtmRadiusForScaling = { value: equAtm };
            outer.material.uniforms.uPolarAtmRadiusForScaling = { value: polAtm };
        }

        // const yScale = equAtm === 0 ? 1 : polAtm / equAtm; // Old
        // outer.scale.set(1, yScale, 1); // Commented out, direct scale above
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

        // Precompute optical-depth lookup table (height vs cosine of sun angle)
        const atm = config.atmosphere;
        const lutSize = 64;
        const data = new Float32Array(lutSize * lutSize * 4);
        const aAtm = equR + atm.thickness;
        const bAtm = polR + atm.thickness;
        const aPl = equR, bPl = polR;
        const rayScale = atm.rayleighScaleHeight || atm.densityScaleHeight;
        const mieScale = atm.mieScaleHeight || atm.densityScaleHeight;
        const steps = atm.numLightSteps;
        // Helper CPU port of density falloff
        const getDensity = (h, H) => Math.exp(-h / H);
        // CPU ray-sphere intersection
        const intersect = (o, d, a, b) => {
            const ix2 = 1 / (a * a), iy2 = 1 / (b * b), iz2 = ix2;
            const A = d.x * d.x * ix2 + d.y * d.y * iy2 + d.z * d.z * iz2;
            const B = 2 * (o.x * d.x * ix2 + o.y * d.y * iy2 + o.z * d.z * iz2);
            const C = o.x * o.x * ix2 + o.y * o.y * iy2 + o.z * o.z * iz2 - 1;
            const disc = B * B - 4 * A * C;
            if (disc < 0) return null;
            const sd = Math.sqrt(disc);
            return [(-B - sd) / (2 * A), (-B + sd) / (2 * A)];
        };
        for (let j = 0; j < lutSize; j++) {
            const hNorm = j / (lutSize - 1);
            const h = atm.thickness * hNorm;
            // position at sample
            const o = { x: 0, y: equR + h, z: 0 };
            for (let i = 0; i < lutSize; i++) {
                const mu = i / (lutSize - 1);
                const theta = Math.acos(mu);
                // light direction rotated from 'down'
                const d = { x: Math.sin(theta), y: -Math.cos(theta), z: 0 };
                // find intersection with atm shell
                const isect = intersect(o, d, aAtm, bAtm);
                if (!isect) { data.set([0, 0, 0, 1], (j * lutSize + i) * 4); continue; }
                let [t0, t1] = isect;
                t0 = Math.max(0, t0);
                const step = (t1 - t0) / steps;
                let odR = 0, odM = 0;
                for (let k = 0; k < steps; k++) {
                    const t = t0 + (k + 0.5) * step;
                    const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
                    // check ground
                    const pgI = intersect(o, d, aPl, bPl);
                    if (pgI && pgI[0] > 0 && pgI[0] < t1) { odR = odM = 0; break; }
                    const height = Math.sqrt(px * px + py * py + pz * pz) - equR;
                    if (height < 0) continue;
                    odR += getDensity(height, rayScale) * step;
                    odM += getDensity(height, mieScale) * step;
                }
                const idx = (j * lutSize + i) * 4;
                data[idx] = odR;
                data[idx + 1] = odM;
                data[idx + 2] = 0;
                data[idx + 3] = 1;
            }
        }
        const lutTex = new THREE.DataTexture(data, lutSize, lutSize, THREE.RGBAFormat, THREE.FloatType);
        lutTex.needsUpdate = true;
        // Attach LUT to material
        outer.material.uniforms.uOpticalDepthLUT = { value: lutTex };

        // Add scale height multiplier uniform
        const scaleHeightMultiplier = config.atmosphere && typeof config.atmosphere.scaleHeightMultiplier === 'number' 
            ? config.atmosphere.scaleHeightMultiplier 
            : 5.0; // Default to 5.0 if not specified in config
        outer.material.uniforms.uScaleHeightMultiplier = { value: scaleHeightMultiplier };
    }

    // This update is called by Planet's component loop, handles planet-state-dependent scaling
    update() {
        if (!this.mesh || !this.mesh.material?.uniforms) return;

        // Update mesh scale if atmosphere thickness changed
        const equR = this.planet.radius;
        const polR = equR * (1 - this.planet.oblateness);
        const newAtmHeight = this.planet.atmosphereThickness;
        const newEquAtm = equR + newAtmHeight;
        const newPolAtm = polR + newAtmHeight;

        this.mesh.scale.set(newEquAtm, newPolAtm, newEquAtm);

        // Update uniforms for vertex shader scaling
        const mat = this.mesh.material;
        if (mat.uniforms.uEquatorialAtmRadiusForScaling) {
            mat.uniforms.uEquatorialAtmRadiusForScaling.value = newEquAtm;
        }
        if (mat.uniforms.uPolarAtmRadiusForScaling) {
            mat.uniforms.uPolarAtmRadiusForScaling.value = newPolAtm;
        }
    }

    // This update is called from App3D.tick AFTER planet and camera positions are finalized
    updateUniforms(camera, sun) { // camera is the main app camera, sun is the main app sun
        if (!this.mesh || !this.mesh.material?.uniforms) return;
        
        // Ensure the planet's own matrixWorld is up-to-date after its lerp
        // This should already be true if Planet.update() updated its transforms
        // and App3D calls updateMatrixWorld on scene before this.
        // For safety, or if planet group isn't part of main scene graph auto-update:
        if (this.planet.orbitGroup) this.planet.orbitGroup.updateWorldMatrix(true, false);
        if (this.mesh.parent) this.mesh.parent.updateWorldMatrix(true, false); // Ensures parent (rotationGroup) is updated
        this.mesh.updateWorldMatrix(true, false); // Ensures mesh itself is updated if it had local transforms relative to rotationGroup

        // Planet world position
        // this.mesh.getWorldPosition(this._planetPos); // This gets the atmosphere mesh center
        // It's better to get the planet's defined center (orbitGroup)
        this.planet.orbitGroup.getWorldPosition(this._planetPos);

        // Camera relative to planet center
        this._camRel.copy(camera.position).sub(this._planetPos);
        
        // Sun position
        if (sun?.sun?.getWorldPosition) { // Assuming sun is an object that has a 'sun' mesh/light with getWorldPosition
            sun.sun.getWorldPosition(this._sunPos);
        } else if (sun?.getWorldPosition) { // If sun itself is the object with getWorldPosition
             sun.getWorldPosition(this._sunPos);
        } else {
            this._sunPos.set(0, 0, 0); // Fallback if sun is not properly defined
        }
        
        // Relative sun
        const sunRel = this._sunPos.clone().sub(this._planetPos);
        
        const mat = this.mesh.material;

        mat.uniforms.uCameraPosition.value.copy(this._camRel);
        mat.uniforms.uSunPosition.value.copy(sunRel);

        // Planet frame rotation
        // The atmosphere mesh is added to planet.rotationGroup, which has the planet's axial tilt.
        // We need the world orientation of this rotationGroup.
        this.planet.rotationGroup.getWorldQuaternion(this._worldQuat);
        this._worldQuat.invert(); // Shader wants world-to-local
        this._invMat.makeRotationFromQuaternion(this._worldQuat);
        mat.uniforms.uPlanetFrame.value.setFromMatrix4(this._invMat);

        // Sun intensity
        const dist = this._planetPos.distanceTo(this._sunPos); // Distance between planet center and sun center
        const AU_KM = (typeof Constants.AU === 'number') ? Constants.AU * Constants.metersToKm : 149597870.7;
        const BASE = 10.6; // Base sun intensity factor
        const EPS = 1e-6;
        mat.uniforms.uSunIntensity.value = BASE * (AU_KM * AU_KM) / Math.max(dist * dist, EPS);

        // Planet center & radius for shader
        mat.uniforms.uPlanetPositionWorld.value.copy(this._planetPos); // This is planet's world center
        if (mat.uniforms.uPlanetRadius) mat.uniforms.uPlanetRadius.value = this.planet.radius;
        if (mat.uniforms.uAtmosphereHeight) {
            const thickness = this.planet.atmosphereThickness;
            const fudge = mat.uniforms.uLimbFudgeFactor ? mat.uniforms.uLimbFudgeFactor.value : 0;
            mat.uniforms.uAtmosphereHeight.value = thickness * (1.0 + fudge);
        }
    }

    dispose() {
        if (this.mesh) {
            // Remove from parent
            if (this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }
            // Dispose geometry
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            // Dispose material and LUT texture if present
            if (this.mesh.material) {
                if (this.mesh.material.uniforms?.uOpticalDepthLUT?.value) {
                    this.mesh.material.uniforms.uOpticalDepthLUT.value.dispose();
                }
                this.mesh.material.dispose();
            }
            this.mesh = null;
        }
    }
} 