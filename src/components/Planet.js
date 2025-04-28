import * as THREE from 'three';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { Constants } from '../utils/Constants.js';
import { PlanetSurface } from './PlanetSurface.js';
import { PlanetMaterials } from './PlanetMaterials.js';

export class Planet {
    /** Registry holding every created planet */
    static instances = [];

    /**
     * @param {THREE.Scene}          scene
     * @param {THREE.WebGLRenderer}  renderer
     * @param {TimeManager}          timeManager
     * @param {TextureManager}       textureManager
     * @param {object}               config
     */
    constructor(scene, renderer, timeManager, textureManager, config = {}) {
        const {
            name,
            radius,
            orbitRadius = 0,
            oblateness = 0,
            rotationPeriod = 86_400,
            orbitalPeriod = 365.25,
            tilt = 0,
            meshRes = 128,
            atmosphereRes = 128,
            cloudRes = 128,
            atmosphereThickness = 0,
            cloudThickness = 0,
            orbitElements = null,
            addSurface = false,
            surfaceOptions = {},
            primaryGeojsonData,
            stateGeojsonData,
            cityData,
            airportsData,
            spaceportsData,
            groundStationsData,
            observatoriesData,
            missionsData,
            addLight = false,
            lightOptions = {},
            materials: materialOverrides = {},
            symbol
        } = config;

        /* ---------- basic setup ---------- */
        this.name = name;
        this.symbol = symbol || name.charAt(0);
        this.scene = scene;
        this.renderer = renderer;
        this.timeManager = timeManager;
        this.textureManager = textureManager;
        this.orbitRadius = orbitRadius;
        this.radius = radius;
        this.oblateness = oblateness;
        this.rotationPeriod = rotationPeriod;
        this.orbitalPeriod = orbitalPeriod;
        this.tilt = tilt;
        this.meshRes = meshRes;
        this.atmosphereRes = atmosphereRes;
        this.cloudRes = cloudRes;
        this.atmosphereThickness = atmosphereThickness;
        this.cloudThickness = cloudThickness;
        this.orbitElements = orbitElements;
        this.rotationOffset = 0; // prime-meridian alignment

        Planet.instances.push(this);

        /* ---------- materials ---------- */
        this.materials = new PlanetMaterials(
            this.textureManager,
            this.renderer.capabilities,
            materialOverrides
        );

        /* ---------- scene graph ---------- */
        this.#initGroups();
        this.#initMaterials();
        this.#initMeshes();

        /* ---------- optional surface ---------- */
        if (addSurface) {
            this.surface = new PlanetSurface(
                this.planetMesh,
                this.radius,
                primaryGeojsonData,
                stateGeojsonData,
                surfaceOptions
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

        /* ---------- optional planet light ---------- */
        if (addLight) this.#addLight(lightOptions);
    }

    /* ===== private helpers ===== */

    /** orbit → tilt → spin hierarchy & axial tilt */
    #initGroups() {
        this.orbitGroup = new THREE.Group();
        this.tiltGroup = new THREE.Group();
        this.rotationGroup = new THREE.Group();

        this.tiltGroup.add(this.rotationGroup);
        this.orbitGroup.add(this.tiltGroup);
        this.scene.add(this.orbitGroup);

        // Z-axis = north pole (Three.js default is Y-up)
        this.orbitGroup.rotation.set(-Math.PI / 2, 0, Math.PI);
        this.tiltGroup.rotation.x = THREE.MathUtils.degToRad(this.tilt);

        if (this.orbitElements) this.#drawOrbitLine();
    }

    #initMaterials() {
        this.surfaceMaterial = this.materials.getSurfaceMaterial();
        this.cloudMaterial = this.cloudThickness > 0 ? this.materials.getCloudMaterial() : null;
        this.atmosphereMaterial = this.atmosphereThickness > 0
            ? this.materials.getAtmosphereMaterial(this.radius)
            : null;
        this.glowMaterial = this.materials.getGlowMaterial(this.radius, { atmoHeight: this.atmosphereThickness });
    }

    #initMeshes() {
        const scaledRadius = this.radius * (1 - this.oblateness);

        /* --- planet core --- */
        this.planetMesh = new THREE.Mesh(
            new THREE.SphereGeometry(scaledRadius, this.meshRes, this.meshRes),
            this.surfaceMaterial
        );
        this.rotationGroup.add(this.planetMesh);

        /* --- atmosphere shell --- */
        if (this.atmosphereMaterial) {
            this.atmosphereMesh = new THREE.Mesh(
                new THREE.SphereGeometry(this.radius + this.atmosphereThickness, this.atmosphereRes, this.atmosphereRes),
                this.atmosphereMaterial
            );
            this.atmosphereMesh.renderOrder = -1;
            this.rotationGroup.add(this.atmosphereMesh);
        }

        /* --- cloud shell --- */
        if (this.cloudMaterial) {
            this.cloudMesh = new THREE.Mesh(
                new THREE.SphereGeometry(this.radius + this.cloudThickness, this.cloudRes, this.cloudRes),
                this.cloudMaterial
            );
            this.cloudMesh.renderOrder = 1;
            this.rotationGroup.add(this.cloudMesh);
        }

        /* --- glow shell --- */
        if (this.glowMaterial) {
            const { renderOrder } = this.materials.getGlowParameters();
            const glowRadius = this.radius + this.atmosphereThickness;
            this.glowMesh = new THREE.Mesh(
                new THREE.SphereGeometry(glowRadius, this.meshRes, this.meshRes),
                this.glowMaterial
            );
            this.glowMesh.renderOrder = renderOrder;
            this.rotationGroup.add(this.glowMesh);
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
            addLatitudeLines = false,
            latitudeStep = 10,
            addLongitudeLines = false,
            longitudeStep = 10,
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
        color = 0xffffff,
        intensity = 1,
        distance,
        decay = 1,
        position = new THREE.Vector3(),
        helper = false,
        helperSize = 5
    } = {}) {
        const light = new THREE.PointLight(color, intensity, distance, decay);
        light.position.copy(position);
        this.orbitGroup.add(light);

        if (helper) this.scene.add(new THREE.PointLightHelper(light, helperSize));
    }

    #drawOrbitLine() {
        const points = [];
        const samples = 360;
        const periodSeconds = (this.orbitalPeriod ?? 27.321661) * Constants.secondsInDay;

        for (let i = 0; i <= samples; i++) {
            points.push(
                PhysicsUtils.getPositionAtTime(this.orbitElements, (i / samples) * periodSeconds)
            );
        }

        this.orbitLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5 })
        );
        this.orbitLine.frustumCulled = false;
        this.scene.add(this.orbitLine);
    }

    /* ===== frame updates ===== */

    update() {
        this.#updateOrbit();
        this.#updateRotation();
        this.#updateLightDirection();
    }

    #updateOrbit() {
        if (this.orbitElements) {
            const JD = this.timeManager.getJulianDate();
            const tSeconds = (JD - 2_451_545.0) * Constants.secondsInDay; // since J2000
            this.orbitGroup.position.copy(
                PhysicsUtils.getPositionAtTime(this.orbitElements, tSeconds)
            );
        } else if (this.orbitRadius > 0) {
            const dayFrac = this.timeManager.dayOfYear + this.timeManager.fractionOfDay;
            const angle = (2 * Math.PI * dayFrac) / this.orbitalPeriod;
            this.orbitGroup.position.set(
                this.orbitRadius * Math.cos(angle),
                0,
                this.orbitRadius * Math.sin(angle)
            );
        }
    }

    #updateRotation() {
        const JD = this.timeManager.getJulianDate();
        const secs = (JD - 2_451_545.0) * Constants.secondsInDay;
        this.rotationGroup.rotation.y =
            (2 * Math.PI * (secs / this.rotationPeriod % 1)) + this.rotationOffset;
    }

    #updateLightDirection() {
        const sun = this.timeManager.getSunPosition();

        if (this.atmosphereMaterial) {
            this.atmosphereMaterial.uniforms.lightPosition.value.copy(sun);
        }
        if (this.glowMaterial?.uniforms?.lightPosition) {
            this.glowMaterial.uniforms.lightPosition.value.copy(sun);
        }
    }

    /* ===== public helpers & toggles ===== */

    getMesh() { return this.planetMesh; }
    getTiltGroup() { return this.tiltGroup; }
    getSurfaceTexture() { return this.planetMesh?.material?.map; }

    setSurfaceLinesVisible(v) { this.surface?.setSurfaceLinesVisible(v); }
    setCountryBordersVisible(v) { this.surface?.setCountryBordersVisible(v); }
    setStatesVisible(v) { this.surface?.setStatesVisible(v); }
    setCitiesVisible(v) { this.surface?.setCitiesVisible(v); }
    setAirportsVisible(v) { this.surface?.setAirportsVisible(v); }
    setSpaceportsVisible(v) { this.surface?.setSpaceportsVisible(v); }
    setGroundStationsVisible(v) { this.surface?.setGroundStationsVisible(v); }
    setObservatoriesVisible(v) { this.surface?.setObservatoriesVisible(v); }
    setMissionsVisible(v) { this.surface?.setMissionsVisible(v); }

    /** Convert ECI to surface lat/lon */
    convertEciToGround(posEci) {
        const gmst = PhysicsUtils.calculateGMST(Date.now());
        const ecef = PhysicsUtils.eciToEcef(posEci, gmst);
        return PhysicsUtils.calculateIntersectionWithEarth(ecef);
    }
}
