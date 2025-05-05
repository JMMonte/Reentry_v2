/* Planet.js */
import * as THREE from 'three';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { Constants } from '../utils/Constants.js';
import { PlanetSurface } from './PlanetSurface.js';
import { PlanetMaterials } from './PlanetMaterials.js';
import { RadialGrid } from './RadialGrid.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { celestialBodiesConfig } from '../config/celestialBodiesConfig.js';

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
            atmosphereThickness = 0, cloudThickness = 0,
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
        this.atmosphereThickness = atmosphereThickness;
        this.cloudThickness = cloudThickness;
        this.orbitElements = orbitElements;

        this.lodLevels = lodLevels;
        this.dotPixelSizeThreshold = dotPixelSizeThreshold;
        this.dotColor = dotColor;
        this.soiRadius = radius * soiRadius;

        Planet.instances.push(this);

        /* ---------- materials ---------- */
        this.materials = new PlanetMaterials(
            this.textureManager,
            this.renderer.capabilities,
            materialOverrides
        );

        /* ---------- build ---------- */
        this.#initGroups();
        this.#initMaterials();
        this.#initMeshes();
        this.#initDistantMesh();
        if (this.soiRadius > 0) this.#initSoiMesh();

        /* ---------- optional surface ---------- */
        if (addSurface) {
            const polarScale = 1 - this.oblateness;
            const surfaceOpts = { ...surfaceOptions, polarScale };
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
            this.#initRings(ringConfig);
        }

        // Special case: if this is the EMB, add a visible marker
        if (name && name.toLowerCase() === 'emb') {
            this.marker = new THREE.Mesh(
                new THREE.SphereGeometry(1000, 16, 16), // Small sphere
                new THREE.MeshBasicMaterial({ color: 0xff00ff })
            );
            this.unrotatedGroup = new THREE.Group();
            this.unrotatedGroup.add(this.marker);
            this.scene.add(this.unrotatedGroup);
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

        this.glowMaterial = this.materials.getGlowMaterial(this.radius, { atmoHeight: this.atmosphereThickness });

        if (this.glowMaterial?.uniforms)
            this.glowMaterial.uniforms.planetFrame = { value: new THREE.Matrix3() };
    }

    #initMeshes() {
        const equR = this.radius;
        const polR = this.radius * (1 - this.oblateness);

        // Define yScale helper first
        const yScale = (p, e) => p / e;

        const equCloud = equR + this.cloudThickness;
        const polCloud = polR + this.cloudThickness;

        const coreY = yScale(polR, equR);
        const cloudY = yScale(polCloud, equCloud);

        /* ----- core ----- */
        if (this.lodLevels?.length) {
            this.planetLOD = new THREE.LOD();
            for (const { meshRes, distance } of this.lodLevels) {
                const m = new THREE.Mesh(
                    new THREE.SphereGeometry(equR, meshRes, meshRes),
                    this.surfaceMaterial
                );
                m.scale.set(1, coreY, 1);
                this.planetLOD.addLevel(m, distance);
            }
            this.rotationGroup.add(this.planetLOD);
            this.planetMesh = this.planetLOD;
        } else {
            this.planetMesh = new THREE.Mesh(
                new THREE.SphereGeometry(equR, this.meshRes, this.meshRes),
                this.surfaceMaterial
            );
            this.planetMesh.scale.set(1, coreY, 1);
            this.rotationGroup.add(this.planetMesh);
        }

        /* ----- clouds ----- */
        if (this.cloudMaterial) {
            const make = (res) =>
                new THREE.Mesh(new THREE.SphereGeometry(equCloud, res, res), this.cloudMaterial);
            if (this.lodLevels?.length) {
                this.cloudLOD = new THREE.LOD();
                for (const { meshRes, distance } of this.lodLevels) {
                    const m = make(meshRes);
                    m.scale.set(1, cloudY, 1);
                    m.renderOrder = 1;
                    this.cloudLOD.addLevel(m, distance);
                }
                this.rotationGroup.add(this.cloudLOD);
                this.cloudMesh = this.cloudLOD;
            } else {
                this.cloudMesh = make(this.cloudRes);
                this.cloudMesh.scale.set(1, cloudY, 1);
                this.cloudMesh.renderOrder = 1;
                this.rotationGroup.add(this.cloudMesh);
            }
        }

        /* ----- rings ----- */
        if (this.addRings && this.ringConfig) {
            this.#initRings(this.ringConfig);
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

    #initDistantMesh() {
        const geo = new THREE.SphereGeometry(1, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: this.dotColor, transparent: true, opacity: 0.7 });
        this.distantMesh = new THREE.Mesh(geo, mat);
        this.distantMesh.visible = false;
        this.orbitGroup.add(this.distantMesh);
    }

    #initSoiMesh() {
        if (!this.materials.getSOIMaterial) return;
        const geo = new THREE.SphereGeometry(this.soiRadius, 64, 32);
        const mat = this.materials.getSOIMaterial();
        if (!mat) return;
        this.soiMesh = new THREE.Mesh(geo, mat);
        this.soiMesh.renderOrder = -1;
        this.tiltGroup.add(this.soiMesh);
    }

    #initRings({ innerRadius, outerRadius, textureKey, resolution = 128 }) {
        const ringTexture = this.textureManager.getTexture(textureKey);
        if (!ringTexture) {
            console.warn(`Ring texture '${textureKey}' not found for planet ${this.name}`);
            return;
        }

        // Geometry: A flat ring
        const geometry = new THREE.RingGeometry(
            innerRadius,
            outerRadius,
            resolution,
            1, // thetaSegments
            0, // thetaStart
            Math.PI * 2
        );

        // Adjust UVs: Map texture radially
        // u = (radius - innerRadius) / (outerRadius - innerRadius)
        // v = angle / (2*PI)
        const pos = geometry.attributes.position;
        const uvs = geometry.attributes.uv;
        const ringSpan = outerRadius - innerRadius;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const radius = Math.sqrt(x * x + y * y);
            const angle = Math.atan2(y, x);

            uvs.setX(i, (radius - innerRadius) / ringSpan);
            uvs.setY(i, (angle / (Math.PI * 2)) + 0.5); // Map angle to V (0 to 1)
        }

        // Material
        const material = new THREE.MeshPhongMaterial({
            map: ringTexture,
            alphaMap: ringTexture, // Use same texture for alpha
            alphaTest: 0.01,     // Discard pixels with alpha below this threshold
            side: THREE.DoubleSide,
            transparent: false, // Make opaque by default
            depthWrite: true,
            shininess: 15,      // Slightly increased shininess
            specular: 0x333333, // Slightly brighter specular highlights
            emissive: 0x222222, // Add a faint emissive glow
            emissiveIntensity: 0.5 // Intensity of the glow
        });

        this.ringMesh = new THREE.Mesh(geometry, material);
        // Rings lie in the XY plane locally and rotate with tilt, not spin
        this.ringMesh.rotation.x = Math.PI / 2; // Rotate plane to be horizontal
        this.tiltGroup.add(this.ringMesh);
    }

    /* ===== per-frame ===== */
    update() {
        this.#updateRotation();
        // Update EMB marker position if this is EMB
        if (this.name && this.name.toLowerCase() === 'emb' && this.marker && window.Astronomy) {
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

        if (Planet.camera && this.distantMesh) {
            const planetPos = new THREE.Vector3();
            this.planetMesh.getWorldPosition(planetPos);
            const camPos = Planet.camera.position;
            const dist = planetPos.distanceTo(camPos);
            const fovY = THREE.MathUtils.degToRad(Planet.camera.fov);
            const scrH = window.innerHeight;
            const pix = (2 * Math.atan(this.radius / dist) / fovY) * scrH;

            if (pix < this.dotPixelSizeThreshold) {
                this.distantMesh.visible = true;
                this.planetMesh.visible = false;
                // TEMPORARILY DISABLED Cloud Layer Visibility Update
                // this.cloudMesh && (this.cloudMesh.visible = false);
                this.glowMesh && (this.glowMesh.visible = false);

                const ang = (this.dotPixelSizeThreshold / scrH) * fovY;
                this.distantMesh.scale.setScalar(Math.tan(ang / 2) * dist);
            } else {
                this.distantMesh.visible = false;
                this.planetMesh.visible = true;
                // TEMPORARILY DISABLED Cloud Layer Visibility Update
                // this.cloudMesh && (this.cloudMesh.visible = true);
                this.glowMesh && (this.glowMesh.visible = true);
                this.planetLOD && this.planetLOD.update(Planet.camera);
            }
        }

        // Update surface/grid fading
        this.surface && Planet.camera && this.surface.updateFade(Planet.camera);

        /* LOD -> dot switch etc. */
    }

    updateAxisHelperPosition() {
        if (this._axisHelper && this._axisHelper.visible) {
            const worldPos = new THREE.Vector3();
            this.getOrbitGroup().getWorldPosition(worldPos);
            this._axisHelper.position.copy(worldPos);
        }
    }

    #updateRotation() {
        const JD = this.timeManager.getJulianDate();
        const secs = (JD - 2451545.0) * Constants.secondsInDay;
        this.rotationGroup.rotation.y =
            (2 * Math.PI * (secs / this.rotationPeriod % 1)) + this.rotationOffset;
    }

    /** Update shader uniforms based on current world state. Call AFTER final position sync. */
    updateShaderUniforms() {
        if (this.glowMaterial?.uniforms?.planetFrame) {
            const worldOrientation = new THREE.Quaternion();
            const groupToUse = this.rotationGroup;
            groupToUse.getWorldQuaternion(worldOrientation);
            const invRotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(worldOrientation).invert();
            const planetFrameMatrix = new THREE.Matrix3().setFromMatrix4(invRotationMatrix);

            if (this.glowMaterial?.uniforms?.planetFrame) {
                this.glowMaterial.uniforms.planetFrame.value.copy(planetFrameMatrix);
            }
        }

        // Update planetPosition world uniform
        if (this.glowMaterial?.uniforms?.planetPosition) {
            const worldPos = new THREE.Vector3();
            const planetMeshToUse = this.planetLOD || this.planetMesh;
            planetMeshToUse.getWorldPosition(worldPos);
            this.glowMaterial.uniforms.planetPosition.value.copy(worldPos);
        }

        this.#updateLightDirection();
    }

    #updateLightDirection() {
        let sunPos = null;
        if (window.app3d?.physicsWorld) {
            const sunBody = window.app3d.physicsWorld.bodies.find(b => b.name.toLowerCase() === 'sun');
            if (sunBody) sunPos = sunBody.position;
        }
        if (sunPos) {
            this.glowMaterial?.uniforms?.lightPosition.value.copy(sunPos);
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
    setSOIVisible(v) { this.soiMesh && (this.soiMesh.visible = v); }
    setRadialGridVisible(v) { this.radialGrid?.setVisible(v); }
    setRingsVisible(v) { this.ringMesh && (this.ringMesh.visible = v); }

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
        this.ringMesh?.geometry?.dispose();
        this.ringMesh?.material?.dispose();
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
