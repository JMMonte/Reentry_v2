import * as THREE from 'three';
import { EarthSurface } from './earthSurface.js';
import { Constants } from '../utils/Constants.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { createEarthMaterial, createCloudMaterial, createAtmosphereMaterial, createGlowMaterial } from './EarthMaterials.js';
import geojsonDataCities from '../config/ne_110m_populated_places.json';
import geojsonDataAirports from '../config/ne_10m_airports.json';
import geojsonDataSpaceports from '../config/spaceports.json';
import geojsonDataGroundStations from '../config/ground_stations.json';
import geojsonDataObservatories from '../config/observatories.json';

export class Earth {
    constructor(scene, renderer, timeManager, textureManager) {
        this.timeManager = timeManager;
        this.MESH_RES = 64; // base resolution for planet
        this.ATMOSPHERE_RES = 64; // further reduced resolution for atmosphere
        this.CLOUD_RES = 64; // further reduced resolution for cloud layer
        this.EARTH_RADIUS = Constants.earthRadius * Constants.scale * Constants.metersToKm;
        this.ATMOSPHERE_RADIUS = this.EARTH_RADIUS + 5;
        this.SIDEREAL_DAY_IN_SECONDS = 86164;
        this.DAYS_IN_YEAR = 365.25;
        this.EARTH_MASS = Constants.earthMass;
        this.renderer = renderer;
        // Configurable atmosphere parameters
        this.atmosphereHeight = 3;            // thickness in units
        this.atmosphereDensityScale = 1.0;    // scattering density multiplier
        this.atmoColorNear = new THREE.Color(1.0, 0.8, 0.6);
        this.atmoColorFar = new THREE.Color(1.0, 1.0, 1.0);
        this.scene = scene;
        this.textureManager = textureManager;
        this.initializeGroups(scene);
        this.initializeMaterials();
        this.initializeMeshes();
        this.initializeSurfaceDetails(); // Modified method name

        // Add light source to simulate Earth's illumination
        this.addLightSource();
    }

    initializeGroups(scene) {
        this.tiltGroup = new THREE.Group();
        this.rotationGroup = new THREE.Group();
        this.tiltGroup.add(this.rotationGroup);
        scene.add(this.tiltGroup);
        // Apply Earth's axial tilt around Z axis to align equatorial plane
        this.tiltGroup.rotation.z = THREE.MathUtils.degToRad(Constants.earthInclination);
    }

    initializeMaterials() {
        const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
        // Create and assign reusable materials from EarthMaterials
        this.cloudMaterial = createCloudMaterial(this.textureManager, maxAnisotropy);
        this.earthMaterial = createEarthMaterial(this.textureManager, maxAnisotropy);
        // Atmosphere with configurable options
        this.atmosphereMaterial = createAtmosphereMaterial(this.EARTH_RADIUS, {
            atmoHeight: this.atmosphereHeight,
            densityScale: this.atmosphereDensityScale,
            colorNear: this.atmoColorNear,
            colorFar: this.atmoColorFar
        });
        this.glowMaterial = createGlowMaterial();
    }

    initializeMeshes() {
        const oblateness = 0.0033528;
        const scaledRadius = this.EARTH_RADIUS * (1 - oblateness);
        this.earthGeometry = new THREE.SphereGeometry(scaledRadius, this.MESH_RES, this.MESH_RES);
        this.earthMesh = new THREE.Mesh(this.earthGeometry, this.earthMaterial);

        const atmosphereGeometry = new THREE.SphereGeometry(this.ATMOSPHERE_RADIUS, this.ATMOSPHERE_RES, this.ATMOSPHERE_RES);
        this.atmosphereMesh = new THREE.Mesh(atmosphereGeometry, this.atmosphereMaterial);

        // Rim glow layer (thicker)
        const glowRadius = this.EARTH_RADIUS * 1.01;
        const glowGeometry = new THREE.SphereGeometry(glowRadius, this.MESH_RES, this.MESH_RES);
        this.glowMesh = new THREE.Mesh(glowGeometry, this.glowMaterial);
        this.glowMesh.renderOrder = 2;  // draw after clouds and atmosphere so haze shows through

        const cloudRadius = this.EARTH_RADIUS + 0.1;
        const cloudGeometry = new THREE.SphereGeometry(cloudRadius, this.CLOUD_RES, this.CLOUD_RES);
        this.cloudMesh = new THREE.Mesh(cloudGeometry, this.cloudMaterial);

        // Set render order: atmosphere first, then Earth, then clouds
        this.atmosphereMesh.renderOrder = -1;  // Atmosphere first (behind Earth geometry)
        this.earthMesh.renderOrder = 0;        // Then Earth
        this.cloudMesh.renderOrder = 1;        // Then clouds
        this.glowMesh.rotateY(1.5 * Math.PI);

        this.rotationGroup.add(this.atmosphereMesh);
        this.rotationGroup.add(this.earthMesh);
        this.rotationGroup.add(this.cloudMesh);
        this.rotationGroup.add(this.glowMesh);

        this.earthMesh.rotateY(1.5 * Math.PI);
        this.cloudMesh.rotateY(1.5 * Math.PI);
    }

    initializeSurfaceDetails() {
        this.earthSurface = new EarthSurface(this.earthMesh, this.EARTH_RADIUS);
        this.earthSurface.addLatitudeLines();
        this.earthSurface.addLongitudeLines();
        this.earthSurface.addCountryBorders();
        this.earthSurface.addStates();
        this.earthSurface.addInstancedPoints(geojsonDataCities, this.earthSurface.materials.cityPoint, 'cities');
        this.earthSurface.addInstancedPoints(geojsonDataAirports, this.earthSurface.materials.airportPoint, 'airports');
        this.earthSurface.addInstancedPoints(geojsonDataSpaceports, this.earthSurface.materials.spaceportPoint, 'spaceports');
        this.earthSurface.addInstancedPoints(geojsonDataGroundStations, this.earthSurface.materials.groundStationPoint, 'groundStations');
        this.earthSurface.addInstancedPoints(geojsonDataObservatories, this.earthSurface.materials.observatoryPoint, 'observatories');
    }

    addLightSource() {
        const light = new THREE.PointLight(0x87ceeb, 1e8, Constants.moonOrbitRadius * 1); // Sky blue light, intensity 1, distance twice the Moon's orbit radius
        light.position.set(0, 0, 0); // Center of the Earth
        light.decay = 1.9; // Physical decay factor

        this.earthMesh.add(light);

        const lightHelper = new THREE.PointLightHelper(light, 5); // Optional: visualize the light source position
        this.scene.add(lightHelper);
    }

    updateRotation() {
        const totalRotation = 2 * Math.PI * (this.timeManager.fractionOfDay + (this.timeManager.dayOfYear / 365.25));
        this.rotationGroup.rotation.y = totalRotation;
    }

    updateLightDirection() {
        const sunPosition = this.timeManager.getSunPosition();
        this.atmosphereMaterial.uniforms.lightPosition.value.set(sunPosition.x, sunPosition.y, sunPosition.z);
        // Update glow nightside mask direction
        const sunDir = new THREE.Vector3(sunPosition.x, sunPosition.y, sunPosition.z).normalize();
        this.glowMaterial.uniforms.sunDirection.value.copy(sunDir);
    }

    getGreenwichPosition() {
        return this.timeManager.getGreenwichPosition();
    }

    setSurfaceLinesVisible(visible) {
        this.earthSurface.setSurfaceLinesVisible(visible);
    }

    setCitiesVisible(visible) {
        this.earthSurface.setCitiesVisible(visible);
    }

    setStatesVisible(visible) {
        this.earthSurface.setStatesVisible(visible);
    }

    setAirportsVisible(visible) {
        this.earthSurface.setAirportsVisible(visible);
    }

    setSpaceportsVisible(visible) {
        this.earthSurface.setSpaceportsVisible(visible);
    }

    setCountryBordersVisible(visible) {
        this.earthSurface.setCountryBordersVisible(visible);
    }

    setGroundStationsVisible(visible) {
        this.earthSurface.setGroundStationsVisible(visible);
    }
    setObservatoriesVisible(visible) {
        this.earthSurface.setObservatoriesVisible(visible);
    }

    getMesh() {
        return this.earthMesh;
    }

    addImpactPoint(position) {
        const impactMaterial = new THREE.PointsMaterial({
            color: 0xff0000,
            size: 5,
            opacity: 0.8,
            transparent: true,
        });

        const impactGeometry = new THREE.BufferGeometry();
        impactGeometry.setAttribute('position', new THREE.Float32BufferAttribute([position.x, position.y, position.z], 3));

        const impactPoint = new THREE.Points(impactGeometry, impactMaterial);
        this.rotationGroup.add(impactPoint);
    }

    convertEciToGround(positionECI) {
        const gmst = PhysicsUtils.calculateGMST(Date.now());
        const positionECEF = PhysicsUtils.eciToEcef(positionECI, gmst);
        const intersection = PhysicsUtils.calculateIntersectionWithEarth(positionECEF);
        return intersection;
    }

    getTiltGroup() {
        return this.tiltGroup;
    }

    // Update atmosphere uniforms when properties change
    updateAtmosphereUniforms() {
        const atmoRadius = this.EARTH_RADIUS + this.atmosphereHeight;
        const u = this.atmosphereMaterial.uniforms;
        u.atmoRadius.value = atmoRadius;
        u.densityScale.value = this.atmosphereDensityScale;
        u.atmoColorNear.value.copy(this.atmoColorNear);
        u.atmoColorFar.value.copy(this.atmoColorFar);
    }

    // Setters for atmosphere parameters
    setAtmosphereHeight(height) {
        this.atmosphereHeight = height;
        this.updateAtmosphereUniforms();
    }

    setAtmosphereDensity(scale) {
        this.atmosphereDensityScale = scale;
        this.updateAtmosphereUniforms();
    }

    setAtmosphereColors(nearColor, farColor) {
        this.atmoColorNear.copy(nearColor);
        this.atmoColorFar.copy(farColor);
        this.updateAtmosphereUniforms();
    }
}
