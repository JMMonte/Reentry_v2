import { celestialBodiesConfig } from '../config/celestialBodiesConfig.js';
import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';

// Define and export the maximum number of atmospheres supported
export const MAX_ATMOS = 10;

/**
 * AtmosphereManager: Central registry for all volumetric atmospheres in the scene.
 * - Scans celestialBodiesConfig for all bodies with an 'atmosphere' object.
 * - Stores config and runtime state (physics body reference, etc).
 * - Provides method to build arrays of uniforms for the multi-atmosphere shader.
 */
export class AtmosphereManager {
    constructor(physicsWorld) {
        // Find all bodies with an atmosphere config
        this.atmospheres = [];
        for (const [key, cfg] of Object.entries(celestialBodiesConfig)) {
            if (cfg.atmosphere && cfg.atmosphere.thickness > 0) {
                this.atmospheres.push({
                    name: key,
                    config: cfg,
                    atmosphere: cfg.atmosphere,
                    // Will be set at runtime:
                    physicsBody: null, // to be linked to PhysicsWorld
                });
            }
        }
        this.physicsWorld = physicsWorld;
        // Add a group to hold debug arrows
        this.debugAxisGroup = new THREE.Group();

        // Frustum and projection matrix reused each frame
        this._frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        // Reusable bounding sphere for culling
        this._boundingSphere = new THREE.Sphere();

        // Pre-allocate uniform arrays once to avoid per-frame allocations
        this._uniformArrays = {
            uNumAtmospheres: 0,
            uPlanetPosition: Array(MAX_ATMOS).fill().map(() => new THREE.Vector3()),
            uPlanetScreenPos: Array(MAX_ATMOS).fill().map(() => new THREE.Vector2()),
            uPlanetScreenRadius: new Float32Array(MAX_ATMOS),
            uPlanetRadius: new Float32Array(MAX_ATMOS),
            uAtmosphereHeight: new Float32Array(MAX_ATMOS),
            uDensityScaleHeight: new Float32Array(MAX_ATMOS),
            uRayleighScatteringCoeff: Array(MAX_ATMOS).fill().map(() => new THREE.Vector3()),
            uMieScatteringCoeff: new Float32Array(MAX_ATMOS),
            uMieAnisotropy: new Float32Array(MAX_ATMOS),
            uNumLightSteps: new Int32Array(MAX_ATMOS),
            uSunIntensity: new Float32Array(MAX_ATMOS),
            uRelativeCameraPos: Array(MAX_ATMOS).fill().map(() => new THREE.Vector3()),
            uEquatorialRadius: new Float32Array(MAX_ATMOS),
            uPolarRadius: new Float32Array(MAX_ATMOS),
            uPlanetFrame: Array(MAX_ATMOS).fill().map(() => new THREE.Matrix3()),
            uCameraDistance: new Float32Array(MAX_ATMOS)
        };
        // Scratch vectors for screen-space culling to avoid allocations
        this._screenNDC = new THREE.Vector3();
        this._edgeNDC = new THREE.Vector3();
        this._uvScratch = new THREE.Vector2();
        this._uvEdgeScratch = new THREE.Vector2();
        this._unitX = new THREE.Vector3(1, 0, 0);
        this._edgeVec = new THREE.Vector3();
    }

    /**
     * Link to current physics bodies (call after PhysicsWorld is ready)
     */
    linkPhysicsBodies() {
        if (!this.physicsWorld) return;

        for (const atm of this.atmospheres) {
            const keyLower = atm.name;
            atm.physicsBody = this.physicsWorld.bodies.find(
                b => b.nameLower === keyLower
            );
            if (!atm.physicsBody) {
                console.warn(`  - Body NOT found for: ${atm.name}`);
            }
        }
    }

    /**
     * Build arrays of uniforms for the multi-atmosphere shader
     * Updates pre-allocated arrays and returns them.
     */
    buildUniformArrays(camera) {
        // CPU-side Frustum Culling using reused objects
        const frustum = this._frustum;
        const projScreenMatrix = this._projScreenMatrix;
        if (camera) {
            camera.updateMatrixWorld();
            // Use a temporary matrix to compute projection * view
            projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse.copy(camera.matrixWorld).invert());
            frustum.setFromProjectionMatrix(projScreenMatrix);
        }

        // Reset count of visible atmospheres
        const arr = this._uniformArrays;
        arr.uNumAtmospheres = 0;
        // Precompute screen-space culling arrays
        const screenPosArr = arr.uPlanetScreenPos;
        const screenRadArr = arr.uPlanetScreenRadius;
        let visibleAtmosphereIndex = 0;
        const boundingSphere = this._boundingSphere;

        for (let i = 0; i < this.atmospheres.length; ++i) {
            const atm = this.atmospheres[i];
            const cfg = atm.config;
            const a = atm.atmosphere;

            // Check if physics body exists and has position
            if (!atm.physicsBody || !atm.physicsBody.position) {
                console.warn(`AtmosphereManager: Skipping ${atm.name} due to missing physics body or position.`);
                continue;
            }

            // --- Frustum Culling Check ---
            const planetWorldPos = atm.physicsBody.position;
            // Update bounding sphere center and radius for culling
            boundingSphere.center.copy(planetWorldPos);
            boundingSphere.radius = (a.equatorialRadius ?? cfg.radius) + a.thickness;

            // Only proceed if camera exists and sphere intersects frustum
            if (!camera || !frustum.intersectsSphere(boundingSphere)) {
                // console.log(`Culled: ${atm.name}`); // Optional: for debugging
                continue; // Skip this atmosphere, it's not visible
            }
            // --- End Culling Check ---

            // If visible, populate arrays at the current visibleAtmosphereIndex
            const idx = visibleAtmosphereIndex;

            // World-space center & camera-relative pos
            arr.uPlanetPosition[idx].copy(planetWorldPos);
            // Screen-space circle culling: project center
            this._screenNDC.copy(planetWorldPos).project(camera);
            this._uvScratch.set(this._screenNDC.x * 0.5 + 0.5, this._screenNDC.y * 0.5 + 0.5);
            screenPosArr[idx].copy(this._uvScratch);
            // approximate radius by projecting a point offset along X by bounding radius
            this._edgeVec.copy(planetWorldPos).addScaledVector(this._unitX, boundingSphere.radius);
            this._edgeNDC.copy(this._edgeVec).project(camera);
            this._uvEdgeScratch.set(this._edgeNDC.x * 0.5 + 0.5, this._edgeNDC.y * 0.5 + 0.5);
            screenRadArr[idx] = this._uvScratch.distanceTo(this._uvEdgeScratch);

            arr.uCameraDistance[idx] = camera.position.distanceTo(planetWorldPos);
            arr.uRelativeCameraPos[idx].subVectors(camera.position, planetWorldPos);

            // Compute planet frame (world-to-local 3x3) using tiltGroup to match rotational axis (excluding spin)
            const body = atm.physicsBody.body;
            const tiltGroupForFrame = body.getTiltGroup ? body.getTiltGroup() : body;
            if (tiltGroupForFrame && tiltGroupForFrame.getWorldQuaternion) {
                const q = tiltGroupForFrame.getWorldQuaternion(new THREE.Quaternion());
                const m = new THREE.Matrix4().makeRotationFromQuaternion(q).invert();
                arr.uPlanetFrame[idx].setFromMatrix4(m);
            } else {
                arr.uPlanetFrame[idx].identity();
            }

            arr.uPlanetRadius[idx] = cfg.radius;
            arr.uAtmosphereHeight[idx] = a.thickness;
            arr.uDensityScaleHeight[idx] = a.densityScaleHeight;
            // --- Safely copy RayleighScatteringCoeff ---
            if (Array.isArray(a.rayleighScatteringCoeff) && arr.uRayleighScatteringCoeff[idx]) {
                arr.uRayleighScatteringCoeff[idx].fromArray(a.rayleighScatteringCoeff);
            } else {
                console.warn(`AtmosphereManager: Missing or invalid rayleighScatteringCoeff for ${atm.name}`);
                if (arr.uRayleighScatteringCoeff[idx]) arr.uRayleighScatteringCoeff[idx].set(0, 0, 0); // Default to black
            }
            // --- End Safety Check ---
            arr.uMieScatteringCoeff[idx] = a.mieScatteringCoeff;
            arr.uMieAnisotropy[idx] = a.mieAnisotropy;
            arr.uNumLightSteps[idx] = a.numLightSteps;
            arr.uSunIntensity[idx] = a.sunIntensity;
            // Oblate spheroid aligned to mesh geometry: equatorial radius = cfg.radius, polar radius = cfg.radius*(1 - oblateness)
            arr.uEquatorialRadius[idx] = cfg.radius;
            arr.uPolarRadius[idx] = cfg.radius * (1.0 - (cfg.oblateness || 0.0));

            // Increment the count of visible atmospheres
            visibleAtmosphereIndex++;
            if (visibleAtmosphereIndex >= MAX_ATMOS) {
                console.warn("AtmosphereManager: Exceeded MAX_ATMOS limit after culling.");
                break; // Stop processing if we hit the shader limit
            }
        }

        // Final count of visible atmospheres
        arr.uNumAtmospheres = visibleAtmosphereIndex;

        // Compute sun intensity for each visible atmosphere
        const sunBody = this.physicsWorld?.bodies.find(b => b.nameLower === 'sun');
        if (sunBody) {
            const sunPos = sunBody.position;
            const EPS = 1e-6;
            const AU_KM = (typeof Constants.AU === 'number') ? Constants.AU * Constants.metersToKm : 149597870.7;
            const BASE_SOLAR_CONSTANT = 10.6;
            for (let i = 0; i < visibleAtmosphereIndex; ++i) {
                const planetPos = arr.uPlanetPosition[i];
                const dist = planetPos.distanceTo(sunPos);
                arr.uSunIntensity[i] = BASE_SOLAR_CONSTANT * (AU_KM * AU_KM) / Math.max(dist * dist, EPS);
            }
        }

        return arr;
    }

    /** Get number of atmospheres */
    get count() { return this.atmospheres.length; }
    /** Get all atmosphere configs */
    getAll() { return this.atmospheres; }

    /**
     * Static helper to copy values from arrays to uniforms (for Three.js Shader uniforms)
     * @param {object} uniforms - The uniforms object (e.g., from ShaderPass)
     * @param {object} arrays - The arrays object (from buildUniformArrays)
     */
    static applyUniformArraysToUniforms(uniforms, arrays) {
        for (const key in arrays) {
            if (uniforms[key]) {
                if (Array.isArray(arrays[key]) || ArrayBuffer.isView(arrays[key])) {
                    for (let i = 0; i < arrays[key].length; ++i) {
                        if (uniforms[key].value[i]?.copy && arrays[key][i]?.copy) {
                            uniforms[key].value[i].copy(arrays[key][i]);
                        } else if (typeof arrays[key][i] !== 'undefined') {
                            uniforms[key].value[i] = arrays[key][i];
                        }
                    }
                } else {
                    uniforms[key].value = arrays[key];
                }
            }
        }
    }
} 