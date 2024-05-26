// components/Moon.js
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Constants } from '../utils/Constants.js';
import { JulianDay, EclipticToCartesian, RotateAroundX, RotateAroundZ } from '../utils/AstronomyUtils.js';
import moonTexture from '../../public/assets/texture/lroc_color_poles_8k.jpg';
import moonBump from '../../public/assets/texture/ldem_16_uint.jpg';

export class Moon {
    constructor(scene, world, renderer, timeUtils) {
        this.scene = scene;
        this.world = world;
        this.renderer = renderer;
        this.timeUtils = timeUtils;

        const textureLoader = new THREE.TextureLoader();
        // Create the moon mesh
        const moonGeometry = new THREE.SphereGeometry(
            Constants.moonRadius * Constants.metersToKm * Constants.scale,
            128,
            128
        );
        const moonMaterial = new THREE.MeshPhongMaterial({
            map: textureLoader.load(moonTexture),
            bumpMap: textureLoader.load(moonBump),
            bumpScale: 3.9,
            displacementMap: textureLoader.load(moonBump),
            displacementScale: 5.9,
        });
        this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        
        this.moonMesh.castShadow = true;
        this.moonMesh.receiveShadow = true;
        scene.add(this.moonMesh);
        this.moonMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        // Create the moon body
        const moonShape = new CANNON.Sphere(Constants.moonRadius);
        this.moonBody = new CANNON.Body({
            mass: Constants.moonMass,
            shape: moonShape,
            position: new CANNON.Vec3(
                Constants.moonInitialPosition.x,
                Constants.moonInitialPosition.y,
                Constants.moonInitialPosition.z
            )
        });
        world.addBody(this.moonBody);

        // Initialize trace line
        this.initTraceLine();

        // Add light source to simulate glare
        this.addLightSource();
    }

    initTraceLine() {
        const traceLineGeometry = new THREE.BufferGeometry();
        const traceLineMaterial = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
        this.traceLine = new THREE.Line(traceLineGeometry, traceLineMaterial);
        this.scene.add(this.traceLine);

        this.dynamicPositions = [];
        this.creationTimes = [];
        this.maxTracePoints = 10000;
    }

    addLightSource() {
        const light = new THREE.PointLight(0xffffff, 8e7, Constants.moonOrbitRadius * 2); // White light, intensity 1, distance twice the Moon's orbit radius
        light.position.set(0, 0, 0); // Center of the moon
        light.decay = 2; // Physical decay factor

        this.moonMesh.add(light);

        const lightHelper = new THREE.PointLightHelper(light, 5); // Optional: visualize the light source position
        this.scene.add(lightHelper);
    }

    updatePosition(currentTime) {
        const jd = JulianDay(new Date(currentTime));

        // Compute Moon's ecliptic longitude, latitude, and distance
        const { lambda, beta, delta } = this.computeMoonEclipticCoordinates(jd);

        // Convert ecliptic coordinates to Cartesian coordinates
        let { x, y, z } = EclipticToCartesian(lambda, beta, delta);

        // Apply inclination correction (rotate orbit around the x-axis by the Moon's inclination angle)
        const inclination = 5.145 * (Math.PI / 180); // Moon's inclination in radians
        ({ x, y, z } = RotateAroundX(x, y, z, inclination));

        // Adjust to the Three.js coordinate system (rotate orbit around the y-axis by 90 degrees)
        ({ x, y, z } = RotateAroundX(x, y, z, Math.PI / 2));

        // Rotate 180 degrees Z axis to match the Earth-Moon system
        ({ x, y, z } = RotateAroundZ(x, y, z, Math.PI));

        // Set position in CANNON.js (meters)
        this.moonBody.position.set(x, y, z);
        // Convert to Three.js coordinates and set position
        this.moonMesh.position.copy(this.moonBody.position).multiplyScalar(Constants.metersToKm * Constants.scale);

        this.updateTraceLine(currentTime);
    }

    computeMoonEclipticCoordinates(jd) {
        // Placeholder for actual implementation based on Astronomical Algorithms by Jean Meeus
        // Simplified for illustration
        const lambda = 218.316 + 13.176396 * jd; // Mean longitude of the Moon
        const beta = 5.1454; // Ecliptic latitude of the Moon
        const delta = Constants.moonOrbitRadius; // Distance to the Moon in km

        return { lambda, beta, delta };
    }

    updateTraceLine(currentTime) {
        const currentPosition = new THREE.Vector3().copy(this.moonMesh.position);
        this.dynamicPositions.push(currentPosition);
        this.creationTimes.push(currentTime);

        if (this.dynamicPositions.length > this.maxTracePoints) {
            this.dynamicPositions.shift();
            this.creationTimes.shift();
        }

        const positions = new Float32Array(this.dynamicPositions.length * 3);
        this.dynamicPositions.forEach((pos, i) => {
            positions.set([pos.x, pos.y, pos.z], i * 3);
        });

        this.traceLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.traceLine.geometry.attributes.position.needsUpdate = true;
    }

    updateRotation() {
        // Calculate the current fraction of the Moon's rotation
        const fractionOfRotation = this.timeUtils.getFractionOfMoonRotation();
    
        // Calculate the total rotation angle in radians
        const totalRotation = (2 * Math.PI) * fractionOfRotation;
    
        // Ensure to apply only the incremental change in rotation
        if (this.previousRotation === undefined) {
            this.previousRotation = totalRotation;
        }
        const deltaRotation = totalRotation - this.previousRotation;
        this.previousRotation = totalRotation;
    
        // Update moon rotation
        this.moonMesh.rotation.y += deltaRotation;
    }

    getMesh() {
        return this.moonMesh;
    }

    get quaternion() {
        return this.moonMesh.quaternion;
    }
}
