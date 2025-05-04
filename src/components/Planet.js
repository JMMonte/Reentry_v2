import * as THREE from 'three';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { Constants } from '../utils/Constants.js';
import { PlanetSurface } from './PlanetSurface.js';
import { PlanetMaterials } from './PlanetMaterials.js';
import { RadialGrid } from './RadialGrid.js';

export class Planet {
    /** Registry holding every created planet */
    static instances = [];
    /** Shared camera reference for LOD updates */
    static camera = null;
    /** Method to set shared camera */
    static setCamera(cam) { Planet.camera = cam; }

    /**
     * @param {THREE.Scene}          scene
     * @param {THREE.WebGLRenderer}  renderer
     * @param {TimeManager}          timeManager
     * @param {TextureManager}       textureManager
     * @param {object}               config
     */
    constructor(scene, renderer, timeManager, textureManager, config = {}) {
        this.config = config;
        const {
            name,
            radius,
            orbitRadius = 0,
            oblateness = 0,
            rotationPeriod = 86_400,
            orbitalPeriod = 365.25,
            tilt = 0,
            rotationOffset = 0,
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
            symbol,
            lodLevels = [],
            // distant dot rendering pixel-size threshold in pixels
            dotPixelSizeThreshold = 4,
            dotColor = 0xffffff,
            // sphere-of-influence radius, in multiples of planet radius
            soiRadius = 0,
            // NEW: Config object for the radial grid
            radialGridConfig = null
        } = config;

        /* ---------- basic setup ---------- */
        this.name = name;
        this.symbol = symbol || name.charAt(0);
        this.scene = scene;
        this.renderer = renderer;
        this.timeManager = timeManager;
        this.textureManager = textureManager;
        // Scene units = config units
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
        this.rotationOffset = rotationOffset;
        // Store LOD levels for dynamic resolution
        this.lodLevels = lodLevels;
        // Store distant rendering parameters
        this.dotPixelSizeThreshold = dotPixelSizeThreshold;
        this.dotColor = dotColor;
        // SOI radius as a multiple of planet radius
        this.soiRadius = this.radius * soiRadius;

        console.log(`Planet [${this.name}] Constructor: Initial radius from config = ${this.radius}`); // DEBUG

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
        // initialize distant dot mesh
        this.#initDistantMesh();
        // initialize Sphere of Influence rim glow mesh
        if (this.soiRadius > 0) this.#initSoiMesh();

        /* ---------- optional surface ---------- */
        if (addSurface) {
            console.log(`Planet [${this.name}] Constructor: Passing radius ${this.radius} to PlanetSurface`); // DEBUG
            // Add planet name to userData before passing the mesh to PlanetSurface
            // This helps with debugging messages from PlanetSurface
            this.planetMesh.userData.planetName = this.name;

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

        /* ---------- optional radial grid ---------- */
        this.radialGrid = null; // Initialize property
        if (radialGridConfig) {
            // Pass `this` (the planet instance) and the config to RadialGrid
            this.radialGrid = new RadialGrid(this, radialGridConfig);
            console.log(`Planet [${this.name}] Constructor: RadialGrid created.`); // DEBUG
        }

        /* ---------- optional planet light ---------- */
        if (addLight) this.#addLight(lightOptions);
        // initialize orientation and position based on simulated time
        this.update();
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
            ? this.materials.atmosphereCreator(this.radius, { atmoHeight: this.atmosphereThickness })
            : null;
        this.glowMaterial = this.materials.getGlowMaterial(this.radius, { atmoHeight: this.atmosphereThickness });
    }

    #initMeshes() {
        const scaledRadius = this.radius * (1 - this.oblateness);
        // --- planet core with dynamic LOD support ---
        if (this.lodLevels?.length) {
            this.planetLOD = new THREE.LOD();
            for (const { meshRes, distance } of this.lodLevels) {
                const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(scaledRadius, meshRes, meshRes),
                    this.surfaceMaterial
                );
                this.planetLOD.addLevel(sphere, distance);
            }
            this.rotationGroup.add(this.planetLOD);
            // alias planetMesh to the LOD for compatibility
            this.planetMesh = this.planetLOD;
        } else {
            // Fallback to single-resolution mesh
            this.planetMesh = new THREE.Mesh(
                new THREE.SphereGeometry(scaledRadius, this.meshRes, this.meshRes),
                this.surfaceMaterial
            );
            this.rotationGroup.add(this.planetMesh);
        }

        /* --- atmosphere shell with LOD --- */
        if (this.atmosphereMaterial) {
            if (this.lodLevels?.length) {
                this.atmosphereLOD = new THREE.LOD();
                for (const { meshRes, distance } of this.lodLevels) {
                    const mesh = new THREE.Mesh(
                        new THREE.SphereGeometry(this.radius + this.atmosphereThickness, meshRes, meshRes),
                        this.atmosphereMaterial
                    );
                    mesh.renderOrder = -1;
                    this.atmosphereLOD.addLevel(mesh, distance);
                }
                this.rotationGroup.add(this.atmosphereLOD);
                this.atmosphereMesh = this.atmosphereLOD;
            } else {
                this.atmosphereMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(this.radius + this.atmosphereThickness, this.atmosphereRes, this.atmosphereRes),
                    this.atmosphereMaterial
                );
                this.atmosphereMesh.renderOrder = -1;
                this.rotationGroup.add(this.atmosphereMesh);
            }
        }

        /* --- cloud shell with LOD --- */
        if (this.cloudMaterial) {
            if (this.lodLevels?.length) {
                this.cloudLOD = new THREE.LOD();
                for (const { meshRes, distance } of this.lodLevels) {
                    const mesh = new THREE.Mesh(
                        new THREE.SphereGeometry(this.radius + this.cloudThickness, meshRes, meshRes),
                        this.cloudMaterial
                    );
                    mesh.renderOrder = 1;
                    this.cloudLOD.addLevel(mesh, distance);
                }
                this.rotationGroup.add(this.cloudLOD);
                this.cloudMesh = this.cloudLOD;
            } else {
                this.cloudMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(this.radius + this.cloudThickness, this.cloudRes, this.cloudRes),
                    this.cloudMaterial
                );
                this.cloudMesh.renderOrder = 1;
                this.rotationGroup.add(this.cloudMesh);
            }
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
            latitudeStep = 1,
            addLongitudeLines = false,
            longitudeStep = 1,
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

    // Initialize a simple distant dot mesh
    #initDistantMesh() {
        const dotGeo = new THREE.SphereGeometry(1, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({ color: this.dotColor, transparent: true, opacity: 0.7 });
        this.distantMesh = new THREE.Mesh(dotGeo, dotMat);
        this.distantMesh.visible = false;
        // Add to orbitGroup so it follows the planet's orbital position but doesn't spin/tilt
        this.orbitGroup.add(this.distantMesh);
    }

    // Initialize Sphere of Influence rim glow mesh
    #initSoiMesh() {
        if (!this.materials.getSOIMaterial) {
            console.warn(`Planet ${this.name}: SOI material creator not found, skipping SOI mesh.`);
            return;
        }
        const soiGeo = new THREE.SphereGeometry(this.soiRadius, 64, 32); // Use higher res for smoother edge
        const soiMat = this.materials.getSOIMaterial();
        if (!soiMat) {
            console.warn(`Planet ${this.name}: SOI material failed to create, skipping SOI mesh.`);
            return;
        }
        this.soiMesh = new THREE.Mesh(soiGeo, soiMat);
        this.soiMesh.visible = true;
        // Ensure SOI renders BEFORE default objects (like the grid)
        this.soiMesh.renderOrder = -1; // Lower number renders earlier
        // Attach to tiltGroup so it doesn't spin with planet rotation but respects tilt
        this.tiltGroup.add(this.soiMesh);
        console.log(`Planet ${this.name}: SOI mesh added with radius ${this.soiRadius.toFixed(2)}`);
    }

    /* ===== frame updates ===== */

    update() {
        // Distant rendering: switch to fuzzy dot based on pixel size
        if (Planet.camera && this.distantMesh) {
            const worldPos = new THREE.Vector3();
            this.orbitGroup.getWorldPosition(worldPos);
            // Use planetMesh world position for consistency if available
            const detailMeshWorldPos = new THREE.Vector3();
            this.planetMesh.getWorldPosition(detailMeshWorldPos);
            const cameraPos = Planet.camera.position;

            const dist = detailMeshWorldPos.distanceTo(cameraPos);
            const fovY = THREE.MathUtils.degToRad(Planet.camera.fov);
            const screenH = window.innerHeight;
            // angular diameter of planet
            const angularDiameter = 2 * Math.atan(this.radius / dist);
            // projected size in pixels
            const pixelHeight = (angularDiameter / fovY) * screenH;
            if (pixelHeight < this.dotPixelSizeThreshold) {
                // show dot, hide detailed meshes
                this.distantMesh.visible = true;
                this.planetMesh.visible = false;
                this.atmosphereMesh && (this.atmosphereMesh.visible = false);
                this.cloudMesh && (this.cloudMesh.visible = false);
                this.glowMesh && (this.glowMesh.visible = false);
                // scale dot so it appears roughly dotPixelSizeThreshold pixels tall
                const angleTh = (this.dotPixelSizeThreshold / screenH) * fovY;
                const rDot = Math.tan(angleTh / 2) * dist;
                this.distantMesh.scale.setScalar(rDot);
            } else {
                // hide dot, show detailed meshes
                this.distantMesh.visible = false;
                this.planetMesh.visible = true;
                this.atmosphereMesh && (this.atmosphereMesh.visible = true);
                this.cloudMesh && (this.cloudMesh.visible = true);
                this.glowMesh && (this.glowMesh.visible = true);
                // update LOD if available
                this.planetLOD && this.planetLOD.update(Planet.camera);
            }
        }
        // Log before orbit update
        // if (!this._planetLogCounter || this._planetLogCounter % 60 === 0) console.log(`Planet [${this.name}] update: Calling internal updates`);
        this.#updateOrbit(); // Calculate and set orbitGroup position
        this.#updateRotation(); // Update rotationGroup rotation
        this.#updateLightDirection(); // Update shader uniforms

        // fade out surface details when far away
        if (this.surface && Planet.camera) this.surface.updateFade(Planet.camera);
        // Update radial grid label fading
        if (this.radialGrid && Planet.camera) {
            this.radialGrid.updateFading(Planet.camera);
        }
        // Update radial grid position
        if (this.radialGrid) {
            this.radialGrid.updatePosition();
        }
        // this._planetLogCounter = (this._planetLogCounter || 0) + 1;
    }

    #updateOrbit() {
        let newPosition = null;
        if (this.orbitElements) {
            const JD = this.timeManager.getJulianDate();
            const tSeconds = (JD - 2_451_545.0) * Constants.secondsInDay;
            newPosition = PhysicsUtils.getPositionAtTime(this.orbitElements, tSeconds);
            this.orbitGroup.position.copy(newPosition);
        } else if (this.orbitRadius > 0) {
            // Handle simple circular orbit (less common)
            const dayFrac = this.timeManager.dayOfYear + this.timeManager.fractionOfDay;
            const angle = (2 * Math.PI * dayFrac) / this.orbitalPeriod;
            newPosition = new THREE.Vector3(
                 this.orbitRadius * Math.cos(angle),
                 0, // Assuming orbit in XZ plane relative to parent
                 this.orbitRadius * Math.sin(angle)
             );
             this.orbitGroup.position.copy(newPosition);
        } else {
             // Body is likely stationary at the origin relative to its parent
             newPosition = this.orbitGroup.position; // Use current position (likely 0,0,0)
        }

        // Log the calculated position
        // if (newPosition && (!this._orbitLogCounter || this._orbitLogCounter % 60 === 0)) {
        //    console.log(`Planet [${this.name}] #updateOrbit: New world pos target`, newPosition.toArray().map(v => v.toFixed(2)));
        // }
        // this._orbitLogCounter = (this._orbitLogCounter || 0) + 1;
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
    getOrbitGroup() { return this.orbitGroup; }
    /** Get the underlying image (HTMLImageElement or Canvas) for the surface texture */
    getSurfaceTexture() {
        const mesh = this.planetMesh;
        let tex = null;

        // Function to get material from an object, handling LOD
        const getMaterial = (obj) => {
            if (obj instanceof THREE.LOD) {
                // Try to get from highest detail level first
                return obj.levels?.[0]?.object?.material;
            } else if (obj instanceof THREE.Mesh) {
                return obj.material;
            }
            return null;
        };

        const material = getMaterial(mesh);
        tex = material?.map;

        // Return the raw image (which may be an HTMLImageElement or HTMLCanvasElement)
        return tex?.image;
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
    /** Set visibility of the Sphere of Influence rim glow */
    setSOIVisible(v) { if (this.soiMesh) this.soiMesh.visible = v; }
    /** Set visibility of the Radial Grid */
    setRadialGridVisible(visible) {
        if (this.radialGrid) {
            this.radialGrid.setVisible(visible);
        }
    }

    /** Convert ECI to surface lat/lon */
    convertEciToGround(posEci) {
        const gmst = PhysicsUtils.calculateGMST(Date.now());
        const ecef = PhysicsUtils.eciToEcef(posEci, gmst);
        return PhysicsUtils.calculateIntersectionWithEarth(ecef);
    }

    /**
     * Calculate the rotation angle (around Y-axis) for a given Julian Date.
     * @param {number} JD - Julian Date.
     * @param {number} rotationPeriod - Sidereal rotation period in seconds.
     * @param {number} rotationOffset - Prime meridian offset in radians.
     * @returns {number} Rotation angle in radians.
     */
    static getRotationAngleAtTime(JD, rotationPeriod, rotationOffset = 0) {
        const secs = (JD - 2_451_545.0) * Constants.secondsInDay; // seconds since J2000
        return (2 * Math.PI * (secs / rotationPeriod % 1)) + rotationOffset;
    }

    /** Dispose of planet resources */
    dispose() {
        // Remove groups from scene
        if (this.orbitGroup.parent) this.orbitGroup.parent.remove(this.orbitGroup);
        if (this.orbitLine && this.orbitLine.parent) this.orbitLine.parent.remove(this.orbitLine);

        // Dispose geometries and materials within groups
        this.orbitGroup.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(mat => mat.dispose());
                } else {
                    object.material.dispose();
                }
                // Dispose textures associated with materials
                for (const key of Object.keys(object.material)) {
                    if (object.material[key] instanceof THREE.Texture) {
                        object.material[key].dispose();
                    }
                }
            }
        });

        // Dispose orbit line geometry/material
        if (this.orbitLine) {
            if (this.orbitLine.geometry) this.orbitLine.geometry.dispose();
            if (this.orbitLine.material) this.orbitLine.material.dispose();
        }

        // Dispose PlanetSurface if it exists
        if (this.surface && typeof this.surface.dispose === 'function') {
            this.surface.dispose();
        }

        // Dispose RadialGrid if it exists
        if (this.radialGrid && typeof this.radialGrid.dispose === 'function') {
            this.radialGrid.dispose();
        }

        // Remove instance from registry
        const index = Planet.instances.indexOf(this);
        if (index > -1) {
            Planet.instances.splice(index, 1);
        }

        console.log(`Planet [${this.name}] disposed.`);
    }
}
