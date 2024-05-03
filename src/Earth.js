import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { addLatitudeLines, addLongitudeLines, addCountryBorders } from './earthSurface.js';
import earthTexture from './texture/8k_earth_daymap.jpg';
import earthSpecTexture from './texture/8k_earth_specular_map.png';
import earthRoughnessTexture from './texture/8k_earth_roughness_map.png';
import earthNormalTexture from './texture/8k_earth_normal_map.png';
import fragmentShader from './shaders/atmosphereFragmentShader.glsl';
import vertexShader from './shaders/atmosphereVertexShader.glsl';

export class Earth {
    constructor(scene, world) {
        this.earthRadius = 6371; // Radius in kilometers
        this.tiltGroup = new THREE.Group();
        scene.add(this.tiltGroup);
        this.tiltGroup.rotation.x = THREE.MathUtils.degToRad(23.5);

        this.rotationGroup = new THREE.Group();
        this.tiltGroup.add(this.rotationGroup);

        const geometry = new THREE.SphereGeometry(this.earthRadius, 256, 256);
        const texture = new THREE.TextureLoader().load(earthTexture);
        const specularMap = new THREE.TextureLoader().load(earthSpecTexture);
        const normalMap = new THREE.TextureLoader().load(earthNormalTexture);
        const roughnessMap = new THREE.TextureLoader().load(earthRoughnessTexture);

        const material = new THREE.MeshPhysicalMaterial({
            map: texture,
            roughness: 0.7,
            metalness: 0.6,
            specularIntensityMap: specularMap,
            normalMap: normalMap,
            metalnessMap: specularMap,
            roughnessMap: roughnessMap,
        });

        this.earthMesh = new THREE.Mesh(geometry, material);
        this.rotationGroup.add(this.earthMesh);

        addLatitudeLines(this.earthMesh, this.earthRadius);
        addLongitudeLines(this.earthMesh, this.earthRadius);
        addCountryBorders(this.earthMesh, this.earthRadius);

        const earthBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Sphere(this.earthRadius * 1000)
        });
        world.addBody(earthBody);
        this.earthBody = earthBody;

        const siderealDayInSeconds = 86164;
        this.rotationSpeed = 2 * Math.PI / siderealDayInSeconds;
        this.earthMesh.rotateY(1.5 * Math.PI);

        this.rotationGroup.rotation.y = 0;

    }

    updateRotation(simulatedTime) {
        const siderealDayInSeconds = 86164;
        const daysInYear = 365.25;
        let startOfYear = new Date(simulatedTime.getFullYear(), 0, 0);
        let diff = simulatedTime - startOfYear;
        let oneDay = 1000 * 60 * 60 * 24;
        let dayOfYear = Math.floor(diff / oneDay);
        let msSinceStartOfDay = simulatedTime - new Date(simulatedTime.getFullYear(), simulatedTime.getMonth(), simulatedTime.getDate());
        let fractionOfDay = msSinceStartOfDay / (siderealDayInSeconds * 1000);
        let dailyRotation = 2 * Math.PI * fractionOfDay;
        let orbitalCorrection = 2 * Math.PI * (dayOfYear / daysInYear);
        this.rotationGroup.rotation.y = dailyRotation + orbitalCorrection;
    }
}
