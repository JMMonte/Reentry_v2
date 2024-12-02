import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Constants } from '../utils/Constants.js';
import { JulianDay, RotateAroundX, RotateAroundY } from '../utils/AstronomyUtils.js';
import moonTexture from '../../public/assets/texture/lroc_color_poles_8k.jpg';
import moonBump from '../../public/assets/texture/ldem_16_uint.jpg';
import { PhysicsUtils } from '../utils/PhysicsUtils.js';
import { MoonSurface } from './MoonSurface.js';

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
            // displacementMap: textureLoader.load(moonBump),
            // displacementScale: 5.9,
        });
        this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);

        this.moonMesh.castShadow = true;
        this.moonMesh.receiveShadow = true;
        scene.add(this.moonMesh);
        this.moonMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 1.7); // Rotate 180 degrees around the y-axis

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

        // Initialize orbit line
        this.initOrbitLine();

        this.addPeriapsisApoapsisPoints();

        // Add Moon surface contours
        this.moonSurface = new MoonSurface(this.moonMesh, Constants.moonRadius * Constants.metersToKm * Constants.scale);
        this.moonSurface.setVisibility(true);

        // Make moonSurface accessible to UI
        window.moonSurface = this.moonSurface;  // Temporary for UI controls

        this.moonSurface.setVisibility(true);
    }

    initTraceLine() {
        const traceLineGeometry = new THREE.BufferGeometry();
        const traceLineMaterial = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
        this.traceLine = new THREE.Line(traceLineGeometry, traceLineMaterial);
        this.traceLine.frustumCulled = false;
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

    initOrbitLine() {
        const orbitPoints = [];
        const pointsCount = 1000; // Number of points to plot

        // Generate points along the orbit
        const startTime = new Date(); // Start date is the current date
        const endTime = new Date(startTime.getTime() + (365 * 24 * 60 * 60 * 1000)); // End date is 1 year from the current date
        const timeStep = (endTime - startTime) / pointsCount; // Time step in milliseconds

        for (let i = 0; i <= pointsCount; i++) {
            const currentTime = new Date(startTime.getTime() + i * timeStep);
            const jd = JulianDay(currentTime);
            const { x, y, z } = this.getMoonPosition(jd);

            // Scale positions to Three.js units (km to meters, apply simulation scale)
            orbitPoints.push(new THREE.Vector3(
                x * Constants.metersToKm * Constants.scale,
                y * Constants.metersToKm * Constants.scale,
                z * Constants.metersToKm * Constants.scale
            ));
        }

        // Create the orbit line
        const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
        const orbitMaterial = new THREE.LineBasicMaterial({
            color: 0xaaaaaa,
            linewidth: 2,
            transparent: true,
            opacity: 0.1
        });
        this.orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
        this.orbitLine.frustumCulled = false;

        // Add the orbit line to the scene
        this.scene.add(this.orbitLine);
    }

    addPeriapsisApoapsisPoints() {
        const a = Constants.semiMajorAxis; // Semi-major axis in m
        const e = Constants.eccentricity; // Orbital eccentricity
        const argumentOfPeriapsis = Constants.argumentOfPeriapsis; // Argument of periapsis in radians
        const inclination = Constants.inclination; // Inclination in radians
        const ascendingNode = Constants.ascendingNode; // Longitude of ascending node in radians

        // Periapsis (closest point)
        let r_periapsis = a * (1 - e);
        let x_periapsis = r_periapsis;
        let y_periapsis = 0;
        let z_periapsis = 0;

        // Apoapsis (farthest point)
        let r_apoapsis = a * (1 + e);
        let x_apoapsis = -r_apoapsis;
        let y_apoapsis = 0;
        let z_apoapsis = 0;

        // Apply rotations to periapsis
        ({ x: x_periapsis, y: y_periapsis, z: z_periapsis } = RotateAroundX(x_periapsis, y_periapsis, z_periapsis, -inclination));
        ({ x: x_periapsis, y: y_periapsis, z: z_periapsis } = RotateAroundX(x_periapsis, y_periapsis, z_periapsis, Math.PI));
        ({ x: x_periapsis, y: y_periapsis, z: z_periapsis } = RotateAroundY(x_periapsis, y_periapsis, z_periapsis, Math.PI / 2));
        ({ x: x_periapsis, y: y_periapsis, z: z_periapsis } = RotateAroundY(x_periapsis, y_periapsis, z_periapsis, argumentOfPeriapsis));
        ({ x: x_periapsis, y: y_periapsis, z: z_periapsis } = RotateAroundY(x_periapsis, y_periapsis, z_periapsis, ascendingNode));

        // Apply rotations to apoapsis
        ({ x: x_apoapsis, y: y_apoapsis, z: z_apoapsis } = RotateAroundX(x_apoapsis, y_apoapsis, z_apoapsis, -inclination));
        ({ x: x_apoapsis, y: y_apoapsis, z: z_apoapsis } = RotateAroundX(x_apoapsis, y_apoapsis, z_apoapsis, Math.PI));
        ({ x: x_apoapsis, y: y_apoapsis, z: z_apoapsis } = RotateAroundY(x_apoapsis, y_apoapsis, z_apoapsis, Math.PI / 2));
        ({ x: x_apoapsis, y: y_apoapsis, z: z_apoapsis } = RotateAroundY(x_apoapsis, y_apoapsis, z_apoapsis, argumentOfPeriapsis));
        ({ x: x_apoapsis, y: y_apoapsis, z: z_apoapsis } = RotateAroundY(x_apoapsis, y_apoapsis, z_apoapsis, ascendingNode));

        // Create and add periapsis point
        const periapsisGeometry = new THREE.BufferGeometry();
        periapsisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([x_periapsis * Constants.metersToKm * Constants.scale, y_periapsis * Constants.metersToKm * Constants.scale, z_periapsis * Constants.metersToKm * Constants.scale], 3));
        const periapsisMaterial = new THREE.PointsMaterial({
            color: 0xff0000,
            size: 5,
            sizeAttenuation: false 
        });
        this.periapsisPoint = new THREE.Points(periapsisGeometry, periapsisMaterial);
        this.scene.add(this.periapsisPoint);

        // Create and add apoapsis point
        const apoapsisGeometry = new THREE.BufferGeometry();
        apoapsisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([x_apoapsis * Constants.metersToKm * Constants.scale, y_apoapsis * Constants.metersToKm * Constants.scale, z_apoapsis * Constants.metersToKm * Constants.scale], 3));
        const apoapsisMaterial = new THREE.PointsMaterial({
            color: 0x0000ff,
            size: 5,
            sizeAttenuation: false 
        });
        this.apoapsisPoint = new THREE.Points(apoapsisGeometry, apoapsisMaterial);
        this.scene.add(this.apoapsisPoint);
    }

    getMoonPosition(jd) {
        // Placeholder for actual ephemerides calculation
        // In practice, use a library or API to get accurate positions
        // This example generates a simple elliptical orbit for illustration

        const a = Constants.semiMajorAxis; // Semi-major axis in m
        const e = Constants.eccentricity; // Orbital eccentricity
        const inclination = Constants.inclination; // Inclination in radians
        const ascendingNode = Constants.ascendingNode; // Longitude of ascending node in radians
        const argumentOfPeriapsis = Constants.argumentOfPeriapsis; // Argument of periapsis in radians

        // Mean anomaly (M)
        const n = 13.176396; // Mean motion in degrees per day
        const M = (n * jd) % 360; // Mean anomaly in degrees
        const E = PhysicsUtils.solveKeplersEquation(M * (Math.PI / 180), e); // Eccentric anomaly in radians

        // True anomaly (ν)
        const ν = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));

        // Distance to the Moon (r)
        const r = a * (1 - e * Math.cos(E));

        // Position in the orbital plane
        let x = r * Math.cos(ν);
        let z = r * Math.sin(ν);
        let y = 0;
        // Rotate around the x-axis by the inclination
        ({ x, y, z } = RotateAroundX(x, y, z, -inclination));
        
        // Rotate 180 around x-axis to match the Moon's orientation
        ({ x, y, z } = RotateAroundX(x, y, z, Math.PI));

        // Rotate 90 around y-axis to match the Moon's orientation
        ({ x, y, z } = RotateAroundY(x, y, z, Math.PI / 2));

        // Rotate around the z-axis by the argument of periapsis
        ({ x, y, z } = RotateAroundY(x, y, z, argumentOfPeriapsis));

        // Rotate around the y-axis by the longitude of the ascending node
        ({ x, y, z } = RotateAroundY(x, y, z, ascendingNode));

        return { x, y, z };
    }

    solveKepler(M, e) {
        let E = M;
        let delta = 1;
        const tolerance = 1e-6;

        while (Math.abs(delta) > tolerance) {
            delta = E - e * Math.sin(E) - M;
            E = E - delta / (1 - e * Math.cos(E));
        }

        return E;
    }

    updatePosition(currentTime) {
        const jd = JulianDay(new Date(currentTime));

        // Compute Moon's position using ephemerides
        const { x, y, z } = this.getMoonPosition(jd);

        // Set position in CANNON.js (meters)
        this.moonBody.position.set(x, y, z);
        // Convert to Three.js coordinates and set position
        this.moonMesh.position.copy(this.moonBody.position).multiplyScalar(Constants.metersToKm * Constants.scale);

        this.updateTraceLine(currentTime);
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

    updateRotation(currentTime) {
        // Calculate the elapsed time in seconds since the previous update
        if (this.previousTime === undefined) {
            this.previousTime = currentTime;
        }
        const elapsedTime = (currentTime - this.previousTime) / 1000;
        this.previousTime = currentTime;

        // Calculate the rotation speed in radians per second
        const rotationSpeed = Constants.moonOrbitSpeed; // Constants.siderialDay should be the moon's rotation period in seconds

        // Calculate the total rotation for this frame
        const deltaRotation = rotationSpeed * elapsedTime;

        // Update moon rotation
        this.moonMesh.rotation.y += deltaRotation;
    }

    getMesh() {
        return this.moonMesh;
    }

    get quaternion() {
        return this.moonMesh.quaternion;
    }

    setOrbitVisible(visible) {
        this.orbitLine.visible = visible;
        this.apoapsisPoint && (this.apoapsisPoint.visible = visible);
        this.periapsisPoint && (this.periapsisPoint.visible = visible);
    }

    setSurfaceDetailsVisible(visible) {
        this.moonSurface.setVisibility(visible);
    }

    setTraceVisible(visible) {
        this.traceLine.visible = visible;
    }

    getCurrentOrbitalParameters(currentTime) {
        const jd = JulianDay(new Date(currentTime));
        const { x, y, z } = this.getMoonPosition(jd);

        const position = new THREE.Vector3(x, y, z);
        const velocity = new THREE.Vector3(
            this.moonBody.velocity.x,
            this.moonBody.velocity.y,
            this.moonBody.velocity.z
        );

        const mu = Constants.G * Constants.earthMass;
        const orbitalElements = PhysicsUtils.calculateOrbitalElements(position, velocity, mu);

        return {
            position: { x, y, z },
            velocity: velocity.toArray(),
            semiMajorAxis: orbitalElements.a,
            eccentricity: orbitalElements.e,
            inclination: orbitalElements.i,
            ascendingNode: orbitalElements.omega,
            argumentOfPeriapsis: orbitalElements.w,
            trueAnomaly: orbitalElements.trueAnomaly
        };
    }
}
