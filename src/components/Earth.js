import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { addLatitudeLines, addLongitudeLines, addCountryBorders, addCities, addStates } from './earthSurface.js';
import earthTexture from '../../public/assets/texture/8k_earth_daymap.jpg';
import earthSpecTexture from '../../public/assets/texture/8k_earth_specular_map.png';
import earthNormalTexture from '../../public/assets/texture/8k_earth_normal_map.png';
import cloudTexture from '../../public/assets/texture/cloud_combined_8192.png'; // Import the local cloud texture
import { Constants } from '../utils/Constants.js';

// Import the atmosphere shaders
import atmosphereFragmentShader from '../../public/assets/shaders/atmosphereFragmentShader.glsl';
import atmosphereVertexShader from '../../public/assets/shaders/atmosphereVertexShader.glsl';

export class Earth {
    constructor(scene, world, renderer, timeManager) {
        this.timeManager = timeManager;
        this.MESH_RES = 128;
        this.EARTH_RADIUS = Constants.earthRadius * Constants.scale * Constants.metersToKm; // Radius in Three.js units (scaled km)
        this.ATMOSPHERE_RADIUS = this.EARTH_RADIUS + 4; // Slightly larger to prevent z-fighting (scaled to 40000km / 10)
        this.SIDEREAL_DAY_IN_SECONDS = 86164;
        this.DAYS_IN_YEAR = 365.25;
        this.EARTH_MASS = Constants.earthMass; // Mass in kg
        this.renderer = renderer;
        this.scene = scene;
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
        const textureLoader = new THREE.TextureLoader();
        const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

        const earthTextureMap = textureLoader.load(earthTexture, texture => {
            texture.anisotropy = maxAnisotropy;
        });

        this.cloudTexture = textureLoader.load(cloudTexture, texture => {
            texture.anisotropy = maxAnisotropy;
            texture.transparent = true;
        });

        this.earthMaterial = new THREE.MeshPhongMaterial({
            map: earthTextureMap,
            specularMap: textureLoader.load(earthSpecTexture),
            specular: 0xffffff,   
            shininess: 40.0, // water is shiny
            normalMap: textureLoader.load(earthNormalTexture),
            normalScale: new THREE.Vector2(5.0,5.0),
            lightMap: this.cloudTexture,
            lightMapIntensity: -2.0  // turn the clouds into ground shadows
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

            depthWrite: false,  // Ensure the atmosphere doesn't write to the depth buffer
            depthTest: true,    // Ensure depth testing is enabled
            blending: THREE.AdditiveBlending,

            uniforms: {
                lightPosition: { value: new THREE.Vector3(1.0, 0.0, 0.0) }, // Placeholder value
                lightIntensity: { value: 4.0 },
                surfaceRadius: { value: this.EARTH_RADIUS },
                atmoRadius: { value: this.ATMOSPHERE_RADIUS },
                ambientIntensity: { value: 0.01 }
            }
        });
    }

    initializeMeshes() {
        const oblateness = 0.0033528; // Earth's oblateness factor
        const scaledRadius = this.EARTH_RADIUS * (1 - oblateness);
        this.earthGeometry = new THREE.SphereGeometry(scaledRadius, this.MESH_RES, this.MESH_RES);
        this.earthMesh = new THREE.Mesh(this.earthGeometry, this.earthMaterial);
        this.rotationGroup.add(this.earthMesh);
        this.earthMesh.rotateY(1.5 * Math.PI);
        this.earthMesh.renderOrder = 1; // Draw the Earth first
        this.earthMesh.castShadow = true;
        this.earthMesh.receiveShadow = true;

        const atmosphereGeometry = new THREE.SphereGeometry(this.ATMOSPHERE_RADIUS, this.MESH_RES, this.MESH_RES);
        this.atmosphereMesh = new THREE.Mesh(atmosphereGeometry, this.atmosphereMaterial);
        this.rotationGroup.add(this.atmosphereMesh);
        this.atmosphereMesh.renderOrder = 2; // Draw the atmosphere after the Earth
        this.atmosphereMesh.castShadow = true;
        this.atmosphereMesh.receiveShadow = true;

        // Create the cloud layer
        const cloudRadius = this.EARTH_RADIUS + 0.1; // Slightly larger than the Earth radius
        const cloudGeometry = new THREE.SphereGeometry(cloudRadius, this.MESH_RES, this.MESH_RES);
        this.cloudMesh = new THREE.Mesh(cloudGeometry, this.cloudMaterial);
        this.rotationGroup.add(this.cloudMesh);
        this.cloudMesh.renderOrder = 3; // Draw the clouds after the Earth and atmosphere
        this.cloudMesh.rotateY(1.5 * Math.PI);
    }

    addSurfaceDetails() {
        addLatitudeLines(this.earthMesh, this.EARTH_RADIUS);
        addLongitudeLines(this.earthMesh, this.EARTH_RADIUS);
        addCountryBorders(this.earthMesh, this.EARTH_RADIUS);
        addCities(this.earthMesh, this.EARTH_RADIUS);  // Add cities with population-scaled dots
        addStates(this.earthMesh, this.EARTH_RADIUS);
    }

    initializePhysics(world) {
        const earthBody = new CANNON.Body({
            mass: 0, // Static body
            shape: new CANNON.Sphere((this.EARTH_RADIUS * 10000)), // Convert to Cannon units (10 km per unit)
            material: new CANNON.Material(),
            friction: 0.5 // Adjust based on simulation needs
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
}
