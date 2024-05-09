import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { addLatitudeLines, addLongitudeLines, addCountryBorders } from './earthSurface.js';
import earthTexture from './texture/8k_earth_daymap.jpg';
import earthSpecTexture from './texture/8k_earth_specular_map.png';
import earthRoughnessTexture from './texture/8k_earth_roughness_map.png';
import earthNormalTexture from './texture/8k_earth_normal_map.png';
import fragmentShader from './shaders/atmosphereFragmentShader.glsl';
import vertexShader from './shaders/atmosphereVertexShader.glsl';
import { Constants } from './constants.js';

const earthRadius = Constants.earthRadius;

export class Earth {
    
    constructor(scene, world, renderer, timeManager) {
        this.timeManager = timeManager;

        this.EARTH_RADIUS = earthRadius; // Radius in kilometers
        this.ATMOSPHERE_RADIUS = earthRadius; // Slightly larger than Earth's radius to prevent z-fighting
        this.SIDEREAL_DAY_IN_SECONDS = 86164;
        this.DAYS_IN_YEAR = 365.25;
        this.EARTH_MASS = 5.972e24;
        this.renderer = renderer;
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
                opacity: { value: 0.4 },
                uColor: { value: new THREE.Color(0.2, 0.5, 0.9) },
                fresnelPower: { value: 4.0 },
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            side: THREE.FrontSide,
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
        
        const atmosphereGeometry = new THREE.SphereGeometry(this.ATMOSPHERE_RADIUS + 5, 128, 128); // slightly larger radius
        this.atmosphereMesh = new THREE.Mesh(atmosphereGeometry, this.atmosphereMaterial);
        this.rotationGroup.add(this.atmosphereMesh);

    }
    
    addSurfaceDetails() {
        addLatitudeLines(this.earthMesh, this.EARTH_RADIUS);
        addLongitudeLines(this.earthMesh, this.EARTH_RADIUS);
        addCountryBorders(this.earthMesh, this.EARTH_RADIUS);
    }

    initializePhysics(world) {
        const earthBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Sphere(this.EARTH_RADIUS)
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
