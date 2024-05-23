// Earth.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { addLatitudeLines, addLongitudeLines, addCountryBorders, addCities, addStates } from './earthSurface.js';
import { Constants } from '../utils/Constants.js';
import atmosphereFragmentShader from '../../public/assets/shaders/atmosphereFragmentShader.glsl';
import atmosphereVertexShader from '../../public/assets/shaders/atmosphereVertexShader.glsl';

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
        this.addSurfaceDetails();
        this.initializePhysics(world);
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
            lightMapIntensity: -2.0
        });

        this.cloudMaterial = new THREE.MeshPhongMaterial({
            alphaMap: this.cloudTexture,
            bumpMap: this.cloudTexture,
            bumpScale: 0.05,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide,
        });

        this.atmosphereMaterial = new THREE.ShaderMaterial({
            vertexShader: atmosphereVertexShader,
            fragmentShader: atmosphereFragmentShader,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
            uniforms: {
                lightPosition: { value: new THREE.Vector3(1.0, 0.0, 0.0) },
                lightIntensity: { value: 4.0 },
                surfaceRadius: { value: this.EARTH_RADIUS },
                atmoRadius: { value: this.ATMOSPHERE_RADIUS },
                ambientIntensity: { value: 0.01 }
            }
        });
    }

    initializeMeshes() {
        const oblateness = 0.0033528;
        const scaledRadius = this.EARTH_RADIUS * (1 - oblateness);
        this.earthGeometry = new THREE.SphereGeometry(scaledRadius, this.MESH_RES, this.MESH_RES);
        this.earthMesh = new THREE.Mesh(this.earthGeometry, this.earthMaterial);
        this.rotationGroup.add(this.earthMesh);
        this.earthMesh.rotateY(1.5 * Math.PI);
        this.earthMesh.renderOrder = 1;
        this.earthMesh.castShadow = true;
        this.earthMesh.receiveShadow = true;

        const atmosphereGeometry = new THREE.SphereGeometry(this.ATMOSPHERE_RADIUS, this.MESH_RES, this.MESH_RES);
        this.atmosphereMesh = new THREE.Mesh(atmosphereGeometry, this.atmosphereMaterial);
        this.rotationGroup.add(this.atmosphereMesh);
        this.atmosphereMesh.renderOrder = 2;
        this.atmosphereMesh.castShadow = true;
        this.atmosphereMesh.receiveShadow = true;

        const cloudRadius = this.EARTH_RADIUS + 0.1;
        const cloudGeometry = new THREE.SphereGeometry(cloudRadius, this.MESH_RES, this.MESH_RES);
        this.cloudMesh = new THREE.Mesh(cloudGeometry, this.cloudMaterial);
        this.rotationGroup.add(this.cloudMesh);
        this.cloudMesh.renderOrder = 3;
        this.cloudMesh.rotateY(1.5 * Math.PI);
    }

    addSurfaceDetails() {
        addLatitudeLines(this.earthMesh, this.EARTH_RADIUS);
        addLongitudeLines(this.earthMesh, this.EARTH_RADIUS);
        addCountryBorders(this.earthMesh, this.EARTH_RADIUS);
        addCities(this.earthMesh, this.EARTH_RADIUS);
        addStates(this.earthMesh, this.EARTH_RADIUS);
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
}
