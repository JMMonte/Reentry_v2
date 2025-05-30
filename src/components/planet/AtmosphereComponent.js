import * as THREE from 'three';
// import { Planet } from './Planet.js'; // Removed unused import
import { Constants } from '../../utils/Constants.js';
import { RENDER_ORDER } from './Planet.js';

export class AtmosphereComponent {
    constructor(planet, config, shaders) {
        // Save planet reference for update
        this.planet = planet;
        // Create outer atmosphere shell mesh with LOD support
        const atmosphereOptions = {
            ...shaders,
            lodLevels: planet.lodLevels, // Use the same LOD levels as the planet
            defaultResolution: planet.atmosphereRes || 64,
            renderOrder: planet.renderOrderOverrides.ATMOSPHERE ?? RENDER_ORDER.ATMOSPHERE
        };
        const outer = planet.materials.createAtmosphereMesh(config, atmosphereOptions);
        if (!outer) return;
        // Keep the side as configured in PlanetMaterials (FrontSide for proper depth testing)
        // outer.material.side = THREE.DoubleSide; // Removed - this was overriding the depth fix

        // Apply oblateness and atmosphere thickness scaling directly to the mesh
        const equR = planet.radius;
        const polR = planet.radius * (1 - planet.oblateness);
        const equAtm = equR + planet.atmosphereThickness;
        const polAtm = polR + planet.atmosphereThickness;

        // Store initial atmosphere equatorial radius for dynamic scaling - REMOVED, direct scaling now
        // this._baseEquAtm = equAtm; // Old

        // const yScale = equAtm === 0 ? 1 : polAtm / equAtm; // Old
        // outer.scale.set(1, yScale, 1); // Old, for pre-scaled geometry
        // Scale atmosphere to its proper size (handle both Mesh and LOD)
        if (outer instanceof THREE.LOD) {
            // For LOD, scale each level
            outer.levels.forEach(level => {
                if (level.object) {
                    level.object.scale.set(equAtm, polAtm, equAtm);
                }
            });
        } else {
            // For single mesh
            outer.scale.set(equAtm, polAtm, equAtm);
        }

        // Pass actual radii for vertex shader scaling (handle both Mesh and LOD)
        const updateUniforms = (material) => {
            if (material?.uniforms) {
                material.uniforms.uEquatorialAtmRadiusForScaling = { value: equAtm };
                material.uniforms.uPolarAtmRadiusForScaling = { value: polAtm };
            }
        };
        
        if (outer instanceof THREE.LOD) {
            // For LOD, update uniforms for each level
            outer.levels.forEach(level => {
                if (level.object?.material) {
                    updateUniforms(level.object.material);
                }
            });
        } else if (outer.material) {
            // For single mesh
            updateUniforms(outer.material);
        }

        // const yScale = equAtm === 0 ? 1 : polAtm / equAtm; // Old
        // outer.scale.set(1, yScale, 1); // Commented out, direct scale above
        // Render order for the atmosphere mesh
        // Render order is now set in createAtmosphereMesh
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
        
        // Add scale height multiplier uniform
        const scaleHeightMultiplier = config.atmosphere && typeof config.atmosphere.scaleHeightMultiplier === 'number' 
            ? config.atmosphere.scaleHeightMultiplier 
            : 5.0; // Default to 5.0 if not specified in config
        
        // Attach LUT and multiplier to material (handle both Mesh and LOD)
        const attachUniformsToMaterial = (material) => {
            if (material?.uniforms) {
                material.uniforms.uOpticalDepthLUT = { value: lutTex };
                material.uniforms.uScaleHeightMultiplier = { value: scaleHeightMultiplier };
            }
        };
        
        if (outer instanceof THREE.LOD) {
            // For LOD, attach to all levels
            outer.levels.forEach(level => {
                if (level.object?.material) {
                    attachUniformsToMaterial(level.object.material);
                }
            });
        } else if (outer.material) {
            // For single mesh
            attachUniformsToMaterial(outer.material);
        }
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

        // Update scale (handle both Mesh and LOD)
        if (this.mesh instanceof THREE.LOD) {
            this.mesh.levels.forEach(level => {
                if (level.object) {
                    level.object.scale.set(newEquAtm, newPolAtm, newEquAtm);
                }
            });
        } else {
            this.mesh.scale.set(newEquAtm, newPolAtm, newEquAtm);
        }

        // Update uniforms for vertex shader scaling (handle both Mesh and LOD)
        const updateRadiiUniforms = (material) => {
            if (material?.uniforms) {
                if (material.uniforms.uEquatorialAtmRadiusForScaling) {
                    material.uniforms.uEquatorialAtmRadiusForScaling.value = newEquAtm;
                }
                if (material.uniforms.uPolarAtmRadiusForScaling) {
                    material.uniforms.uPolarAtmRadiusForScaling.value = newPolAtm;
                }
            }
        };
        
        if (this.mesh instanceof THREE.LOD) {
            this.mesh.levels.forEach(level => {
                if (level.object?.material) {
                    updateRadiiUniforms(level.object.material);
                }
            });
        } else if (this.mesh.material) {
            updateRadiiUniforms(this.mesh.material);
        }
    }

    // This update is called from App3D.tick AFTER planet and camera positions are finalized
    updateUniforms(camera, sun) { // camera is the main app camera, sun is the main app sun
        if (!this.mesh) return;
        
        // Get the material to update (handle both Mesh and LOD)
        let material;
        if (this.mesh instanceof THREE.LOD) {
            // For LOD, update the currently visible level's material
            const currentLevel = this.mesh.levels.find(level => level.object?.visible);
            material = currentLevel?.object?.material;
        } else {
            material = this.mesh.material;
        }
        
        if (!material?.uniforms) return;
        
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
        
        // Update uniforms using the material we found
        material.uniforms.uCameraPosition.value.copy(this._camRel);
        material.uniforms.uSunPosition.value.copy(sunRel);
        
        // Calculate LOD factor based on distance
        const distance = this._camRel.length();
        const planetRadius = this.planet.radius;
        
        // Calculate LOD factor: 1.0 when very close, 0.0 when far away
        // Use distance in planet radii for scaling
        const distanceInRadii = distance / planetRadius;
        let lodFactor = 1.0;
        
        if (distanceInRadii > 100) {
            // Very far: minimum quality
            lodFactor = 0.0;
        } else if (distanceInRadii > 20) {
            // Far: interpolate between 0.0 and 0.5
            lodFactor = 0.5 * (100 - distanceInRadii) / 80;
        } else if (distanceInRadii > 5) {
            // Medium: interpolate between 0.5 and 1.0
            lodFactor = 0.5 + 0.5 * (20 - distanceInRadii) / 15;
        } else {
            // Close: maximum quality
            lodFactor = 1.0;
        }
        
        // Update LOD uniform
        if (material.uniforms.uLODFactor) {
            material.uniforms.uLODFactor.value = lodFactor;
        }
        
        // If using LOD, update all levels with the same LOD factor
        if (this.mesh instanceof THREE.LOD) {
            this.mesh.levels.forEach(level => {
                if (level.object?.material?.uniforms?.uLODFactor) {
                    level.object.material.uniforms.uLODFactor.value = lodFactor;
                }
            });
        }

        // Planet frame rotation
        // The atmosphere mesh is added to planet.rotationGroup, which has the planet's axial tilt.
        // We need the world orientation of this rotationGroup.
        this.planet.rotationGroup.getWorldQuaternion(this._worldQuat);
        this._worldQuat.invert(); // Shader wants world-to-local
        this._invMat.makeRotationFromQuaternion(this._worldQuat);
        material.uniforms.uPlanetFrame.value.setFromMatrix4(this._invMat);

        // Sun intensity
        const dist = this._planetPos.distanceTo(this._sunPos); // Distance between planet center and sun center
        const AU_KM = (typeof Constants.AU === 'number') ? Constants.AU : 149597870.7;
        const BASE = 10.6; // Base sun intensity factor
        const EPS = 1e-6;
        material.uniforms.uSunIntensity.value = BASE * (AU_KM * AU_KM) / Math.max(dist * dist, EPS);

        // Planet center & radius for shader
        material.uniforms.uPlanetPositionWorld.value.copy(this._planetPos); // This is planet's world center
        if (material.uniforms.uPlanetRadius) material.uniforms.uPlanetRadius.value = this.planet.radius;
        if (material.uniforms.uAtmosphereHeight) {
            const thickness = this.planet.atmosphereThickness;
            const fudge = material.uniforms.uLimbFudgeFactor ? material.uniforms.uLimbFudgeFactor.value : 0;
            material.uniforms.uAtmosphereHeight.value = thickness * (1.0 + fudge);
        }
        
        // If LOD, we should update all levels' uniforms to ensure smooth transitions
        if (this.mesh instanceof THREE.LOD) {
            this.mesh.levels.forEach(level => {
                if (level.object?.material?.uniforms && level.object.material !== material) {
                    const mat = level.object.material;
                    // Copy uniform values from the active material
                    Object.keys(material.uniforms).forEach(key => {
                        if (mat.uniforms[key]) {
                            mat.uniforms[key].value = material.uniforms[key].value;
                        }
                    });
                }
            });
        }
    }

    dispose() {
        if (this.mesh) {
            // Remove from parent
            if (this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }
            
            // Dispose resources (handle both Mesh and LOD)
            if (this.mesh instanceof THREE.LOD) {
                // For LOD, dispose all levels
                this.mesh.levels.forEach(level => {
                    if (level.object) {
                        // Dispose geometry
                        if (level.object.geometry) level.object.geometry.dispose();
                        // Dispose material and LUT texture if present
                        if (level.object.material) {
                            if (level.object.material.uniforms?.uOpticalDepthLUT?.value) {
                                level.object.material.uniforms.uOpticalDepthLUT.value.dispose();
                            }
                            level.object.material.dispose();
                        }
                    }
                });
            } else {
                // For single mesh
                // Dispose geometry
                if (this.mesh.geometry) this.mesh.geometry.dispose();
                // Dispose material and LUT texture if present
                if (this.mesh.material) {
                    if (this.mesh.material.uniforms?.uOpticalDepthLUT?.value) {
                        this.mesh.material.uniforms.uOpticalDepthLUT.value.dispose();
                    }
                    this.mesh.material.dispose();
                }
            }
            
            this.mesh = null;
        }
    }
} 