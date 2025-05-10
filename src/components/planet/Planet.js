/* Planet.js */
import * as THREE from 'three';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { Constants } from '../../utils/Constants.js';
import { PlanetSurface } from './PlanetSurface.js';
import { PlanetMaterials } from './PlanetMaterials.js';
import { RadialGrid } from './RadialGrid.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { celestialBodiesConfig } from '../../config/celestialBodiesConfig.js';
import atmosphereMeshVertexShader from '../../shaders/atmosphereMesh.vert?raw';
import atmosphereMeshFragmentShader from '../../shaders/atmosphereMesh.frag?raw';
import { RotationComponent } from './RotationComponent.js';
import { AtmosphereComponent } from './AtmosphereComponent.js';
import { CloudComponent } from './CloudComponent.js';
import { RingComponent } from './RingComponent.js';
import { DistantMeshComponent } from './DistantMeshComponent.js';
import { SoiComponent } from './SoiComponent.js';

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
            rotationPeriod = 86_400, orbitalPeriod = 365.25,
            tilt = 0, rotationOffset = 0,
            meshRes = 128, atmosphereRes = 128, cloudRes = 128,
            cloudThickness = 0,
            orbitElements = null,
            addSurface = false, surfaceOptions = {},
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
        this.nameLower = this.name.toLowerCase();
        this.symbol = symbol || name.charAt(0);

        this.radius = radius;
        this.orbitRadius = orbitRadius;
        this.oblateness = oblateness;
        this.rotationPeriod = rotationPeriod;
        this.orbitalPeriod = orbitalPeriod;
        this.tilt = tilt;
        this.rotationOffset = rotationOffset;

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
        // Rotation handling
        this.rotationComponent = new RotationComponent(this);
        this.components.push(this.rotationComponent);

        /* ---------- materials ---------- */
        this.materials = new PlanetMaterials(
            this.textureManager,
            this.renderer.capabilities,
            materialOverrides
        );

        /* ---------- Render order overrides ---------- */
        this.renderOrderOverrides = (config.materials && config.materials.renderOrderOverrides) || {};

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
        if (this.soiRadius > 0) {
            this.soiComponent = new SoiComponent(this);
            this.components.push(this.soiComponent);
        }

        /* ---------- optional surface ---------- */
        if (addSurface) {
            const polarScale = 1 - this.oblateness;
            const surfaceOpts = { ...surfaceOptions, polarScale, poiRenderOrder: this.renderOrderOverrides.POI ?? RENDER_ORDER.POI };
            this.planetMesh.userData.planetName = this.name;
            this.surface = new PlanetSurface(
                this.planetMesh,
                this.radius,
                primaryGeojsonData,
                stateGeojsonData,
                surfaceOpts
            );
            this.#addSurfaceDetails({
                surfaceOptions,
                cityData,
                airportsData,
                spaceportsData,
                groundStationsData,
                observatoriesData,
                missionsData
            });
        }

        /* ---------- optional radial grid ---------- */
        if (radialGridConfig) this.radialGrid = new RadialGrid(this, radialGridConfig);

        /* ---------- optional light ---------- */
        if (addLight) this.#addLight(lightOptions);

        /* ----- rings ----- */
        if (addRings && ringConfig) {
            this.ringComponent = new RingComponent(this, ringConfig);
            this.components.push(this.ringComponent);
        }

        // Special case: if this is the EMB, add a visible marker
        if (this.nameLower === 'emb') {
            this.marker = new THREE.Mesh(
                new THREE.SphereGeometry(1000, 16, 16), // Small sphere
                new THREE.MeshBasicMaterial({ color: 0xff00ff })
            );
            this.unrotatedGroup = new THREE.Group();
            this.unrotatedGroup.add(this.marker);
            this.scene.add(this.unrotatedGroup);
        } else {
            this.unrotatedGroup = new THREE.Group();
            this.scene.add(this.unrotatedGroup);
        }

        // Cloud layer component
        if (this.cloudMaterial) {
            this.cloudComponent = new CloudComponent(this);
            this.components.push(this.cloudComponent);
        }

        this.update(); // initial orientation & orbit
    }

    /* ===== private helpers ===== */

    #initGroups() {
        this.unrotatedGroup = new THREE.Group();
        this.scene.add(this.unrotatedGroup);

        this.orbitGroup = new THREE.Group();
        this.tiltGroup = new THREE.Group();
        this.rotationGroup = new THREE.Group();

        this.tiltGroup.add(this.rotationGroup);
        this.orbitGroup.add(this.tiltGroup);
        this.scene.add(this.orbitGroup);

        this.orbitGroup.rotation.set(-Math.PI / 2, 0, Math.PI); // Z-north
        this.tiltGroup.rotation.x = THREE.MathUtils.degToRad(this.tilt);
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

    #addSurfaceDetails({
        surfaceOptions: o = {},
        cityData,
        airportsData,
        spaceportsData,
        groundStationsData,
        observatoriesData,
        missionsData
    }) {
        const {
            addLatitudeLines = false, latitudeStep = 1,
            addLongitudeLines = false, longitudeStep = 1,
            addCountryBorders = false,
            addStates = false,
            addCities = false,
            addAirports = false,
            addSpaceports = false,
            addGroundStations = false,
            addObservatories = false,
            addMissions = false
        } = o;

        if (addLatitudeLines) this.surface.addLatitudeLines(latitudeStep);
        if (addLongitudeLines) this.surface.addLongitudeLines(longitudeStep);
        if (addCountryBorders) this.surface.addCountryBorders();
        if (addStates) this.surface.addStates();

        const layers = [
            [addCities, cityData, 'cityPoint', 'cities'],
            [addAirports, airportsData, 'airportPoint', 'airports'],
            [addSpaceports, spaceportsData, 'spaceportPoint', 'spaceports'],
            [addGroundStations, groundStationsData, 'groundStationPoint', 'groundStations'],
            [addObservatories, observatoriesData, 'observatoryPoint', 'observatories'],
            [addMissions, missionsData, 'missionPoint', 'missions']
        ];
        for (const [flag, data, matKey, layer] of layers) {
            if (flag && data) this.surface.addInstancedPoints(data, this.surface.materials[matKey], layer);
        }
    }

    #addLight({
        color = 0xffffff, intensity = 1, distance,
        decay = 1, position = new THREE.Vector3(),
        helper = false, helperSize = 5
    } = {}) {
        const light = new THREE.PointLight(color, intensity, distance, decay);
        light.position.copy(position);
        this.orbitGroup.add(light);
        if (helper) this.scene.add(new THREE.PointLightHelper(light, helperSize));
    }

    /* ===== per-frame ===== */
    update() {
        // Update all registered components
        this.components.forEach(c => c.update());
        // Update EMB marker position if this is EMB
        if (this.nameLower === 'emb' && this.marker && window.Astronomy) {
            const jd = this.timeManager.getJulianDate();
            const embState = window.Astronomy.BaryState(window.Astronomy.Body.EMB, jd);
            const kmPerAU = 149597870.7;
            this.marker.position.set(
                embState.x * kmPerAU,
                embState.y * kmPerAU,
                embState.z * kmPerAU
            );
        }
        // Shader uniforms are now updated externally by App3D after final position sync

        // Update surface/grid fading
        this.surface && Planet.camera && this.surface.updateFade(Planet.camera);
    }

    updateAxisHelperPosition() {
        if (this._axisHelper && this._axisHelper.visible) {
            const worldPos = new THREE.Vector3();
            this.getOrbitGroup().getWorldPosition(worldPos);
            this._axisHelper.position.copy(worldPos);
        }
    }

    /* ===== public ===== */
    getMesh() { return this.planetMesh; }
    getTiltGroup() { return this.tiltGroup; }
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
        this.surface?.dispose?.();
        this.radialGrid?.dispose?.();

        const i = Planet.instances.indexOf(this);
        if (i !== -1) Planet.instances.splice(i, 1);
    }

    setAxisVisible(visible) {
        if (visible) {
            if (!this._axisHelper) {
                // Use Mercury's radius if this.radius is falsy (for barycenters)
                const mercuryRadius = celestialBodiesConfig.mercury.radius;
                const size = (this.radius && this.radius > 0) ? this.radius * 2 : mercuryRadius * 2;
                this._axisHelper = new THREE.AxesHelper(size);
                this._axisHelper.name = `${this.name}_AxisHelper`;
                // Add labeled axis
                const color = { X: '#ff0000', Y: '#00ff00', Z: '#0000ff' };
                this._axisLabels = [];
                const mkLabel = axis => {
                    const div = document.createElement('div');
                    div.className = 'axis-label';
                    div.textContent = axis;
                    div.style.color = color[axis];
                    div.style.fontSize = '14px';
                    return new CSS2DObject(div);
                };
                ['X', 'Y', 'Z'].forEach(axis => {
                    const lbl = mkLabel(axis);
                    lbl.position.set(axis === 'X' ? size : 0,
                        axis === 'Y' ? size : 0,
                        axis === 'Z' ? size : 0);
                    this._axisHelper.add(lbl);
                    this._axisLabels.push(lbl);
                });
            }
            if (!this._axisHelper.parent) {
                this.scene.add(this._axisHelper);
            }
            this._axisHelper.visible = true;
            if (this._axisLabels) {
                this._axisLabels.forEach(lbl => lbl.visible = true);
            }
        } else {
            if (this._axisHelper && this._axisHelper.parent) {
                this.scene.remove(this._axisHelper);
            }
        }
    }
}
