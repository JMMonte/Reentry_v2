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
import { RingComponent } from './RingComponent.js';
import { RotationComponent } from './RotationComponent.js';

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
        const {
            name, radius,
            orbitRadius = 0, oblateness = 0,
            rotationPeriod = 86_400,
            orbitalPeriod = 365.25,
            meshRes = 128,
            atmosphereRes = 128,
            cloudRes = 128,
            cloudThickness = 0,
            orbitElements = null,
            surfaceOptions = {},
            primaryGeojsonData, stateGeojsonData,
            cityData, airportsData, spaceportsData,
            groundStationsData, observatoriesData, missionsData,
            addLight = false, lightOptions = {},
            materials: materialOverrides = {},
            symbol, lodLevels = [],
            dotPixelSizeThreshold = 4, dotColor = 0xffffff,
            soiRadius = 0,
            addRings = false,
            rings: ringConfig = null,
            radialGridConfig = null
        } = config;

        this.scene = scene;
        this.renderer = renderer;
        this.timeManager = timeManager;
        this.textureManager = textureManager;

        this.name = name;
        this.nameLower = (name || '').toLowerCase();
        this.symbol = symbol || name.charAt(0);

        this.radius = radius;
        this.orbitRadius = orbitRadius;
        this.oblateness = oblateness;
        this.rotationPeriod = rotationPeriod;
        this.orbitalPeriod = orbitalPeriod;

        // Target states for interpolation
        this.targetPosition = new THREE.Vector3();
        this.targetOrientation = new THREE.Quaternion();

        this.hasBeenInitializedByServer = false;

        this.meshRes = meshRes;
        this.atmosphereRes = atmosphereRes;
        this.cloudRes = cloudRes;
        this.atmosphereThickness = (config.atmosphere && typeof config.atmosphere.thickness === 'number') ? config.atmosphere.thickness : 0;
        this.cloudThickness = cloudThickness;
        this.orbitElements = orbitElements;

        this.lodLevels = lodLevels;
        this.dotPixelSizeThreshold = dotPixelSizeThreshold;
        this.dotColor = dotColor;
        this.soiRadius = radius * soiRadius;

        Planet.instances.push(this);
        // Component system
        this.components = [];

        /* ---------- materials ---------- */
        this.materials = new PlanetMaterials(
            this.textureManager,
            this.renderer.capabilities,
            materialOverrides
        );

        /* ---------- Render order overrides ---------- */
        this.renderOrderOverrides = (config.materials && config.materials.renderOrderOverrides) || {};
        // Dynamic per-planet render order grouping to interleave surface and atmosphere on draw
        const planetIndex = Planet.instances.length - 1;
        const blockSize = 10;
        this.renderOrderOverrides.SURFACE = planetIndex * blockSize + RENDER_ORDER.SURFACE;
        this.renderOrderOverrides.CLOUDS = planetIndex * blockSize + RENDER_ORDER.CLOUDS;
        this.renderOrderOverrides.ATMOSPHERE = planetIndex * blockSize + RENDER_ORDER.ATMOSPHERE;

        /* ---------- build ---------- */
        this.#initGroups();
        this.#initMaterials();
        this.#initMeshes();

        if (config.atmosphere) {
            // Compute thickness and densityScaleHeight from fractions if present
            const atm = { ...config.atmosphere };
            if ('thicknessFraction' in atm) {
                atm.thickness = atm.thicknessFraction * this.radius;
            }
            // Store computed thickness on the planet so AtmosphereComponent uses it
            this.atmosphereThickness = atm.thickness;
            if ('densityScaleHeightFraction' in atm) {
                atm.densityScaleHeight = atm.densityScaleHeightFraction * this.radius;
            }
            // Normalize scattering coefficients to reference Earth radius
            const earthRef = celestialBodiesConfig.earth.radius;
            if (Array.isArray(atm.rayleighScatteringCoeff)) {
                atm.rayleighScatteringCoeff = atm.rayleighScatteringCoeff.map(v => v * (earthRef / this.radius));
            }
            if (typeof atm.mieScatteringCoeff === 'number') {
                atm.mieScatteringCoeff *= (earthRef / this.radius);
            }
            // Build a config copy with computed values
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
            // Assign atmosphere mesh and apply render order if available
            this.atmosphereMesh = this.atmosphereComponent.mesh;
            if (this.atmosphereMesh) {
                this.atmosphereMesh.renderOrder = this.renderOrderOverrides.ATMOSPHERE ?? RENDER_ORDER.ATMOSPHERE;
            }
        }
        this.distantComponent = new DistantMeshComponent(this);
        this.components.push(this.distantComponent);
        // Only create surface features for non-barycenter objects
        this.unrotatedGroup = new THREE.Group();
        this.scene.add(this.unrotatedGroup);

        // Cloud layer component
        if (this.cloudMaterial) {
            this.cloudComponent = new CloudComponent(this);
            this.components.push(this.cloudComponent);
        }

        // --- Surface features ---
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
            ...surfaceOptions // allow config to override if needed (for future flexibility)
        };
        const polarScale = 1 - this.oblateness;
        const surfaceOpts = { ...defaultSurfaceOpts, polarScale, poiRenderOrder: this.renderOrderOverrides.POI ?? RENDER_ORDER.POI };
        this.planetMesh.userData.planetName = this.name;
        this.surface = new PlanetSurface(
            this.planetMesh,
            this.radius,
            primaryGeojsonData,
            stateGeojsonData,
            surfaceOpts
        );
        // Add surface details (POIs, etc.)
        if (this.surface) {
            const o = surfaceOpts;
            if (o.addLatitudeLines) this.surface.addLatitudeLines(o.latitudeStep);
            if (o.addLongitudeLines) this.surface.addLongitudeLines(o.longitudeStep);
            if (o.addCountryBorders) this.surface.addCountryBorders();
            if (o.addStates) this.surface.addStates();
            const layers = [
                [o.addCities, cityData, 'cityPoint', 'cities'],
                [o.addAirports, airportsData, 'airportPoint', 'airports'],
                [o.addSpaceports, spaceportsData, 'spaceportPoint', 'spaceports'],
                [o.addGroundStations, groundStationsData, 'groundStationPoint', 'groundStations'],
                [o.addObservatories, observatoriesData, 'observatoryPoint', 'observatories'],
                [o.addMissions, missionsData, 'missionPoint', 'missions']
            ];
            for (const [flag, data, matKey, layer] of layers) {
                if (flag && data) this.surface.addInstancedPoints(data, this.surface.materials[matKey], layer);
            }
        }

        // --- Radial grid ---
        if (radialGridConfig) {
            this.radialGrid = new RadialGrid(this, radialGridConfig);
        }
        // Treat surface fade as a component for per-frame updates
        if (this.surface) {
            // Remove the direct call to updateFade from here. It will be handled by a new method.
            // this.components.push({
            //     update: () => {
            //         if (Planet.camera) this.surface.updateFade(Planet.camera);
            //     }
            // });
        }
        // Treat radial grid position and fading as a component
        if (this.radialGrid) {
            // The radialGrid itself doesn't have an update() method in the traditional sense for position,
            // as it's parented. We keep it in components if it had other generic update logic.
            // For now, let's assume it might, or this entry can be removed if RadialGrid.update() is empty/doesn't exist.
            // If RadialGrid needs other non-fading updates, it should have its own update() method.
            // For now, we remove the direct call to updateFading from here.
            // this.components.push({
            //     update: () => {
            //         // if (Planet.camera) {
            //         //     this.radialGrid.updateFading(Planet.camera);
            //         // }
            //     }
            // });
        }

        // --- SOI (Sphere of Influence) ---
        if (this.soiRadius > 0) {
            this.soiComponent = new SoiComponent(this);
            if (this.soiComponent.mesh) {
                this.components.push(this.soiComponent);
            }
        }

        // --- Light ---
        if (addLight) {
            const light = new THREE.PointLight(
                lightOptions.color || 0xffffff,
                lightOptions.intensity || 1,
                lightOptions.distance,
                lightOptions.decay || 1
            );
            if (lightOptions.position) light.position.copy(lightOptions.position);
            this.orbitGroup.add(light);
            if (lightOptions.helper) this.scene.add(new THREE.PointLightHelper(light, lightOptions.helperSize || 5));
        }

        // --- Rings ---
        if (addRings && ringConfig) {
            this.ringComponent = new RingComponent(this, ringConfig);
            this.components.push(this.ringComponent);
        }

        this.update(); // initial build and initial per-frame updates

        // Apply base orientation using RotationComponent
        if (this.rotationGroup) {
            // You can adjust baseRotation or applyBase for debug
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
