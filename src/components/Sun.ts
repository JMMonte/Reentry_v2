import * as THREE from 'three';
import { Constants } from '../utils/Constants';
import { Lensflare, LensflareElement } from '../addons/Lensflare';

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

interface TimeUtils {
    getSunPosition(): THREE.Vector3;
}

export class Sun {
    // Define display properties for Sun
    static displayProperties: DisplayProperties = {
        showLensFlare: { value: true, name: 'Lens Flare', icon: 'Sun' },
        sunIntensity: { 
            value: 1.0, 
            name: 'Sun Intensity', 
            icon: 'Settings2', 
            type: 'range', 
            min: 0, 
            max: 2, 
            step: 0.1 
        }
    };

    private scene: THREE.Scene;
    private timeUtils: TimeUtils;
    private radius: number;
    private displaySettings: DisplaySettings;
    private sun: THREE.Mesh;
    private sunLight: THREE.PointLight;
    private lensflare: Lensflare;

    constructor(scene: THREE.Scene, timeUtils: TimeUtils) {
        this.scene = scene;
        this.timeUtils = timeUtils;
        this.radius = Constants.sunRadius * Constants.scale * Constants.metersToKm;

        // Initialize display settings from static properties
        this.displaySettings = {};
        Object.entries(Sun.displayProperties).forEach(([key, prop]) => {
            this.displaySettings[key] = prop.value;
        });

        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: 0xFFFFFF,
            emissive: 0xFFFFFF,
            emissiveIntensity: 0.1,
            shininess: 100,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.sun = new THREE.Mesh(geometry, material);
        this.scene.add(this.sun);

        this.sunLight = new THREE.PointLight(0xffffff, 40000000.0, 0);
        this.sunLight.decay = 1;
        this.sunLight.position.copy(this.sun.position);
        this.sunLight.castShadow = true;
        this.scene.add(this.sunLight);

        // Add lens flare
        this.lensflare = new Lensflare();
        this.sunLight.add(this.lensflare);
        this.lensflare.visible = this.displaySettings.showLensFlare as boolean;

        // Load textures
        const textureLoader = new THREE.TextureLoader();
        const loadTexture = (url: string, size: number, distance: number, color: THREE.Color) => {
            textureLoader.load(url, (texture) => {
                this.lensflare.addElement(new LensflareElement(texture, size, distance, color));
            });
        };

        // Main flare
        loadTexture(
            '/textures/lensflare/lensflare0.png',
            700,
            0,
            new THREE.Color(0xffffff).multiplyScalar(1.5)
        );

        // Secondary flares
        loadTexture(
            '/textures/lensflare/lensflare2.png',
            512,
            0.6,
            new THREE.Color(0xffffff).multiplyScalar(1.5)
        );

        // Additional flares
        const flare3Color = new THREE.Color(0xffffff).multiplyScalar(1.5);
        loadTexture('/textures/lensflare/lensflare3.png', 60, 0.7, flare3Color);
        loadTexture('/textures/lensflare/lensflare3.png', 70, 0.9, flare3Color);
        loadTexture('/textures/lensflare/lensflare3.png', 120, 1.0, flare3Color);
        loadTexture('/textures/lensflare/lensflare3.png', 70, 1.1, flare3Color);
    }

    public updatePosition(): void {
        const position = this.timeUtils.getSunPosition();
        this.sun.position.copy(position);
        this.sunLight.position.copy(position);
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
                case 'showLensFlare':
                    if (this.lensflare) {
                        this.lensflare.visible = value as boolean;
                    }
                    break;
                case 'sunIntensity':
                    if (this.sunLight) {
                        this.sunLight.intensity = 40000000.0 * (value as number);
                    }
                    break;
            }
        }
    }
} 