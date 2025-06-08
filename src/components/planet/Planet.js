/* Planet.js */
import * as THREE from 'three';
import { PhysicsConstants } from '../../physics/core/PhysicsConstants.js';
import { PlanetMaterials } from './PlanetMaterials.js';
import atmosphereMeshVertexShader from '../../shaders/atmosphereMesh.vert?raw';
import atmosphereMeshFragmentShader from '../../shaders/atmosphereMesh.frag?raw';
import { AtmosphereComponent } from './AtmosphereComponent.js';
import { PlanetSurface } from './PlanetSurface.js';
import { RadialGrid } from './RadialGrid.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RingComponent } from './RingComponent.js';
import { SoiComponent } from './SoiComponent.js';
import { DistantMeshComponent } from './DistantMeshComponent.js';
import { getPlanetManager } from '../../managers/PlanetManager.js';
import { shaderOptimizer } from '../../utils/ShaderUniformOptimizer.js';

/*
 * Planet.js
 *
 * Orientation and Rotation System Documentation
 * --------------------------------------------
 *
 * The planet's orientation is managed through a hierarchy of THREE.Group objects:
 *
 *   scene
 *    └─ orbitGroup         // Handles planet's position in the world
 *        └─ orientationGroup // Handles planet's orientation (axial tilt, rotation from server)
 *            └─ equatorialGroup // Rotates planet's local Y-up to world Z-up (Three.js is Y-up, server/world is Z-up)
 *                └─ rotationGroup // Contains the planet mesh and rotates for axial spin, rings, etc.
 *
 * Key conventions:
 * - The server sends planet orientation as a quaternion in Z-up reference frame.
 * - To match Three.js (Y-up), we rotate equatorialGroup by +90° about X (Math.PI/2).
 * - All server quaternions should be used as-is (no further conversion needed) if this rotation is present.
 * - Do NOT apply both a quaternion conversion and the equatorialGroup rotation, or the planet will be over-rotated.
 *
 * Group responsibilities:
 * - orbitGroup:      World position of the planet (orbital motion, barycenter, etc.)
 * - orientationGroup: Axial tilt and orientation from server (slerped per frame)
 * - equatorialGroup:  Fixed +90° X rotation to convert Y-up (local) to Z-up (world)
 * - rotationGroup:    Contains the planet mesh, rotates for axial spin, rings, etc.
 *
 * Methods:
 * - setOrientationFromServerQuaternion(qServer):
 *     Sets the target orientation for slerping. qServer must be in Y-up (Three.js) frame.
 *     If using the default group hierarchy, pass the server quaternion as-is.
 * - zUpToYUpQuaternion(qServer):
 *     Converts a Z-up quaternion to Y-up. Only use if you remove the equatorialGroup rotation.
 *
 * Per-frame update:
 * - The orientationGroup's quaternion is slerped toward targetOrientation each frame.
 * - The equatorialGroup's rotation is fixed at +90° X.
 *
 * This design ensures that all planet orientation and rotation logic is centralized and avoids accidental double-rotation.
 */

// Import shared constants to avoid circular dependencies
import { RENDER_ORDER, PLANET_DEFAULTS } from './PlanetConstants.js';

export class Planet {
    /* ---------- static ---------- */
    static instances = [];
    static _instanceSet = new WeakSet(); // WeakSet allows GC of unreferenced planets
    static camera = null;
    static setCamera(cam) { Planet.camera = cam; }

    /**
     * Centralized LOD levels generator for planets
     * @param {number} radius
     * @param {string} key
     * @returns {Array<{meshRes: number, distance: number}>}
     */
    static generateLodLevelsForRadius(radius, key = 'default') {
        // You can expand this switch for more keys if needed
        let res, dist;
        switch (key) {
            case 'default':
            default:
                res = [16, 32, 64, 128];
                dist = [150, 75, 30, 10];
                break;
        }
        return res.map((meshRes, i) => ({ meshRes, distance: radius * dist[i] }));
    }

    constructor(scene, renderer, timeManager, textureManager, config = {}) {
        // Barycenter minimal path
        if (config.type === 'barycenter') {
            this.scene = scene;
            this.renderer = renderer;
            this.timeManager = timeManager;
            this.textureManager = textureManager;
            Object.assign(this, config); // Copy all config properties, including GM
            this.nameLower = (this.name || '').toLowerCase();
            this.type = 'barycenter';
            this.targetPosition = new THREE.Vector3();
            this.targetOrientation = new THREE.Quaternion();
            this.velocity = new THREE.Vector3(0, 0, 0);
            this.meshRes = this.meshRes || 8;
            // Minimal group structure with equatorial frame for moon positioning
            this.orbitGroup = new THREE.Group();
            this.orientationGroup = new THREE.Group();
            this.equatorialGroup = new THREE.Group(); // For moon positioning relative to barycenter equatorial plane
            this.rotationGroup = new THREE.Group();

            // Apply base orientation to equatorialGroup
            this.equatorialGroup.rotation.set(Math.PI / 2, 0, 0); // Y-up → Z-up conversion

            this.orientationGroup.add(this.equatorialGroup);
            this.equatorialGroup.add(this.rotationGroup);
            this.orbitGroup.add(this.orientationGroup);
            this.scene.add(this.orbitGroup);
            // No mesh for barycenters
            this.planetMesh = null;
            // No atmosphere, clouds, surface, or extra features
            this.components = [];
            return;
        }

        // Always set up core state and groups
        this.scene = scene;
        this.renderer = renderer;
        this.timeManager = timeManager;
        this.textureManager = textureManager;
        this.name = config.name;
        this.nameLower = (config.name || '').toLowerCase();
        this.symbol = config.symbol || config.name.charAt(0);
        this.radius = config.radius;
        this.dimensions = config.dimensions; // For irregular bodies like Phobos/Deimos
        this.isDwarf = config.isDwarf || false; // Flag for small irregular bodies
        this.orbitRadius = config.orbitRadius || 0;
        this.oblateness = config.oblateness || 0;
        this.mass = config.mass || 0;
        this.GM = config.GM; // Gravitational parameter (km³/s²)
        this.targetPosition = new THREE.Vector3();
        this.targetOrientation = new THREE.Quaternion();
        this.hasBeenInitializedByServer = false;
        this.meshRes = config.meshRes || PLANET_DEFAULTS.DEFAULT_MESH_RES;
        this.atmosphereRes = config.atmosphereRes || PLANET_DEFAULTS.DEFAULT_ATMOSPHERE_RES;
        this.cloudRes = config.cloudRes || PLANET_DEFAULTS.DEFAULT_CLOUD_RES;
        this.atmosphereThickness = (config.atmosphere && typeof config.atmosphere.thickness === 'number') ? config.atmosphere.thickness : 0;
        this.cloudThickness = config.cloudThickness || 0;
        this.orbitElements = config.orbitElements || null;
        // LOD levels: resolve from key if present, else fallback
        if (config.lodLevelsKey) {
            this.lodLevels = Planet.generateLodLevelsForRadius(this.radius, config.lodLevelsKey);
        } else {
            this.lodLevels = config.lodLevels || [];
        }
        // For irregular bodies, use a slightly higher threshold to account for their elongated shape
        this.dotPixelSizeThreshold = (config.dimensions && config.isDwarf) ? 
            PLANET_DEFAULTS.DOT_PIXEL_SIZE_THRESHOLD_DWARF : 
            PLANET_DEFAULTS.DOT_PIXEL_SIZE_THRESHOLD;
        this.dotColor = config.dotColor || 0xffffff;
        this.soiRadius = config.soiRadius || 0;
        this.components = [];
        this.modelUrl = config.model || null;
        this.velocity = new THREE.Vector3(0, 0, 0); // Always present
        
        // Use PlanetManager instead of static array
        const planetManager = getPlanetManager();
        planetManager.addPlanet(this);
        
        // Keep static array for backward compatibility (will deprecate later)
        Planet.instances.push(this);
        Planet._instanceSet.add(this); // Also add to WeakSet
        this.planetLight = null;
        this.#initGroups();

        // Step 2: Model or Mesh/Component Initialization
        if (this.modelUrl) {
            this.#initModel(config);
        } else {
            this.#initComponents(config);
        }

        // --- SOI Component ---
        if (this.soiRadius) {
            this.soiComponent = new SoiComponent(this);
            this.components.push(this.soiComponent);
        }

        // --- Distant Mesh Component ---
        // Create for all planets, including models
        this.distantComponent = new DistantMeshComponent(this);
        this.components.push(this.distantComponent);

        if (config.addLight && config.lightOptions) {
            this.planetLight = new THREE.PointLight(
                config.lightOptions.color ?? 0xffffff,
                config.lightOptions.intensity ?? 1,
                config.lightOptions.distance ?? 0,
                config.lightOptions.decay ?? 1
            );
            this.planetLight.name = `${this.name}_PointLight`;
            if (config.lightOptions.helper) {
                // Optionally add a helper if requested
                const helper = new THREE.PointLightHelper(this.planetLight, this.radius * 0.2);
                this.orbitGroup.add(helper);
            }
            this.orbitGroup.add(this.planetLight);
        }

        this.update(); // initial build and initial per-frame updates
    }

    /* ===== private helpers ===== */

    #initGroups() {
        this.unrotatedGroup = new THREE.Group();
        this.scene.add(this.unrotatedGroup);

        this.orbitGroup = new THREE.Group();
        this.orientationGroup = new THREE.Group();
        this.equatorialGroup = new THREE.Group();
        this.rotationGroup = new THREE.Group();

        // Initialize positions from targets
        this.orbitGroup.position.copy(this.targetPosition);
        this.orientationGroup.quaternion.copy(this.targetOrientation);

        // Restore: set equatorialGroup rotation to align Y-up (planet) with Z-up (world)
        this.equatorialGroup.rotation.x = Math.PI / 2;

        this.orientationGroup.add(this.equatorialGroup);
        this.equatorialGroup.add(this.rotationGroup);
        this.orbitGroup.add(this.orientationGroup);
        this.scene.add(this.orbitGroup);
    }

    #initMaterials() {
        this.surfaceMaterial = this.materials.getSurfaceMaterial();
        this.cloudMaterial = this.cloudThickness > 0 ? this.materials.getCloudMaterial() : null;
    }

    #createLodMesh(baseRadius, material, yScaleFactor, lodLevels, defaultMeshRes, renderOrderKey = 'SURFACE') {
        let meshObject;
        const geometryFn = (r, res) => new THREE.SphereGeometry(r, res, res);
        const renderOrder = this.renderOrderOverrides[renderOrderKey] ?? RENDER_ORDER[renderOrderKey];
        if (lodLevels?.length) {
            const lod = new THREE.LOD();
            for (const { meshRes, distance } of lodLevels) {
                const m = new THREE.Mesh(geometryFn(baseRadius, meshRes), material);
                m.scale.set(1, yScaleFactor, 1);
                m.renderOrder = renderOrder;
                lod.addLevel(m, distance);
            }
            meshObject = lod;
        } else {
            meshObject = new THREE.Mesh(geometryFn(baseRadius, defaultMeshRes), material);
            meshObject.scale.set(1, yScaleFactor, 1);
            meshObject.renderOrder = renderOrder;
        }
        this.rotationGroup.add(meshObject);
        return meshObject;
    }

    #initMeshes() {
        const equR = this.radius;
        const polR = this.radius * (1 - this.oblateness);
        const yScale = (p, e) => (e === 0 ? 1 : p / e); // Avoid division by zero
        const equCloud = equR + this.cloudThickness;
        const polCloud = polR + this.cloudThickness;
        const coreY = yScale(polR, equR);
        const cloudY = yScale(polCloud, equCloud);
        /* ----- core ----- */
        this.planetMesh = this.#createLodMesh(
            equR,
            this.surfaceMaterial,
            coreY,
            this.lodLevels,
            this.meshRes,
            'SURFACE'
        );
        /* ----- clouds ----- */
        if (this.cloudMaterial) {
            this.cloudMesh = this.#createLodMesh(
                equCloud,
                this.cloudMaterial,
                cloudY,
                this.lodLevels, // Assuming clouds use the same LOD levels config
                this.cloudRes,
                'CLOUDS'
            );
        }
    }

    /**
     * Update the planet's position, orientation, and all components. Called per-frame.
     * @param {number} delta - Time since last frame in seconds
     * @param {number} interpolationFactor - Interpolation factor for smooth motion (0-1)
     */
    update() {
        if (this.type === 'barycenter') {
            if (this.orbitGroup) {
                this.orbitGroup.position.copy(this.targetPosition);
            }
            if (this.orientationGroup && this.targetOrientation) {
                this.orientationGroup.quaternion.copy(this.targetOrientation);
            }
            // Do NOT set equatorialGroup quaternion for barycenters
            return;
        }

        // --- Orbital position update ---
        // Always use targetPosition which is set by the physics engine
        // The physics engine handles all orbital mechanics including multi-body systems
        if (this.orbitGroup) {
            this.orbitGroup.position.copy(this.targetPosition);
        }

        // Orientation update - direct copy to avoid interpolation issues
        if (this.orientationGroup && this.targetOrientation) {
            this.orientationGroup.quaternion.copy(this.targetOrientation);
        }
        // Do NOT set equatorialGroup quaternion here

        // Update all other detailed components as usual
        this.components.forEach(c => {
            if (c && typeof c.update === 'function') {
                c.update();
            }
        });
    }

    /**
     * Update atmosphere shader uniforms. Call after camera/sun update.
     * @param {THREE.Camera} camera
     * @param {THREE.Object3D} sun
     */
    updateAtmosphereUniforms(camera, sun) {
        if (this.atmosphereComponent && typeof this.atmosphereComponent.updateUniforms === 'function') {
            // Always call the atmosphere update - it handles its own logic
            this.atmosphereComponent.updateUniforms(camera, sun);
        }
    }

    /**
     * Update surface feature fading based on camera. Call after camera update.
     * @param {THREE.Camera} camera
     */
    updateSurfaceFading(camera) {
        if (this.surface && typeof this.surface.updateFade === 'function') {
            this.surface.updateFade(camera);
        }
    }

    /**
     * Update radial grid fading based on camera. Call after camera update.
     * @param {THREE.Camera} camera
     */
    updateRadialGridFading(camera) {
        if (this.radialGrid && typeof this.radialGrid.updateFading === 'function') {
            this.radialGrid.updateFading(camera);
        }
    }

    /**
     * Get the main mesh (or LOD) for this planet.
     * @returns {THREE.Object3D|null}
     */
    getMesh() { return this.planetMesh; }

    /**
     * Get the orbit group (top-level transform for this planet).
     * @returns {THREE.Group}
     */
    getOrbitGroup() { return this.orbitGroup; }

    /**
     * Get the unrotated group (for special overlays).
     * @returns {THREE.Group}
     */
    getUnrotatedGroup() {
        return this.unrotatedGroup;
    }

    /**
     * Get the equatorial group (handles Y-up to Z-up conversion).
     * @returns {THREE.Group}
     */
    getEquatorialGroup() {
        return this.equatorialGroup;
    }

    /**
     * Get the rotation group (contains the planet mesh, axial spin, rings, etc.).
     * @returns {THREE.Group}
     */
    getRotationGroup() {
        return this.rotationGroup;
    }

    /**
     * Get the surface texture image, if available.
     * @returns {HTMLImageElement|null}
     */
    getSurfaceTexture() {
        if (!this.planetMesh) return null;
        const mat = (o) => o instanceof THREE.LOD ? o.levels[0]?.object?.material : o.material;
        return mat(this.planetMesh)?.map?.image;
    }

    /**
     * Set visibility of surface lines.
     * @param {boolean} v
     */
    setSurfaceLinesVisible(v) { this.surface?.setSurfaceLinesVisible(v); }
    /**
     * Set visibility of country borders.
     * @param {boolean} v
     */
    setCountryBordersVisible(v) { this.surface?.setCountryBordersVisible(v); }
    /**
     * Set visibility of states.
     * @param {boolean} v
     */
    setStatesVisible(v) { this.surface?.setStatesVisible(v); }
    /**
     * Set visibility of cities.
     * @param {boolean} v
     */
    setCitiesVisible(v) { this.surface?.setCitiesVisible(v); }
    /**
     * Set visibility of airports.
     * @param {boolean} v
     */
    setAirportsVisible(v) { this.surface?.setAirportsVisible(v); }
    /**
     * Set visibility of spaceports.
     * @param {boolean} v
     */
    setSpaceportsVisible(v) { this.surface?.setSpaceportsVisible(v); }
    /**
     * Set visibility of ground stations.
     * @param {boolean} v
     */
    setGroundStationsVisible(v) { this.surface?.setGroundStationsVisible(v); }
    /**
     * Set visibility of observatories.
     * @param {boolean} v
     */
    setObservatoriesVisible(v) { this.surface?.setObservatoriesVisible(v); }
    /**
     * Set visibility of missions.
     * @param {boolean} v
     */
    setMissionsVisible(v) { this.surface?.setMissionsVisible(v); }
    /**
     * Set visibility of the sphere of influence (SOI).
     * @param {boolean} v
     */
    setSOIVisible(v) {
        if (this.soiComponent) {
            this.soiComponent.setVisible(v);
        }
    }
    /**
     * Set visibility of the radial grid.
     * @param {boolean} v
     */
    setRadialGridVisible(v) { this.radialGrid?.setVisible(v); }
    /**
     * Set visibility of rings.
     * @param {boolean} v
     */
    setRingsVisible(v) { if (this.ringComponent?.mesh) this.ringComponent.mesh.visible = v; }

    /**
     * Apply the initial server state directly (no interpolation).
     * @param {THREE.Vector3} position
     * @param {THREE.Quaternion} orientation
     */
    applyInitialServerState(position, orientation) {
        if (this.orbitGroup) {
            this.orbitGroup.position.copy(position);
            this.targetPosition.copy(position);
        }
        if (this.orientationGroup) {
            this.orientationGroup.quaternion.copy(orientation);
            this.targetOrientation.copy(orientation);
        }
        this.hasBeenInitializedByServer = true;
    }

    /**
     * Set the target position for interpolation.
     * @param {THREE.Vector3} worldPositionVector
     */
    setTargetPosition(worldPositionVector) {
        this.targetPosition.copy(worldPositionVector);
    }

    /**
     * Set the target orientation for interpolation.
     * @param {THREE.Quaternion} worldOrientationQuaternion
     */
    setTargetOrientation(worldOrientationQuaternion) {
        this.targetOrientation.copy(worldOrientationQuaternion);
    }

    /**
     * Get the rotation angle at a given Julian date.
     * @param {number} JD - Julian date
     * @param {number} rotPeriod - Rotation period (seconds)
     * @param {number} [rotOffset=0] - Rotation offset (radians)
     * @returns {number} Rotation angle in radians
     */
    static getRotationAngleAtTime(JD, rotPeriod, rotOffset = 0) {
        const secs = (JD - 2451545.0) * PhysicsConstants.TIME.SECONDS_IN_DAY;
        return (2 * Math.PI * (secs / rotPeriod % 1)) + rotOffset;
    }

    /**
     * Dispose of all resources and remove from scene.
     */
    dispose() {
        this.orbitGroup.parent?.remove(this.orbitGroup);
        this.orbitLine?.parent?.remove(this.orbitLine);

        if (this.planetLight) {
            this.planetLight.parent?.remove(this.planetLight);
            this.planetLight.dispose?.();
        }

        this.orbitGroup.traverse((o) => {
            o.geometry?.dispose();
            if (o.material) {
                const arr = Array.isArray(o.material) ? o.material : [o.material];
                arr.forEach((m) => {
                    m.dispose();
                    Object.values(m).forEach((v) =>
                        v instanceof THREE.Texture && v.dispose()
                    );
                });
            }
        });

        this.orbitLine?.geometry?.dispose();
        this.orbitLine?.material?.dispose();

        // Dispose all components if they have a dispose method
        this.components.forEach(c => c.dispose?.());

        // Dispose distant component separately if it exists
        this.distantComponent?.dispose();

        // Dispose surface features
        this.surface?.dispose();
        
        // Dispose materials if they have a dispose method
        this.materials?.dispose();

        // Remove from PlanetManager
        const planetManager = getPlanetManager();
        planetManager.removePlanet(this);

        // Remove from static array (backward compatibility)
        const i = Planet.instances.indexOf(this);
        if (i !== -1) Planet.instances.splice(i, 1);
    }

    /**
     * Set server quaternion for orientation updates
     * @param {THREE.Quaternion} q - Server quaternion
     */
    setServerQuaternion(q) {
        this._serverQuaternion = q;
    }

    /**
     * Update rotation from server quaternion
     */
    updateRotation() {
        if (this._serverQuaternion && this.orientationGroup) {
            this.orientationGroup.quaternion.copy(this._serverQuaternion);
        }
    }

    /**
     * Applies the base orientation to a planet's rotationGroup.
     * @param {THREE.Group} rotationGroup
     * @param {Object} options - { applyBase: boolean, baseRotation: number }
     */
    static applyBaseOrientation(rotationGroup, options = {}) {
        const { applyBase = true, baseRotation = Math.PI / 2 } = options;
        if (applyBase) {
            rotationGroup.rotation.set(0, 0, 0);
            rotationGroup.rotateX(baseRotation);
        }
    }

    /**
     * Applies the server quaternion to the orientationGroup.
     * @param {THREE.Group} orientationGroup
     * @param {THREE.Quaternion} qServer
     * @param {Object} options - { applyServer: boolean }
     */
    static applyServerQuaternion(orientationGroup, qServer, options = {}) {
        const { applyServer = true } = options;
        if (applyServer && qServer) {
            orientationGroup.quaternion.copy(qServer);
        }
    }

    /**
     * Convert a quaternion from Z-up (server) to Y-up (Three.js) reference frame.
     * @param {THREE.Quaternion} qServer - Quaternion from server (Z-up)
     * @returns {THREE.Quaternion} Quaternion for Three.js (Y-up)
     */
    static zUpToYUpQuaternion(qServer) {
        const zUpToYUp = new THREE.Quaternion();
        zUpToYUp.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        return qServer.clone().premultiply(zUpToYUp);
    }

    /**
     * Set the planet orientation from a server quaternion (Z-up reference frame).
     * @param {THREE.Quaternion} qServer - Quaternion from server (Z-up)
     */
    setOrientationFromServerQuaternion(qServer) {
        this.targetOrientation.copy(qServer);
    }

    /**
     * Test: Set a 90-degree rotation about Z (server frame) to verify orientation effect.
     * @param {Planet} planetInstance
     */
    static testOrientation(planetInstance) {
        const qServer = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        planetInstance.setOrientationFromServerQuaternion(qServer);
    }

    #initModel(config) {
        this.planetMesh = null;
        this.modelLoaded = false;
        const loader = new GLTFLoader();
        loader.load(
            this.modelUrl,
            (gltf) => {
                this.planetMesh = gltf.scene;
                this.rotationGroup.add(this.planetMesh);
                this.modelLoaded = true;
                // Add rings for mesh planets after model is loaded
                this.#addRings(config);
                // Proximity renderer is already initialized in constructor
                // Dispatch event for listeners (e.g., PlanetVectors)
                if (typeof this.onMeshLoaded === 'function') this.onMeshLoaded();
                if (typeof this.dispatchEvent === 'function') {
                    this.dispatchEvent({ type: 'planetMeshLoaded' });
                }
            },
            undefined,
            () => {
                // Failed to load 3D model for planet
            }
        );
    }

    #initComponents(config) {
        const materialOverrides = config.materials || {};
        this.materials = new PlanetMaterials(
            this.textureManager,
            this.renderer.capabilities,
            materialOverrides
        );
        this.renderOrderOverrides = (config.materials && config.materials.renderOrderOverrides) || {};
        const planetIndex = Planet.instances.length - 1;
        const blockSize = 10;
        this.renderOrderOverrides.SURFACE = planetIndex * blockSize + RENDER_ORDER.SURFACE;
        this.renderOrderOverrides.CLOUDS = planetIndex * blockSize + RENDER_ORDER.CLOUDS;
        this.renderOrderOverrides.ATMOSPHERE = planetIndex * blockSize + RENDER_ORDER.ATMOSPHERE;
        this.#initMaterials();
        this.#initMeshes();
        if (config.atmosphere) {
            const atm = { ...config.atmosphere };
            if ('thicknessFraction' in atm) atm.thickness = atm.thicknessFraction * this.radius;
            this.atmosphereThickness = atm.thickness;
            if ('densityScaleHeightFraction' in atm) atm.densityScaleHeight = atm.densityScaleHeightFraction * this.radius;
            const earthRef = 6371; // km (Earth mean radius, fallback)
            if (Array.isArray(atm.rayleighScatteringCoeff)) atm.rayleighScatteringCoeff = atm.rayleighScatteringCoeff.map(v => v * (earthRef / this.radius));
            if (typeof atm.mieScatteringCoeff === 'number') atm.mieScatteringCoeff *= (earthRef / this.radius);
            const configWithComputedAtmo = { ...config, atmosphere: atm };
            // Create atmosphere component
            this.atmosphereComponent = new AtmosphereComponent(
                this,
                configWithComputedAtmo,
                {
                    vertexShader: atm.vertexShader || atmosphereMeshVertexShader,
                    fragmentShader: atm.fragmentShader || atmosphereMeshFragmentShader
                }
            );
            this.components.push(this.atmosphereComponent);
            this.atmosphereMesh = this.atmosphereComponent.mesh;
            if (this.atmosphereMesh) {
                this.atmosphereMesh.renderOrder = this.renderOrderOverrides.ATMOSPHERE ?? RENDER_ORDER.ATMOSPHERE;
            }
        }
        const defaultSurfaceOpts = {
            addLatitudeLines: true,
            latitudeStep: 10,
            addLongitudeLines: true,
            longitudeStep: 10,
            addCountryBorders: true,
            addStates: true,
            addCities: true,
            addAirports: true,
            addSpaceports: true,
            addGroundStations: true,
            addObservatories: true,
            markerSize: 0.7,
            circleSegments: 8,
            circleTextureSize: 32,
            fadeStartPixelSize: 320,
            fadeEndPixelSize: 240,
            heightOffset: 5, // km above surface to prevent z-fighting
            ...config.surfaceOptions // allow config to override if needed
        };
        const polarScale = 1 - this.oblateness;
        const surfaceOpts = { ...defaultSurfaceOpts, polarScale, poiRenderOrder: this.renderOrderOverrides.POI ?? RENDER_ORDER.POI };
        this.planetMesh.userData.planetName = this.name;
        // Reparent planetMesh to rotationGroup (not equatorialGroup)
        this.rotationGroup.add(this.planetMesh);
        // Attach surface features, rings, and atmosphere to equatorialGroup
        this.surface = new PlanetSurface(
            this.equatorialGroup, // parent is now equatorialGroup
            this.radius,
            config.primaryGeojsonData,
            config.stateGeojsonData,
            surfaceOpts
        );
        if (this.surface) {
            const o = surfaceOpts;
            if (o.addLatitudeLines) this.surface.addLatitudeLines(o.latitudeStep);
            if (o.addLongitudeLines) this.surface.addLongitudeLines(o.longitudeStep);
            if (o.addCountryBorders) this.surface.addCountryBorders();
            if (o.addStates) this.surface.addStates();
            const layers = [
                [o.addCities, config.cityData, 'cityPoint', 'cities'],
                [o.addAirports, config.airportsData, 'airportPoint', 'airports'],
                [o.addSpaceports, config.spaceportsData, 'spaceportPoint', 'spaceports'],
                [o.addGroundStations, config.groundStationsData, 'groundStationPoint', 'groundStations'],
                [o.addObservatories, config.observatoriesData, 'observatoryPoint', 'observatories'],
                [o.addMissions, config.missionsData, 'missionPoint', 'missions']
            ];
            for (const [flag, data, matKey, layer] of layers) {
                if (flag && data) this.surface.addInstancedPoints(data, this.surface.materials[matKey], layer);
            }
            // Initialize LOD after all content is added
            this.surface.initializeLOD();
        }
        if (this.atmosphereMesh) {
            this.equatorialGroup.add(this.atmosphereMesh);
        }
        if (config.radialGridConfig) {
            this.radialGrid = new RadialGrid(this, config.radialGridConfig);
        }
        // Add rings for procedural planets
        this.#addRings(config);
    }

    #addRings(config) {
        if (config.addRings && config.rings) {
            this.ringComponent = new RingComponent(this, config.rings);
            if (this.ringComponent.mesh) {
                this.equatorialGroup.add(this.ringComponent.mesh);
            }
            this.components.push(this.ringComponent);
        }
    }
}
