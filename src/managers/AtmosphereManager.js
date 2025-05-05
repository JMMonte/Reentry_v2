import { celestialBodiesConfig } from '../config/celestialBodiesConfig.js';
import * as THREE from 'three';

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
        // Add group to scene immediately? Or wait for App3D?
        // Assuming App3D adds managers' groups if needed. If not, add here:
        // this.scene.add(this.debugAxisGroup); // Assuming 'scene' is accessible or passed in
    }

    /**
     * Link to current physics bodies (call after PhysicsWorld is ready)
     */
    linkPhysicsBodies() {
        if (!this.physicsWorld) return;

        for (const atm of this.atmospheres) {
            atm.physicsBody = this.physicsWorld.bodies.find(
                b => b.name.toLowerCase() === atm.name.toLowerCase()
            );
            if (atm.physicsBody) {
                console.log(`  - Found body for: ${atm.name}`);
            } else {
                console.warn(`  - Body NOT found for: ${atm.name}`);
            }
        }
    }

    /**
     * Build arrays of uniforms for the multi-atmosphere shader
     * Returns an object: { count, positions, radii, heights, ... }
     */
    buildUniformArrays(camera) {
        // CPU-side Frustum Culling
        const frustum = new THREE.Frustum();
        const projScreenMatrix = new THREE.Matrix4();
        if (camera) {
            // Update camera world and inverse matrices for correct projection
            camera.updateMatrixWorld();
            camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
            projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(projScreenMatrix);
        }

        // Use the exported constant
        const arr = {
            // Initialize with 0, count visible ones
            uNumAtmospheres: 0,
            uPlanetPosition: Array(MAX_ATMOS).fill().map(() => new THREE.Vector3()),
            // Screen-space center (UV) and radius for culling
            uPlanetScreenPos: Array(MAX_ATMOS).fill().map(() => new THREE.Vector2()),
            uPlanetScreenRadius: new Float32Array(MAX_ATMOS),
            // Elliptical culling
            uEllipseCenter: Array(MAX_ATMOS).fill().map(() => new THREE.Vector2()),
            uEllipseAxisA: new Float32Array(MAX_ATMOS),
            uEllipseAxisB: new Float32Array(MAX_ATMOS),
            uEllipseAngle: new Float32Array(MAX_ATMOS),
            uPlanetRadius: new Float32Array(MAX_ATMOS),
            uAtmosphereHeight: new Float32Array(MAX_ATMOS),
            uDensityScaleHeight: new Float32Array(MAX_ATMOS),
            uRayleighScatteringCoeff: Array(MAX_ATMOS).fill().map(() => new THREE.Vector3()),
            uMieScatteringCoeff: new Float32Array(MAX_ATMOS),
            uMieAnisotropy: new Float32Array(MAX_ATMOS),
            uNumLightSteps: new Int32Array(MAX_ATMOS),
            uSunIntensity: new Float32Array(MAX_ATMOS),
            uRelativeCameraPos: Array(MAX_ATMOS).fill().map(() => new THREE.Vector3()),
            // New for oblate spheroid
            uEquatorialRadius: new Float32Array(MAX_ATMOS),
            uPolarRadius: new Float32Array(MAX_ATMOS),
            uPlanetFrame: Array(MAX_ATMOS).fill().map(() => new THREE.Matrix3()),
            // Add camera distance array (used by shader optimization)
            uCameraDistance: new Float32Array(MAX_ATMOS),
        };

        let visibleAtmosphereIndex = 0;
        const boundingSphere = new THREE.Sphere(); // Reusable sphere

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
            const boundingRadius = (a.equatorialRadius ?? cfg.radius) + a.thickness;
            boundingSphere.center.copy(planetWorldPos);
            boundingSphere.radius = boundingRadius;

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
            arr.uCameraDistance[idx] = camera.position.distanceTo(planetWorldPos);
            arr.uRelativeCameraPos[idx].subVectors(camera.position, planetWorldPos);
            // --- Robust elliptical culling: compute visible limb via camera-perp local plane ---
            // Use only the tiltGroup for ellipsoid orientation (exclude spin)
            const tiltGroup = atm.physicsBody.body.getTiltGroup ? atm.physicsBody.body.getTiltGroup() : atm.physicsBody.body;
            const qWorld = tiltGroup.getWorldQuaternion(new THREE.Quaternion());
            // Compute camera direction in world space
            const worldCamDir = camera.position.clone().sub(planetWorldPos).normalize();
            // Transform to local
            const localCamDir = worldCamDir.clone().applyQuaternion(qWorld.clone().invert()).normalize();
            // Build orthonormal basis in local frame perpendicular to camera dir
            let u = new THREE.Vector3(1, 0, 0).cross(localCamDir);
            if (u.length() < 1e-3) u = new THREE.Vector3(0, 1, 0).cross(localCamDir);
            u.normalize();
            const v = localCamDir.clone().cross(u).normalize();
            // Atmosphere ellipsoid radii in local space
            const aEq = cfg.radius + a.thickness;
            const bPol = cfg.radius * (1 - (cfg.oblateness || 0.0)) + a.thickness;
            // Sample limb points in local
            const N = 32;
            const pts = new Array(N);
            for (let j = 0; j < N; ++j) {
                const theta = (j / N) * Math.PI * 2;
                // direction in local limb plane
                const dir = u.clone().multiplyScalar(Math.cos(theta)).add(v.clone().multiplyScalar(Math.sin(theta)));
                // ellipsoid intersection t
                const denom = dir.x*dir.x/(aEq*aEq) + dir.y*dir.y/(bPol*bPol) + dir.z*dir.z/(aEq*aEq);
                const t = 1.0 / Math.sqrt(denom);
                const localPos = dir.multiplyScalar(t);
                // back to world
                const worldPos = localPos.applyQuaternion(qWorld).add(planetWorldPos);
                const ndc = worldPos.project(camera);
                pts[j] = new THREE.Vector2(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
            }
            // Ellipse center: project the planet center
            const ndcCenter = planetWorldPos.clone().project(camera);
            const center = new THREE.Vector2(ndcCenter.x * 0.5 + 0.5, ndcCenter.y * 0.5 + 0.5);
            // major axis: farthest sampled point
            let maxDist = 0, maxIdx = 0;
            for (let j = 0; j < N; ++j) {
                const d = pts[j].distanceTo(center);
                if (d > maxDist) { maxDist = d; maxIdx = j; }
            }
            const axisA = maxDist;
            // minor axis: point ~90° offset from major
            let minDelta = Infinity, minIdx = 0;
            for (let j = 0; j < N; ++j) {
                const ang = Math.abs(((j - maxIdx + N) % N) * 2 * Math.PI / N - Math.PI / 2);
                if (ang < minDelta) { minDelta = ang; minIdx = j; }
            }
            const axisB = pts[minIdx].distanceTo(center);
            const ang0 = Math.atan2(pts[maxIdx].y - center.y, pts[maxIdx].x - center.x);
            // Assign raw ellipse parameters (no smoothing)
            arr.uEllipseCenter[idx].copy(center);
            arr.uEllipseAxisA[idx] = axisA;
            arr.uEllipseAxisB[idx] = axisB;
            arr.uEllipseAngle[idx] = ang0;

            // --- DEBUG: Visualize Planet Frame Axes (e.g., for Saturn) ---
            if (atm.name === 'saturn') {
                // Clear previous arrows for Saturn
                const saturnArrows = this.debugAxisGroup.children.filter(c => c.name === 'saturn_axis');
                saturnArrows.forEach(arrow => this.debugAxisGroup.remove(arrow));

                const frameMatrix = arr.uPlanetFrame[idx];
                const axisLen = cfg.radius * 1.5; // Arrow length relative to planet size

                // Extract axes from the INVERSE of the world->local matrix (i.e., the local->world matrix)
                const localToWorldMatrix = new THREE.Matrix4().setFromMatrix3(frameMatrix).invert();
                const localX = new THREE.Vector3().setFromMatrixColumn(localToWorldMatrix, 0).normalize();
                const localY = new THREE.Vector3().setFromMatrixColumn(localToWorldMatrix, 1).normalize(); // Should be Polar Axis
                const localZ = new THREE.Vector3().setFromMatrixColumn(localToWorldMatrix, 2).normalize();

                const addArrow = (dir, color) => {
                    const arrow = new THREE.ArrowHelper(dir, planetWorldPos, axisLen, color);
                    arrow.name = 'saturn_axis'; // Mark for removal
                    this.debugAxisGroup.add(arrow);
                };

                addArrow(localX, 0xff0000); // Red X
                addArrow(localY, 0x00ff00); // Green Y (Pole)
                addArrow(localZ, 0x0000ff); // Blue Z
            }
            // --- End Debug ---

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

        // Set the final count of visible atmospheres
        arr.uNumAtmospheres = visibleAtmosphereIndex;

        return arr;
    }

    /** Get number of atmospheres */
    get count() { return this.atmospheres.length; }
    /** Get all atmosphere configs */
    getAll() { return this.atmospheres; }
} 