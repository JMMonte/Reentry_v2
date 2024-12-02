import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EarthSurface } from './EarthSurface.js';
import { Constants } from '../utils/Constants.js';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import atmosphereFragmentShader from '../../public/assets/shaders/atmosphereFragmentShader.glsl';
import atmosphereVertexShader from '../../public/assets/shaders/atmosphereVertexShader.glsl';
import geojsonDataCities from '../config/ne_110m_populated_places.json';
import geojsonDataAirports from '../config/ne_10m_airports.json';
import geojsonDataSpaceports from '../config/spaceports.json';
import geojsonDataGroundStations from '../config/ground_stations.json';
import geojsonDataObservatories from '../config/observatories.json';

export class Earth {
    constructor(scene, world, renderer, timeManager, textureManager) {
        this.timeManager = timeManager;
        this.MESH_RES = 128;
        this.EARTH_RADIUS = Constants.earthRadius * Constants.scale * Constants.metersToKm;
        this.ATMOSPHERE_RADIUS = this.EARTH_RADIUS + 4;
        this.SIDEREAL_DAY_IN_SECONDS = 86164;
        this.DAYS_IN_YEAR = 365.25;
        this.EARTH_MASS = Constants.earthMass;
        this.renderer = renderer;
        this.scene = scene;
        this.textureManager = textureManager;
        this.initializeGroups(scene);
        this.initializeMaterials();
        this.initializeMeshes();
        this.initializeSurfaceDetails(); // Modified method name
        this.initializePhysics(world);

        // Add light source to simulate Earth's illumination
        this.addLightSource();
    }

    initializeGroups(scene) {
        this.tiltGroup = new THREE.Group();
        this.rotationGroup = new THREE.Group();
        this.tiltGroup.add(this.rotationGroup);
        scene.add(this.tiltGroup);
        this.tiltGroup.rotation.x = THREE.MathUtils.degToRad(23.5);
    }

    initializeMaterials() {
        const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

        const earthTextureMap = this.textureManager.getTexture('earthTexture');
        earthTextureMap.anisotropy = maxAnisotropy;

        this.cloudTexture = this.textureManager.getTexture('cloudTexture');
        this.cloudTexture.anisotropy = maxAnisotropy;
        this.cloudTexture.transparent = true;

        this.earthMaterial = new THREE.MeshPhongMaterial({
            map: earthTextureMap,
            specularMap: this.textureManager.getTexture('earthSpecTexture'),
            specular: 0xffffff,
            shininess: 40.0,
            normalMap: this.textureManager.getTexture('earthNormalTexture'),
            normalScale: new THREE.Vector2(5.0, 5.0),
            lightMap: this.cloudTexture,
            lightMapIntensity: -2.0,
            depthWrite: true
        });

        this.cloudMaterial = new THREE.MeshPhongMaterial({
            alphaMap: this.cloudTexture,
            bumpMap: this.cloudTexture,
            bumpScale: 0.05,
            transparent: true,
            opacity: 1.0,
            side: THREE.FrontSide,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            depthWrite: false,
            depthTest: true
        });

        this.atmosphereMaterial = new THREE.ShaderMaterial({
            vertexShader: atmosphereVertexShader,
            fragmentShader: atmosphereFragmentShader,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            uniforms: {
                lightPosition: { value: new THREE.Vector3(1.0, 0.0, 0.0) },
                lightIntensity: { value: 4.0 },
                surfaceRadius: { value: this.EARTH_RADIUS },
                atmoRadius: { value: this.EARTH_RADIUS + 3 },
                ambientIntensity: { value: 0.0 }
            }
        });
    }

    initializeMeshes() {
        const oblateness = 0.0033528;
        const scaledRadius = this.EARTH_RADIUS * (1 - oblateness);
        this.earthGeometry = new THREE.SphereGeometry(scaledRadius, this.MESH_RES, this.MESH_RES);
        this.earthMesh = new THREE.Mesh(this.earthGeometry, this.earthMaterial);
        
        const atmosphereGeometry = new THREE.SphereGeometry(this.ATMOSPHERE_RADIUS, this.MESH_RES, this.MESH_RES);
        this.atmosphereMesh = new THREE.Mesh(atmosphereGeometry, this.atmosphereMaterial);
        
        const cloudRadius = this.EARTH_RADIUS + 0.1;
        const cloudGeometry = new THREE.SphereGeometry(cloudRadius, this.MESH_RES, this.MESH_RES);
        this.cloudMesh = new THREE.Mesh(cloudGeometry, this.cloudMaterial);

        // Set render order
        this.atmosphereMesh.renderOrder = -1;  // Render atmosphere first
        this.earthMesh.renderOrder = 0;        // Then Earth
        this.cloudMesh.renderOrder = 1;        // Then clouds

        this.rotationGroup.add(this.atmosphereMesh);
        this.rotationGroup.add(this.earthMesh);
        this.rotationGroup.add(this.cloudMesh);
        
        this.earthMesh.rotateY(1.5 * Math.PI);
        this.cloudMesh.rotateY(1.5 * Math.PI);
    }

    initializeSurfaceDetails() {
        this.earthSurface = new EarthSurface(this.earthMesh, this.EARTH_RADIUS);
        this.earthSurface.addLatitudeLines();
        this.earthSurface.addLongitudeLines();
        this.earthSurface.addCountryBorders();
        this.earthSurface.addStates();
        this.earthSurface.addPoints(geojsonDataCities, this.earthSurface.materials.cityPoint, 'cities');
        this.earthSurface.addPoints(geojsonDataAirports, this.earthSurface.materials.airportPoint, 'airports');
        this.earthSurface.addPoints(geojsonDataSpaceports, this.earthSurface.materials.spaceportPoint, 'spaceports');
        this.earthSurface.addPoints(geojsonDataGroundStations, this.earthSurface.materials.groundStationPoint, 'groundStations');
        this.earthSurface.addPoints(geojsonDataObservatories, this.earthSurface.materials.observatoryPoint, 'observatories');
    }

    initializePhysics(world) {
        const earthBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Sphere((Constants.earthRadius)),
            material: new CANNON.Material(),
            friction: 0.5
        });
        world.addBody(earthBody);
        this.earthBody = earthBody;
    }

    addLightSource() {
        const light = new THREE.PointLight(0x87ceeb, 1e8, Constants.moonOrbitRadius * 2); // Sky blue light, intensity 1, distance twice the Moon's orbit radius
        light.position.set(0, 0, 0); // Center of the Earth
        light.decay = 2; // Physical decay factor

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
}
