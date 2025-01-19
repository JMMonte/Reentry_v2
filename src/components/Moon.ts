import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Constants } from '../utils/Constants';
import { JulianDay, RotateAroundX, RotateAroundY } from '../utils/AstronomyUtils';
import moonTexture from '../../public/assets/texture/lroc_color_poles_8k.jpg';
import moonBump from '../../public/assets/texture/ldem_16_uint.jpg';
import { PhysicsUtils } from '../utils/PhysicsUtils';
import { MoonSurface } from './MoonSurface';

interface DisplayProperty {
    value: boolean | number;
    name: string;
    icon: string;
    type?: 'range';
    min?: number;
    max?: number;
    step?: number;
}

interface DisplayProperties {
    [key: string]: DisplayProperty;
}

interface DisplaySettings {
    [key: string]: boolean | number;
}

interface OrbitalParameters {
    position: { x: number; y: number; z: number };
    velocity: number[];
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    ascendingNode: number;
    argumentOfPeriapsis: number;
    trueAnomaly: number;
}

export class Moon {
    // Define display properties for Moon
    static displayProperties: DisplayProperties = {
        showMoonOrbit: { value: true, name: 'Moon Orbit', icon: 'Moon' },
        showMoonTraces: { value: false, name: 'Moon Traces', icon: 'LineChart' },
        showMoonSurfaceLines: { value: false, name: 'Moon Surface Lines', icon: 'Mountain' }
    };

    private scene: THREE.Scene;
    private world: CANNON.World;
    private renderer: THREE.WebGLRenderer;
    private timeUtils: { fractionOfDay: number; dayOfYear: number };
    private displaySettings: DisplaySettings;
    private moonMesh: THREE.Mesh;
    private moonBody: CANNON.Body;
    private traceLine!: THREE.Line;
    private orbitLine!: THREE.Line;
    private dynamicPositions: THREE.Vector3[];
    private creationTimes: number[];
    private maxTracePoints: number;
    private previousTime?: number;
    private moonSurface: MoonSurface;
    private periapsisPoint?: THREE.Points;
    private apoapsisPoint?: THREE.Points;

    constructor(
        scene: THREE.Scene, 
        world: CANNON.World, 
        renderer: THREE.WebGLRenderer, 
        timeUtils: { fractionOfDay: number; dayOfYear: number }
    ) {
        this.scene = scene;
        this.world = world;
        this.renderer = renderer;
        this.timeUtils = timeUtils;

        // Initialize display settings from static properties
        this.displaySettings = {};
        Object.entries(Moon.displayProperties).forEach(([key, prop]) => {
            this.displaySettings[key] = prop.value;
        });

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
        });
        this.moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);

        this.moonMesh.castShadow = true;
        this.moonMesh.receiveShadow = true;
        scene.add(this.moonMesh);
        this.moonMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 1.7);

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

        this.initTraceLine();
        this.addLightSource();
        this.initOrbitLine();
        this.addPeriapsisApoapsisPoints();

        // Add Moon surface contours
        this.moonSurface = new MoonSurface(
            this.moonMesh, 
            Constants.moonRadius * Constants.metersToKm * Constants.scale
        );
        this.moonSurface.setVisibility(this.displaySettings.showMoonSurfaceLines as boolean);

        // Initialize trace line properties
        this.dynamicPositions = [];
        this.creationTimes = [];
        this.maxTracePoints = 10000;
    }

    private initTraceLine(): void {
        const traceLineGeometry = new THREE.BufferGeometry();
        const traceLineMaterial = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
        this.traceLine = new THREE.Line(traceLineGeometry, traceLineMaterial);
        this.traceLine.frustumCulled = false;
        this.scene.add(this.traceLine);
    }

    private addLightSource(): void {
        const light = new THREE.PointLight(0xffffff, 8e7, Constants.moonOrbitRadius * 2);
        light.position.set(0, 0, 0);
        light.decay = 2;

        this.moonMesh.add(light);

        const lightHelper = new THREE.PointLightHelper(light, 5);
        this.scene.add(lightHelper);
    }

    public getMesh(): THREE.Mesh {
        return this.moonMesh;
    }

    private initOrbitLine(): void {
        const orbitPoints: THREE.Vector3[] = [];
        const pointsCount = 1000;

        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + (365 * 24 * 60 * 60 * 1000));
        const timeStep = (endTime.getTime() - startTime.getTime()) / pointsCount;

        for (let i = 0; i <= pointsCount; i++) {
            const currentTime = new Date(startTime.getTime() + i * timeStep);
            const jd = JulianDay(currentTime);
            const { x, y, z } = this.getMoonPosition(jd);

            orbitPoints.push(new THREE.Vector3(
                x * Constants.metersToKm * Constants.scale,
                y * Constants.metersToKm * Constants.scale,
                z * Constants.metersToKm * Constants.scale
            ));
        }

        const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
        const orbitMaterial = new THREE.LineBasicMaterial({
            color: 0xaaaaaa,
            linewidth: 2,
            transparent: true,
            opacity: 0.1
        });
        this.orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
        this.orbitLine.frustumCulled = false;

        this.scene.add(this.orbitLine);
    }

    private addPeriapsisApoapsisPoints(): void {
        const a = Constants.semiMajorAxis;
        const e = Constants.eccentricity;
        const argumentOfPeriapsis = Constants.argumentOfPeriapsis;
        const inclination = Constants.inclination;
        const ascendingNode = Constants.ascendingNode;

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
        periapsisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
            x_periapsis * Constants.metersToKm * Constants.scale,
            y_periapsis * Constants.metersToKm * Constants.scale,
            z_periapsis * Constants.metersToKm * Constants.scale
        ], 3));
        const periapsisMaterial = new THREE.PointsMaterial({
            color: 0xff0000,
            size: 5,
            sizeAttenuation: false 
        });
        this.periapsisPoint = new THREE.Points(periapsisGeometry, periapsisMaterial);
        this.scene.add(this.periapsisPoint);

        // Create and add apoapsis point
        const apoapsisGeometry = new THREE.BufferGeometry();
        apoapsisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
            x_apoapsis * Constants.metersToKm * Constants.scale,
            y_apoapsis * Constants.metersToKm * Constants.scale,
            z_apoapsis * Constants.metersToKm * Constants.scale
        ], 3));
        const apoapsisMaterial = new THREE.PointsMaterial({
            color: 0x0000ff,
            size: 5,
            sizeAttenuation: false 
        });
        this.apoapsisPoint = new THREE.Points(apoapsisGeometry, apoapsisMaterial);
        this.scene.add(this.apoapsisPoint);
    }

    private getMoonPosition(jd: number): { x: number; y: number; z: number } {
        const a = Constants.semiMajorAxis;
        const e = Constants.eccentricity;
        const inclination = Constants.inclination;
        const ascendingNode = Constants.ascendingNode;
        const argumentOfPeriapsis = Constants.argumentOfPeriapsis;

        // Mean anomaly (M)
        const n = 13.176396; // Mean motion in degrees per day
        const M = (n * jd) % 360; // Mean anomaly in degrees
        const E = PhysicsUtils.solveKeplersEquation(M * (Math.PI / 180), e); // Eccentric anomaly in radians

        // True anomaly (ν)
        const ν = 2 * Math.atan2(
            Math.sqrt(1 + e) * Math.sin(E / 2),
            Math.sqrt(1 - e) * Math.cos(E / 2)
        );

        // Distance to the Moon (r)
        const r = a * (1 - e * Math.cos(E));

        // Position in the orbital plane
        let x = r * Math.cos(ν);
        let z = r * Math.sin(ν);
        let y = 0;

        // Apply rotations
        ({ x, y, z } = RotateAroundX(x, y, z, -inclination));
        ({ x, y, z } = RotateAroundX(x, y, z, Math.PI));
        ({ x, y, z } = RotateAroundY(x, y, z, Math.PI / 2));
        ({ x, y, z } = RotateAroundY(x, y, z, argumentOfPeriapsis));
        ({ x, y, z } = RotateAroundY(x, y, z, ascendingNode));

        return { x, y, z };
    }

    private solveKepler(M: number, e: number): number {
        let E = M;
        let delta = 1;
        const tolerance = 1e-6;

        while (Math.abs(delta) > tolerance) {
            delta = E - e * Math.sin(E) - M;
            E = E - delta / (1 - e * Math.cos(E));
        }

        return E;
    }

    public updatePosition(currentTime: number): void {
        const jd = JulianDay(new Date(currentTime));
        const { x, y, z } = this.getMoonPosition(jd);

        // Set position in CANNON.js (meters)
        this.moonBody.position.set(x, y, z);
        // Convert to Three.js coordinates and set position
        this.moonMesh.position.copy(this.moonBody.position).multiplyScalar(Constants.metersToKm * Constants.scale);

        this.updateTraceLine(currentTime);
    }

    private updateTraceLine(currentTime: number): void {
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

    public updateRotation(currentTime: number): void {
        if (this.previousTime === undefined) {
            this.previousTime = currentTime;
        }
        const elapsedTime = (currentTime - this.previousTime) / 1000;
        this.previousTime = currentTime;

        const rotationSpeed = Constants.moonOrbitSpeed;
        const deltaRotation = rotationSpeed * elapsedTime;
        this.moonMesh.rotation.y += deltaRotation;
    }

    public get quaternion(): THREE.Quaternion {
        return this.moonMesh.quaternion;
    }

    public setOrbitVisible(visible: boolean): void {
        this.orbitLine.visible = visible;
        if (this.apoapsisPoint) this.apoapsisPoint.visible = visible;
        if (this.periapsisPoint) this.periapsisPoint.visible = visible;
    }

    public setSurfaceDetailsVisible(visible: boolean): void {
        this.moonSurface.setVisibility(visible);
    }

    public setTraceVisible(visible: boolean): void {
        this.traceLine.visible = visible;
    }

    public getCurrentOrbitalParameters(currentTime: number): OrbitalParameters {
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
            semiMajorAxis: orbitalElements.h,
            eccentricity: orbitalElements.e,
            inclination: orbitalElements.i,
            ascendingNode: orbitalElements.omega,
            argumentOfPeriapsis: orbitalElements.w,
            trueAnomaly: orbitalElements.trueAnomaly
        };
    }

    // Method to get current display settings
    public getDisplaySettings(): DisplaySettings {
        return this.displaySettings;
    }

    // Method to update a display setting
    public updateDisplaySetting(key: string, value: boolean | number): void {
        if (key in this.displaySettings) {
            this.displaySettings[key] = value;
            switch (key) {
                case 'showMoonOrbit':
                    this.setOrbitVisible(value as boolean);
                    break;
                case 'showMoonTraces':
                    this.setTraceVisible(value as boolean);
                    break;
                case 'showMoonSurfaceLines':
                    this.setSurfaceDetailsVisible(value as boolean);
                    break;
            }
        }
    }
} 