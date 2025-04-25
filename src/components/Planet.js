import * as THREE from 'three';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { PlanetSurface } from './PlanetSurface.js';
import { PlanetMaterials } from './PlanetMaterials.js';

export class Planet {
    constructor(scene, renderer, timeManager, textureManager, config) {
        this.scene = scene;
        this.renderer = renderer;
        this.timeManager = timeManager;
        this.textureManager = textureManager;
        this.config = config;
        // Setup material manager per planet configuration
        this.materials = new PlanetMaterials(
            this.textureManager,
            this.renderer.capabilities,
            this.config.materials || {}
        );

        // Core properties
        this.radius = config.radius;
        this.oblateness = config.oblateness || 0;
        this.rotationPeriod = config.rotationPeriod || 86400;
        this.orbitalPeriod = config.orbitalPeriod || 365.25;
        this.tilt = config.tilt || 0;
        this.meshRes = config.meshRes || 64;
        this.atmosphereRes = config.atmosphereRes || 64;
        this.cloudRes = config.cloudRes || 64;
        this.atmosphereThickness = config.atmosphereThickness || 0;
        this.cloudThickness = config.cloudThickness || 0;

        // Build the planet
        this.initializeGroups();
        this.initializeMaterials();
        this.initializeMeshes();

        // Optional surface features
        if (config.addSurface) {
            this.surface = new PlanetSurface(
                this.planetMesh,
                this.radius,
                config.primaryGeojsonData,
                config.stateGeojsonData,
                config.surfaceOptions
            );
            this.addSurfaceDetails(config);
        }

        // Optional light
        if (config.addLight) {
            this.addLightSource(config.lightOptions);
        }
    }

    initializeGroups() {
        this.tiltGroup = new THREE.Group();
        this.rotationGroup = new THREE.Group();
        this.tiltGroup.add(this.rotationGroup);
        this.scene.add(this.tiltGroup);
        this.tiltGroup.rotation.z = THREE.MathUtils.degToRad(this.tilt);
    }

    initializeMaterials() {
        // Use PlanetMaterials manager to create all materials
        this.surfaceMaterial = this.materials.getSurfaceMaterial();
        this.cloudMaterial = this.materials.getCloudMaterial();
        if (this.atmosphereThickness > 0) {
            this.atmosphereMaterial = this.materials.getAtmosphereMaterial(this.radius);
        }
        this.glowMaterial = this.materials.getGlowMaterial();
    }

    initializeMeshes() {
        const scaledRadius = this.radius * (1 - this.oblateness);
        this.planetGeometry = new THREE.SphereGeometry(scaledRadius, this.meshRes, this.meshRes);
        this.planetMesh = new THREE.Mesh(this.planetGeometry, this.surfaceMaterial);
        this.planetMesh.renderOrder = 0;
        this.rotationGroup.add(this.planetMesh);

        if (this.atmosphereThickness > 0) {
            const atmoRadius = this.radius + this.atmosphereThickness;
            const atmoGeo = new THREE.SphereGeometry(atmoRadius, this.atmosphereRes, this.atmosphereRes);
            this.atmosphereMesh = new THREE.Mesh(atmoGeo, this.atmosphereMaterial);
            this.atmosphereMesh.renderOrder = -1;
            this.rotationGroup.add(this.atmosphereMesh);
        }

        if (this.cloudMaterial) {
            const cloudRadius = this.radius + this.cloudThickness;
            const cloudGeo = new THREE.SphereGeometry(cloudRadius, this.cloudRes, this.cloudRes);
            this.cloudMesh = new THREE.Mesh(cloudGeo, this.cloudMaterial);
            this.cloudMesh.renderOrder = 1;
            this.rotationGroup.add(this.cloudMesh);
        }

        // Glow layer
        if (this.glowMaterial) {
            const { scale, renderOrder } = this.materials.getGlowParameters();
            const glowRadius = this.radius * (1 + scale);
            const glowGeo = new THREE.SphereGeometry(glowRadius, this.meshRes, this.meshRes);
            this.glowMesh = new THREE.Mesh(glowGeo, this.glowMaterial);
            this.glowMesh.renderOrder = renderOrder;
            this.rotationGroup.add(this.glowMesh);
        }

        // align meshes
        this.rotationGroup.children.forEach(mesh => mesh.rotateY(1.5 * Math.PI));
    }

    addSurfaceDetails(config) {
        const opts = (config.surfaceOptions || {});
        if (opts.addLatitudeLines) this.surface.addLatitudeLines(opts.latitudeStep || 10);
        if (opts.addLongitudeLines) this.surface.addLongitudeLines(opts.longitudeStep || 10);
        if (opts.addCountryBorders) this.surface.addCountryBorders();
        if (opts.addStates) this.surface.addStates();
        if (opts.addCities && config.cityData) this.surface.addInstancedPoints(config.cityData, this.surface.materials.cityPoint, 'cities');
        if (opts.addAirports && config.airportsData) this.surface.addInstancedPoints(config.airportsData, this.surface.materials.airportPoint, 'airports');
        if (opts.addSpaceports && config.spaceportsData) this.surface.addInstancedPoints(config.spaceportsData, this.surface.materials.spaceportPoint, 'spaceports');
        if (opts.addGroundStations && config.groundStationsData) this.surface.addInstancedPoints(config.groundStationsData, this.surface.materials.groundStationPoint, 'groundStations');
        if (opts.addObservatories && config.observatoriesData) this.surface.addInstancedPoints(config.observatoriesData, this.surface.materials.observatoryPoint, 'observatories');
    }

    addLightSource(opts = {}) {
        const color = opts.color || 0xffffff;
        const intensity = opts.intensity || 1;
        const distance = opts.distance;
        const decay = opts.decay || 1;
        const light = new THREE.PointLight(color, intensity, distance);
        light.position.set(0, 0, 0);
        light.decay = decay;
        this.planetMesh.add(light);
        if (opts.helper) {
            const helper = new THREE.PointLightHelper(light, opts.helperSize || 5);
            this.scene.add(helper);
        }
    }

    updateRotation() {
        const totalRot = 2 * Math.PI * (this.timeManager.fractionOfDay + (this.timeManager.dayOfYear / this.orbitalPeriod));
        this.rotationGroup.rotation.y = totalRot;
    }

    updateLightDirection() {
        const sun = this.timeManager.getSunPosition();
        if (this.atmosphereMaterial) {
            this.atmosphereMaterial.uniforms.lightPosition.value.set(sun.x, sun.y, sun.z);
        }
        if (this.glowMaterial && this.glowMaterial.uniforms.sunDirection) {
            const sunDir = new THREE.Vector3(sun.x, sun.y, sun.z).normalize();
            this.glowMaterial.uniforms.sunDirection.value.copy(sunDir);
        }
    }

    convertEciToGround(positionECI) {
        const gmst = PhysicsUtils.calculateGMST(Date.now());
        const ecef = PhysicsUtils.eciToEcef(positionECI, gmst);
        return PhysicsUtils.calculateIntersectionWithEarth(ecef);
    }

    getTiltGroup() {
        return this.tiltGroup;
    }

    getMesh() {
        return this.planetMesh;
    }

    // Add an update method for simulation loop integration
    update() {
        this.updateRotation();
        this.updateLightDirection();
    }
} 