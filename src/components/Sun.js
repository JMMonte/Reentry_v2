import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { Lensflare, LensflareElement } from '../addons/Lensflare.js';

export class Sun {
    constructor(scene, timeUtils) {
        this.scene = scene;
        this.timeUtils = timeUtils;  // Inject TimeUtils instance directly into Sun
        this.symbol = '☉';
        this.name = 'sun';
        this.radius = Constants.sunRadius * Constants.scale * Constants.metersToKm;  // Scale down the Sun's radius

        const geometry = new THREE.SphereGeometry(this.radius, 32, 32); // Approximate Sun's radius, scaled down
        const material = new THREE.MeshPhongMaterial({
            color: 0xFFFFFF,  // Sun's color
            emissive: 0xFFFFFF,  // Glowing color
            emissiveIntensity: 0.1,
            shininess: 100,
            transparent: false,
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

        // Add official lens flare effect
        const textureLoader = new THREE.TextureLoader();
        const lensflare = new Lensflare();
        [
            { url: '/assets/texture/lensflare/lensflare0.png', size: 700, distance: 0.0 },
            { url: '/assets/texture/lensflare/lensflare2.png', size: 512, distance: 0.6 },
            { url: '/assets/texture/lensflare/lensflare3.png', size: 60, distance: 0.7 },
            { url: '/assets/texture/lensflare/lensflare3.png', size: 70, distance: 0.9 },
            { url: '/assets/texture/lensflare/lensflare3.png', size: 120, distance: 1.0 }
        ].forEach(spec => {
            const tex = textureLoader.load(spec.url);
            lensflare.addElement(new LensflareElement(tex, spec.size, spec.distance, new THREE.Color(0xffffff)));
        });
        this.sunLight.add(lensflare);
    }

    updatePosition() {
        // Smoothly update sun position each simulation step
        const position = this.timeUtils.getSunPosition();
        // Directly update mesh and light positions
        this.sun.position.copy(position);
        this.sunLight.position.copy(position);
    }
}
