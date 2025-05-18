/* Planet.js */
import * as THREE from 'three';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { Constants } from '../../utils/Constants.js';
import { PlanetMaterials } from './PlanetMaterials.js';
import { celestialBodiesConfig } from '../../config/celestialBodiesConfig.js';
import atmosphereMeshVertexShader from '../../shaders/atmosphereMesh.vert?raw';
import atmosphereMeshFragmentShader from '../../shaders/atmosphereMesh.frag?raw';
import { AtmosphereComponent } from './AtmosphereComponent.js';
import { CloudComponent } from './CloudComponent.js';
import { DistantMeshComponent } from './DistantMeshComponent.js';
import { SoiComponent } from './SoiComponent.js';
import { PlanetSurface } from './PlanetSurface.js';
import { RadialGrid } from './RadialGrid.js';
import { RotationComponent } from './RotationComponent.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RingComponent } from './RingComponent.js';

// ---- General Render Order Constants ----
export const RENDER_ORDER = {
    SOI: -1,
    SURFACE: 0,
    CLOUDS: 1,
    ATMOSPHERE: 2,
    POI: 3,
    RINGS: 4
};
//
// Render order system:
//  - General constants above are used for all planet sub-meshes.
//  - If a planet needs a specific override, set it in celestialBodiesConfig.js under materials.renderOrderOverrides.
//  - Planet.js will check for and apply these overrides when constructing meshes.
//

export class Planet {
    /* ---------- static ---------- */
    static instances = [];
    static camera = null;
    static setCamera(cam) { Planet.camera = cam; }

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
            // Minimal group structure
            this.orbitGroup = new THREE.Group();
            this.orientationGroup = new THREE.Group();
            this.rotationGroup = new THREE.Group();
            this.orientationGroup.add(this.rotationGroup);
            this.orbitGroup.add(this.orientationGroup);
            this.scene.add(this.orbitGroup);
            // No mesh for barycenters
            this.planetMesh = null;
            // No atmosphere, clouds, surface, or extra features
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
        this.orbitRadius = config.orbitRadius || 0;
        this.oblateness = config.oblateness || 0;
        this.mass = config.mass || 0;
        this.targetPosition = new THREE.Vector3();
        this.targetOrientation = new THREE.Quaternion();
        this.hasBeenInitializedByServer = false;
        this.meshRes = config.meshRes || 128;
        this.atmosphereRes = config.atmosphereRes || 128;
        this.cloudRes = config.cloudRes || 128;
        this.atmosphereThickness = (config.atmosphere && typeof config.atmosphere.thickness === 'number') ? config.atmosphere.thickness : 0;
        this.cloudThickness = config.cloudThickness || 0;
        this.orbitElements = config.orbitElements || null;
        this.lodLevels = config.lodLevels || [];
        this.dotPixelSizeThreshold = 2;
        this.dotColor = config.dotColor || 0xffffff;
        this.soiRadius = config.soiRadius || 0;
        this.components = [];
        this.modelUrl = config.model || null;
        this.velocity = new THREE.Vector3(0, 0, 0); // Always present
        Planet.instances.push(this);
        this.planetLight = null;
        this.#initGroups();

        // If model, load it and skip mesh/atmosphere/surface lines, but DO NOT return early
        if (this.modelUrl) {
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
                    if (config.addRings && config.rings) {
                        this.ringComponent = new RingComponent(this, config.rings);
                        this.components.push(this.ringComponent);
                    }
                    // If you want to add surface features to mesh planets, do it here:
                    // Example (uncomment if needed):
                    // this.planetMesh.userData.planetName = this.name;
                    // this.surface = new PlanetSurface(
                    //     this.planetMesh,
                    //     this.radius,
                    //     config.primaryGeojsonData,
                    //     config.stateGeojsonData,
                    //     surfaceOpts
                    // );
                    // Dispatch event for listeners (e.g., PlanetVectors)
                    if (typeof this.onMeshLoaded === 'function') this.onMeshLoaded();
                    if (typeof this.dispatchEvent === 'function') {
                        this.dispatchEvent({ type: 'planetMeshLoaded' });
                    }
                },
                undefined,
                (error) => {
                    console.error('Error loading 3D model for', this.name, error);
                }
            );
        } else {
            // --- Standard mesh/atmosphere/surface lines logic ---
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
                const earthRef = celestialBodiesConfig.earth.radius;
                if (Array.isArray(atm.rayleighScatteringCoeff)) atm.rayleighScatteringCoeff = atm.rayleighScatteringCoeff.map(v => v * (earthRef / this.radius));
                if (typeof atm.mieScatteringCoeff === 'number') atm.mieScatteringCoeff *= (earthRef / this.radius);
                const configWithComputedAtmo = { ...config, atmosphere: atm };
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
            this.distantComponent = new DistantMeshComponent(this);
            this.components.push(this.distantComponent);
            this.unrotatedGroup = new THREE.Group();
            this.scene.add(this.unrotatedGroup);
            if (this.cloudMaterial) {
                this.cloudComponent = new CloudComponent(this);
                this.components.push(this.cloudComponent);
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
                heightOffset: 0,
                ...config.surfaceOptions // allow config to override if needed
            };
            const polarScale = 1 - this.oblateness;
            const surfaceOpts = { ...defaultSurfaceOpts, polarScale, poiRenderOrder: this.renderOrderOverrides.POI ?? RENDER_ORDER.POI };
            this.planetMesh.userData.planetName = this.name;
            this.surface = new PlanetSurface(
                this.planetMesh,
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
            }
            if (config.radialGridConfig) {
                this.radialGrid = new RadialGrid(this, config.radialGridConfig);
            }
            // Add rings for procedural planets
            if (config.addRings && config.rings) {
                this.ringComponent = new RingComponent(this, config.rings);
                this.components.push(this.ringComponent);
            }
        }

        // --- SOI (Sphere of Influence) ---
        if (this.soiRadius > 0) {
            this.soiComponent = new SoiComponent(this);
            if (this.soiComponent.mesh) {
                this.components.push(this.soiComponent);
            }
        }

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
        if (this.rotationGroup) {
            RotationComponent.applyBaseOrientation(this.rotationGroup);
        }
    }

    /* ===== private helpers ===== */

    #initGroups() {
        this.unrotatedGroup = new THREE.Group();
        this.scene.add(this.unrotatedGroup);

        this.orbitGroup = new THREE.Group();
        this.orientationGroup = new THREE.Group();
        this.rotationGroup = new THREE.Group();

        // Initialize positions from targets
        this.orbitGroup.position.copy(this.targetPosition);
        this.orientationGroup.quaternion.copy(this.targetOrientation);

        this.orientationGroup.add(this.rotationGroup);
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

    /* ===== per-frame ===== */
    update() {
        if (this.type === 'barycenter') {
            // Only interpolate position/orientation for barycenters
            const LERP_ALPHA = 0.15;
            if (this.orbitGroup) {
                this.orbitGroup.position.lerp(this.targetPosition, LERP_ALPHA);
            }
            if (this.orientationGroup) {
                this.orientationGroup.quaternion.slerp(this.targetOrientation, LERP_ALPHA);
            }
            return;
        }
        // Always update distantComponent so it can toggle dot visibility
        this.distantComponent?.update();
        const LERP_ALPHA = 0.15; // Smoothing factor (0.1 to 0.2 is usually good)

        // ALWAYS Interpolate position of the orbitGroup towards the targetPosition
        if (this.orbitGroup) {
            this.orbitGroup.position.lerp(this.targetPosition, LERP_ALPHA);
        }

        // ALWAYS Interpolate orientation of the orientationGroup towards the targetOrientation
        if (this.orientationGroup) {
            this.orientationGroup.quaternion.slerp(this.targetOrientation, LERP_ALPHA);
        }

        // Remove the old conditional distantComponent update and return
        // If not distant, update all other detailed components as usual
        this.components.forEach(c => {
            if (c && typeof c.update === 'function') {
                if (c === this.distantComponent) return; // Already updated above
                c.update();
            }
        });
    }

    // New method to be called from App3D.tick() after main camera update
    updateAtmosphereUniforms(camera, sun) {
        if (this.atmosphereComponent && typeof this.atmosphereComponent.updateUniforms === 'function') {
            this.atmosphereComponent.updateUniforms(camera, sun);
        }
    }

    // New method for updating surface (lines/POIs) fading, called from App3D.tick() after camera update
    updateSurfaceFading(camera) {
        if (this.surface && typeof this.surface.updateFade === 'function') {
            this.surface.updateFade(camera);
        }
    }

    // New method for updating radial grid fading, called from App3D.tick() after camera update
    updateRadialGridFading(camera) {
        if (this.radialGrid && typeof this.radialGrid.updateFading === 'function') {
            this.radialGrid.updateFading(camera);
        }
    }

    /* ===== public ===== */
    getMesh() { return this.planetMesh; }
    getOrbitGroup() { return this.orbitGroup; }
    getUnrotatedGroup() {
        return this.unrotatedGroup;
    }

    getSurfaceTexture() {
        if (!this.planetMesh) return null;
        const mat = (o) => o instanceof THREE.LOD ? o.levels[0]?.object?.material : o.material;
        return mat(this.planetMesh)?.map?.image;
    }

    setSurfaceLinesVisible(v) { this.surface?.setSurfaceLinesVisible(v); }
    setCountryBordersVisible(v) { this.surface?.setCountryBordersVisible(v); }
    setStatesVisible(v) { this.surface?.setStatesVisible(v); }
    setCitiesVisible(v) { this.surface?.setCitiesVisible(v); }
    setAirportsVisible(v) { this.surface?.setAirportsVisible(v); }
    setSpaceportsVisible(v) { this.surface?.setSpaceportsVisible(v); }
    setGroundStationsVisible(v) { this.surface?.setGroundStationsVisible(v); }
    setObservatoriesVisible(v) { this.surface?.setObservatoriesVisible(v); }
    setMissionsVisible(v) { this.surface?.setMissionsVisible(v); }
    setSOIVisible(v) { this.soiComponent && (this.soiComponent.mesh.visible = v); }
    setRadialGridVisible(v) { this.radialGrid?.setVisible(v); }
    setRingsVisible(v) { if (this.ringComponent?.mesh) this.ringComponent.mesh.visible = v; }

    // Method to apply the very first server state directly, bypassing interpolation
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

    // Methods to set target state for interpolation for subsequent updates
    setTargetPosition(worldPositionVector) {
        this.targetPosition.copy(worldPositionVector);
    }

    setTargetOrientation(worldOrientationQuaternion) {
        this.targetOrientation.copy(worldOrientationQuaternion);
    }

    convertEciToGround(posEci) {
        const gmst = PhysicsUtils.calculateGMST(Date.now());
        const ecef = PhysicsUtils.eciToEcef(posEci, gmst);
        return PhysicsUtils.calculateIntersectionWithEarth(ecef);
    }

    static getRotationAngleAtTime(JD, rotPeriod, rotOffset = 0) {
        const secs = (JD - 2451545.0) * Constants.secondsInDay;
        return (2 * Math.PI * (secs / rotPeriod % 1)) + rotOffset;
    }

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

        const i = Planet.instances.indexOf(this);
        if (i !== -1) Planet.instances.splice(i, 1);
    }

    /**
     * Converts a quaternion from Z-up (server) to Y-up (Three.js) reference frame.
     * @param {THREE.Quaternion} qServer - Quaternion from server (Z-up)
     * @returns {THREE.Quaternion} - Quaternion for Three.js (Y-up)
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
        // Centralized in RotationComponent
        // RotationComponent.applyServerQuaternion(this.orientationGroup, qServer);
        // Now, this method will set the TARGET orientation for slerping.
        // qServer is assumed to be the final Y-up Three.js quaternion.
        this.targetOrientation.copy(qServer);
    }

    /**
     * TEST: Set a 90-degree rotation about Z (server frame) to verify orientation effect.
     * Call this from the console or a test button.
     */
    static testOrientation(planetInstance) {
        // 90 degrees about Z in server (Z-up) frame
        const qServer = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        planetInstance.setOrientationFromServerQuaternion(qServer);
    }
}
