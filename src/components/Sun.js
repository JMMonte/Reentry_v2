import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { Lensflare, LensflareElement } from '../addons/Lensflare.js';

export class Sun {
    constructor(scene, timeUtils) {
        this.scene = scene;
        this.timeUtils = timeUtils;  // Inject TimeUtils instance directly into Sun
        this.radius = Constants.sunRadius * Constants.scale * Constants.metersToKm;  // Scale down the Sun's radius

        const geometry = new THREE.SphereGeometry(this.radius, 32, 32); // Approximate Sun's radius, scaled down
        const material = new THREE.MeshPhongMaterial({
            color: 0xFFFFFF,  // Sun's color
            emissive: 0xFFFFFF,  // Glowing color
            emissiveIntensity: 0.1,
            shininess: 100,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false  // This allows the lens flare to show through
        });

        this.sun = new THREE.Mesh(geometry, material);
        this.scene.add(this.sun);

        this.sunLight = new THREE.PointLight(0xffffff, 40000000.0, 0);
        this.sunLight.decay = 1;
        this.sunLight.position.copy(this.sun.position);
        this.sunLight.castShadow = false;
        this.scene.add(this.sunLight);

        // Add lens flare
        const lensflare = new Lensflare();
        this.sunLight.add(lensflare);

        // Load textures
        const textureLoader = new THREE.TextureLoader();
        const loadTexture = (url, size, distance, color) => {
            textureLoader.load(url, (texture) => {
                lensflare.addElement(new LensflareElement(texture, size, distance, color));
            });
        };

        // Main flare
        loadTexture(
            '/assets/texture/lensflare/lensflare0.png',
            700,
            0,
            new THREE.Color(0xffffff).multiplyScalar(1.5)
        );

        // Secondary flares
        loadTexture(
            '/assets/texture/lensflare/lensflare2.png',
            512,
            0.6,
            new THREE.Color(0xffffff).multiplyScalar(1.5)
        );

        // Additional flares
        const flare3Color = new THREE.Color(0xffffff).multiplyScalar(1.5);
        loadTexture('/assets/texture/lensflare/lensflare3.png', 60, 0.7, flare3Color);
        loadTexture('/assets/texture/lensflare/lensflare3.png', 70, 0.9, flare3Color);
        loadTexture('/assets/texture/lensflare/lensflare3.png', 120, 1.0, flare3Color);
        loadTexture('/assets/texture/lensflare/lensflare3.png', 70, 1.1, flare3Color);
    }

    updatePosition() {
        const position = this.timeUtils.getSunPosition();  // Use TimeUtils to get the current sun position
        this.sun.position.copy(position);
        this.sunLight.position.copy(position);
    }
}
