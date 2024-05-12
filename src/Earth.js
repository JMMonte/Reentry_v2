import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { addLatitudeLines, addLongitudeLines, addCountryBorders } from './earthSurface.js';
import earthTexture from './texture/8k_earth_daymap.jpg';
import earthSpecTexture from './texture/8k_earth_specular_map.png';
import earthRoughnessTexture from './texture/8k_earth_roughness_map.png';
import earthNormalTexture from './texture/8k_earth_normal_map.png';
import fragmentShader from './shaders/atmosphereFragmentShader.glsl';
import vertexShader from './shaders/atmosphereVertexShader.glsl';
import { Constants } from './Constants.js';

export class Earth {
    constructor(scene, world, renderer, timeManager) {
        this.timeManager = timeManager;

        this.EARTH_RADIUS = Constants.earthRadius * Constants.scale * Constants.metersToKm; // Radius in Three.js units (scaled km)
        this.radius = Constants.earthRadius; // Radius in km
        this.ATMOSPHERE_RADIUS = this.EARTH_RADIUS + 10; // Slightly larger to prevent z-fighting
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
    
        this.earthMaterial = new THREE.MeshPhysicalMaterial({
            map: earthTextureMap,
            roughness: 0.9,
            metalness: 0.2,
            normalMap: textureLoader.load(earthNormalTexture),
            metalnessMap: textureLoader.load(earthSpecTexture),
            roughnessMap: textureLoader.load(earthRoughnessTexture),
            specularIntensity: 0,
        });
        this.atmosphereMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0.2, 0.5, 0.9) },
                fresnelPower: { value: 10.0 },
                // Note: We remove opacity here because we will set it per mesh
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            side: THREE.DoubleSide, // Making the atmosphere material two-sided
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
        });
    }

    initializeMeshes() {
        const oblateness = 0.0033528; // Earth's oblateness factor
        const scaledRadius = this.EARTH_RADIUS * (1 - oblateness);
        this.earthGeometry = new THREE.SphereGeometry(scaledRadius, 128, 128);
        this.earthMesh = new THREE.Mesh(this.earthGeometry, this.earthMaterial);
        this.rotationGroup.add(this.earthMesh);
        this.earthMesh.rotateY(1.5 * Math.PI);
    
        const atmosphereGeometries = [];
        const numSpheres = 20; // Number of spheres in the atmosphere
        const stepSize = (this.ATMOSPHERE_RADIUS - scaledRadius) / numSpheres;
        const maxOpacity = 0.1; // Maximum opacity at the surface
        const minOpacity = 0.0; // Minimum opacity at the outermost layer
    
        for (let i = 0; i < numSpheres; i++) {
            const radius = scaledRadius + (i * stepSize);
            const atmosphereGeometry = new THREE.SphereGeometry(radius, 128, 128);
            atmosphereGeometries.push(atmosphereGeometry);
    
            // Compute logarithmic opacity
            const opacity = minOpacity + (maxOpacity - minOpacity) * Math.log(numSpheres - i) / Math.log(numSpheres);
            
            const atmosphereMaterial = this.atmosphereMaterial.clone();
            atmosphereMaterial.uniforms.opacity = { value: opacity };
    
            const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
            this.rotationGroup.add(atmosphereMesh);
        }
    }

    addSurfaceDetails() {
        addLatitudeLines(this.earthMesh, this.EARTH_RADIUS);
        addLongitudeLines(this.earthMesh, this.EARTH_RADIUS);
        addCountryBorders(this.earthMesh, this.EARTH_RADIUS);
    }

    initializePhysics(world) {
        const earthBody = new CANNON.Body({
            mass: 0, // Static body
            shape: new CANNON.Sphere((this.EARTH_RADIUS * Constants.kmToMeters)), // Convert to Cannon units
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

    updateLightDirection(newDirection) {
        this.atmosphereMaterial.uniforms.uLightDirection.value.copy(newDirection.normalize());
    }
}
