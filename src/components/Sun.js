import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { Lensflare, LensflareElement } from './Lensflare.js';
import { createLensflareTextures } from '../utils/LensflareTextures.js';

export class Sun {
    constructor(scene, timeUtils) {
        this.scene = scene;
        this.timeUtils = timeUtils;
        this.radius = Constants.sunRadius * Constants.scale * Constants.metersToKm;

        // Create a group to hold both the sun mesh and its corona
        this.sunGroup = new THREE.Group();
        this.scene.add(this.sunGroup);

        // Main sun sphere with depth writing enabled
        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            color: 0xFFFFFF,
            emissive: 0xFFFFFF,
            emissiveIntensity: 80,
            shininess: 100,
            depthWrite: true,  // Enable depth writing
            depthTest: true    // Enable depth testing
        });

        this.sun = new THREE.Mesh(geometry, material);
        this.sunGroup.add(this.sun);

        // Add a slightly larger corona sphere
        const coronaGeometry = new THREE.SphereGeometry(this.radius * 1.2, 32, 32);
        const coronaMaterial = new THREE.MeshBasicMaterial({
            color: 0xffddaa,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false,  // Disable depth writing for transparency
            side: THREE.BackSide
        });

        this.corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
        this.sunGroup.add(this.corona);

        // Point light
        this.sunLight = new THREE.PointLight(0xffffff, 40000000.0, 0);
        this.sunLight.decay = 1;
        this.sunLight.position.copy(this.sun.position);
        this.sunLight.castShadow = true;
        this.sunGroup.add(this.sunLight);

        // Add lens flare with improved settings
        const { textureFlare0, textureFlare3 } = createLensflareTextures();

        const lensflare = new Lensflare();
        
        // Main flare (smaller size to reduce flickering)
        lensflare.addElement(new LensflareElement(textureFlare0, 500, 0, new THREE.Color(0xffffff)));
        
        // Secondary flares with adjusted distances and sizes
        lensflare.addElement(new LensflareElement(textureFlare3, 40, 0.4, new THREE.Color(0xff8800)));
        lensflare.addElement(new LensflareElement(textureFlare3, 50, 0.6, new THREE.Color(0xff8800)));
        lensflare.addElement(new LensflareElement(textureFlare3, 60, 0.8, new THREE.Color(0xff8800)));
        lensflare.addElement(new LensflareElement(textureFlare3, 40, 1.0, new THREE.Color(0xff8800)));

        this.sunLight.add(lensflare);
    }

    updatePosition() {
        const position = this.timeUtils.getSunPosition();
        this.sunGroup.position.copy(position);
    }

    dispose() {
        // Clean up materials and geometries
        this.sun.geometry.dispose();
        this.sun.material.dispose();
        this.corona.geometry.dispose();
        this.corona.material.dispose();
        
        // Remove from scene
        this.scene.remove(this.sunGroup);
    }
}
