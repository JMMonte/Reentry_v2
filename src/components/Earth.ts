import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EarthSurface } from './EarthSurface';
import { Constants } from '../utils/Constants';
import { PhysicsUtils } from '../utils/PhysicsUtils';
import { TextureManager } from '../managers/TextureManager';

// Declare ambient module for shader files
declare module '*.glsl' {
    const value: string;
    export = value;
}

// Import TimeManager type
type TimeManager = {
    getElapsedTime(): number;
};

// Import shader files as strings
const atmosphereFragmentShader = require('../../public/assets/shaders/atmosphereFragmentShader.glsl') as string;
const atmosphereVertexShader = require('../../public/assets/shaders/atmosphereVertexShader.glsl') as string;

import geojsonDataCities from '../config/ne_110m_populated_places.json';
import geojsonDataAirports from '../config/ne_10m_airports.json';
import geojsonDataSpaceports from '../config/spaceports.json';
import geojsonDataGroundStations from '../config/ground_stations.json';
import geojsonDataObservatories from '../config/observatories.json';

interface DisplayProperty {
    value: boolean;
    name: string;
    icon: string;
}

interface DisplayProperties {
    showSurfaceLines: DisplayProperty;
    showCities: DisplayProperty;
    showAirports: DisplayProperty;
    showSpaceports: DisplayProperty;
    showObservatories: DisplayProperty;
    showGroundStations: DisplayProperty;
    showCountryBorders: DisplayProperty;
    showStates: DisplayProperty;
    showVectors: DisplayProperty;
}

interface DisplaySettings {
    [key: string]: boolean;
}

interface App3D {
    // Add any app-specific properties needed by Earth
    [key: string]: any;
}

// Extend EarthSurface interface to include all required methods
declare module './EarthSurface' {
    interface EarthSurface {
        addLatitudeLines(): void;
        addLongitudeLines(): void;
        addCountryBorders(): void;
        addStates(): void;
        addCities(data: any): void;
        addAirports(data: any): void;
        addSpaceports(data: any): void;
        addGroundStations(data: any): void;
        addObservatories(data: any): void;
        setLinesVisible(visible: boolean): void;
        setCitiesVisible(visible: boolean): void;
        setStatesVisible(visible: boolean): void;
        setAirportsVisible(visible: boolean): void;
        setSpaceportsVisible(visible: boolean): void;
        setCountryBordersVisible(visible: boolean): void;
        setGroundStationsVisible(visible: boolean): void;
        setObservatoriesVisible(visible: boolean): void;
    }
}

type VisibilityMethod = {
    [K in keyof DisplayProperties as `set${Capitalize<K>}Visible`]: (visible: boolean) => void;
};

export class Earth extends THREE.Object3D implements VisibilityMethod {
    // Static display properties
    static displayProperties: DisplayProperties = {
        showSurfaceLines: { value: true, name: 'Surface Lines', icon: 'Mountain' },
        showCities: { value: false, name: 'Cities', icon: 'Building2' },
        showAirports: { value: false, name: 'Airports', icon: 'Plane' },
        showSpaceports: { value: false, name: 'Spaceports', icon: 'Rocket' },
        showObservatories: { value: false, name: 'Observatories', icon: 'Telescope' },
        showGroundStations: { value: false, name: 'Ground Stations', icon: 'Radio' },
        showCountryBorders: { value: false, name: 'Country Borders', icon: 'Map' },
        showStates: { value: false, name: 'States', icon: 'Map' },
        showVectors: { value: false, name: 'Vectors', icon: 'Move' }
    };

    // Class properties with definite assignment assertions
    private readonly MESH_RES: number = 128;
    private readonly EARTH_RADIUS!: number;
    private readonly ATMOSPHERE_RADIUS!: number;
    private readonly SIDEREAL_DAY_IN_SECONDS: number = 86164;
    private readonly DAYS_IN_YEAR: number = 365.25;
    private readonly EARTH_MASS!: number;

    private timeManager!: TimeManager;
    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private textureManager!: TextureManager;
    private app!: App3D;
    private displaySettings!: DisplaySettings;

    private tiltGroup!: THREE.Group;
    private rotationGroup!: THREE.Group;
    private earthGeometry!: THREE.SphereGeometry;
    private earthMesh!: THREE.Mesh;
    private atmosphereMesh!: THREE.Mesh;
    private cloudMesh!: THREE.Mesh;
    private earthMaterial!: THREE.MeshPhongMaterial;
    private cloudMaterial!: THREE.MeshPhongMaterial;
    private atmosphereMaterial!: THREE.ShaderMaterial;
    private cloudTexture!: THREE.Texture;
    private earthSurface!: EarthSurface;
    private body!: CANNON.Body;

    constructor(
        scene: THREE.Scene,
        world: CANNON.World,
        renderer: THREE.WebGLRenderer,
        timeManager: TimeManager,
        textureManager: TextureManager,
        app: App3D
    ) {
        super();
        
        this.timeManager = timeManager;
        this.EARTH_RADIUS = Constants.earthRadius * Constants.scale * Constants.metersToKm;
        this.ATMOSPHERE_RADIUS = this.EARTH_RADIUS + 4;
        this.EARTH_MASS = Constants.earthMass;
        this.renderer = renderer;
        this.scene = scene;
        this.textureManager = textureManager;
        this.app = app;

        // Initialize display settings from static properties
        this.displaySettings = {};
        Object.entries(Earth.displayProperties).forEach(([key, prop]) => {
            this.displaySettings[key] = prop.value;
        });

        this.initializeGroups(scene);
        this.initializeMaterials();
        this.initializeMeshes();
        this.initializeSurfaceDetails();
        this.initializePhysics(world);
        this.addLightSource();
    }

    private initializeGroups(scene: THREE.Scene): void {
        this.tiltGroup = new THREE.Group();
        this.rotationGroup = new THREE.Group();
        this.tiltGroup.add(this.rotationGroup);
        scene.add(this.tiltGroup);
        this.tiltGroup.rotation.x = THREE.MathUtils.degToRad(23.5);
    }

    private initializeMaterials(): void {
        const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

        const earthTextureMap = this.textureManager.getTexture('earthTexture');
        if (!earthTextureMap) {
            throw new Error('Failed to load Earth texture');
        }
        earthTextureMap.anisotropy = maxAnisotropy;

        const cloudTexture = this.textureManager.getTexture('cloudTexture');
        if (!cloudTexture) {
            throw new Error('Failed to load cloud texture');
        }
        cloudTexture.anisotropy = maxAnisotropy;
        this.cloudTexture = cloudTexture;

        const earthSpecTexture = this.textureManager.getTexture('earthSpecTexture');
        const earthNormalTexture = this.textureManager.getTexture('earthNormalTexture');
        if (!earthSpecTexture || !earthNormalTexture) {
            throw new Error('Failed to load Earth textures');
        }

        this.earthMaterial = new THREE.MeshPhongMaterial({
            map: earthTextureMap,
            specularMap: earthSpecTexture,
            specular: 0xffffff,
            shininess: 40.0,
            normalMap: earthNormalTexture,
            normalScale: new THREE.Vector2(5.0, 5.0),
            normalMapType: THREE.TangentSpaceNormalMap,
            lightMap: this.cloudTexture,
            lightMapIntensity: -1.0,
            depthWrite: true
        });

        this.cloudMaterial = new THREE.MeshPhongMaterial({
            alphaMap: this.cloudTexture,
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

    private initializeMeshes(): void {
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

    private initializeSurfaceDetails(): void {
        this.earthSurface = new EarthSurface(this.earthMesh, this.EARTH_RADIUS);
        this.earthSurface.addLatitudeLines();
        this.earthSurface.addLongitudeLines();
        this.earthSurface.addCountryBorders();
        this.earthSurface.addStates();
        this.earthSurface.addCities(geojsonDataCities);
        this.earthSurface.addAirports(geojsonDataAirports);
        this.earthSurface.addSpaceports(geojsonDataSpaceports);
        this.earthSurface.addGroundStations(geojsonDataGroundStations);
        this.earthSurface.addObservatories(geojsonDataObservatories);
    }

    private initializePhysics(world: CANNON.World): void {
        const shape = new CANNON.Sphere(this.EARTH_RADIUS);
        this.body = new CANNON.Body({
            mass: this.EARTH_MASS,
            type: CANNON.Body.STATIC,
            shape: shape,
            position: new CANNON.Vec3(0, 0, 0)
        });
        world.addBody(this.body);
    }

    private addLightSource(): void {
        const light = new THREE.DirectionalLight(0xffffff, 1.0);
        light.position.set(1, 0, 0).normalize();
        this.scene.add(light);
    }

    public updateRotation(): void {
        const rotationAngle = (2 * Math.PI * this.timeManager.getElapsedTime()) / this.SIDEREAL_DAY_IN_SECONDS;
        this.rotationGroup.rotation.y = rotationAngle;
    }

    public updateLightDirection(): void {
        const lightPosition = new THREE.Vector3(1, 0, 0);
        lightPosition.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationGroup.rotation.y);
        this.atmosphereMaterial.uniforms.lightPosition.value.copy(lightPosition);
    }

    public getGreenwichPosition(): THREE.Vector3 {
        return new THREE.Vector3(this.EARTH_RADIUS, 0, 0).applyMatrix4(this.rotationGroup.matrixWorld);
    }

    public setSurfaceLinesVisible(visible: boolean): void {
        this.earthSurface.setLinesVisible(visible);
    }

    public setCitiesVisible(visible: boolean): void {
        this.earthSurface.setCitiesVisible(visible);
    }

    public setStatesVisible(visible: boolean): void {
        this.earthSurface.setStatesVisible(visible);
    }

    public setAirportsVisible(visible: boolean): void {
        this.earthSurface.setAirportsVisible(visible);
    }

    public setSpaceportsVisible(visible: boolean): void {
        this.earthSurface.setSpaceportsVisible(visible);
    }

    public setCountryBordersVisible(visible: boolean): void {
        this.earthSurface.setCountryBordersVisible(visible);
    }

    public setGroundStationsVisible(visible: boolean): void {
        this.earthSurface.setGroundStationsVisible(visible);
    }

    public setObservatoriesVisible(visible: boolean): void {
        this.earthSurface.setObservatoriesVisible(visible);
    }

    public getMesh(): THREE.Mesh {
        return this.earthMesh;
    }

    public addImpactPoint(position: THREE.Vector3): void {
        const impactGeometry = new THREE.SphereGeometry(0.1, 32, 32);
        const impactMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const impactPoint = new THREE.Mesh(impactGeometry, impactMaterial);
        
        const direction = position.clone().normalize();
        const distance = this.EARTH_RADIUS;
        impactPoint.position.copy(direction.multiplyScalar(distance));
        
        this.rotationGroup.add(impactPoint);
        
        setTimeout(() => {
            this.rotationGroup.remove(impactPoint);
            impactGeometry.dispose();
            impactMaterial.dispose();
        }, 2000);
    }

    public convertEciToGround(positionECI: THREE.Vector3): THREE.Vector3 {
        const groundPosition = positionECI.clone();
        groundPosition.applyMatrix4(this.rotationGroup.matrixWorld.clone().invert());
        return groundPosition;
    }

    public getDisplaySettings(): DisplaySettings {
        return { ...this.displaySettings };
    }

    public updateDisplaySetting(key: keyof DisplayProperties, value: boolean): void {
        if (key in this.displaySettings) {
            this.displaySettings[key] = value;
            const methodName = `set${key.charAt(0).toUpperCase() + key.slice(1)}Visible` as keyof VisibilityMethod;
            const method = this[methodName];
            if (typeof method === 'function') {
                method.call(this, value);
            }
        }
    }

    // Implement VisibilityMethod interface
    public setSurfaceLinesVisible(visible: boolean): void {
        this.earthSurface.setLinesVisible(visible);
    }

    public setCitiesVisible(visible: boolean): void {
        this.earthSurface.setCitiesVisible(visible);
    }

    public setAirportsVisible(visible: boolean): void {
        this.earthSurface.setAirportsVisible(visible);
    }

    public setSpaceportsVisible(visible: boolean): void {
        this.earthSurface.setSpaceportsVisible(visible);
    }

    public setObservatoriesVisible(visible: boolean): void {
        this.earthSurface.setObservatoriesVisible(visible);
    }

    public setGroundStationsVisible(visible: boolean): void {
        this.earthSurface.setGroundStationsVisible(visible);
    }

    public setCountryBordersVisible(visible: boolean): void {
        this.earthSurface.setCountryBordersVisible(visible);
    }

    public setStatesVisible(visible: boolean): void {
        this.earthSurface.setStatesVisible(visible);
    }

    public setVectorsVisible(visible: boolean): void {
        // Implement vector visibility
    }
} 