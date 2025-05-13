import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
import { Lensflare, LensflareElement } from '../addons/Lensflare.js';

export class Sun {
    constructor(scene, timeUtils, config) {
        this.scene = scene;
        this.timeUtils = timeUtils;  // Inject TimeUtils instance directly into Sun
        this.config = config; // Store config
        this.symbol = '☉';
        this.name = config.name || 'sun';
        this.nameLower = this.name.toLowerCase();
        this.radius = config.radius; // Use radius as provided (should be in scene units, e.g., km)
        this.type = config.type || 'star';
        // Store initial flare specs for later scaling
        this.initialFlareSpecs = [
            { url: '/assets/texture/lensflare/lensflare0.png', size: 700, distance: 0.0 },
            { url: '/assets/texture/lensflare/lensflare2.png', size: 512, distance: 0.6 },
            { url: '/assets/texture/lensflare/lensflare3.png', size: 60, distance: 0.7 },
            { url: '/assets/texture/lensflare/lensflare3.png', size: 70, distance: 0.9 },
            { url: '/assets/texture/lensflare/lensflare3.png', size: 120, distance: 1.0 }
        ];
        // Define a reference distance (e.g., Earth's average orbit radius) for 1x scale
        this.referenceDistance = Constants.AU * Constants.metersToKm; // Earth's average orbital radius


        const geometry = new THREE.SphereGeometry(this.radius, 32, 32); // Approximate Sun's radius, scaled down
        const material = new THREE.MeshPhongMaterial({
            color: 0xFFFFFF,  // Sun's color
            emissive: 0xFFFFFF,  // Glowing color
            emissiveIntensity: 1.0,
            shininess: 100,
            transparent: false,
            blending: THREE.NormalBlending,
            depthWrite: false  // This allows the lens flare to show through
        });

        this.sun = new THREE.Mesh(geometry, material);
        // Do not add to scene here; handled externally
        // this.scene.add(this.sun);

        this.sunLight = new THREE.PointLight(0xffffff, 1e6, 0);
        this.sunLight.decay = 0.7;
        this.sunLight.position.copy(this.sun.position);
        this.sunLight.castShadow = false;
        // Do not add to scene here; handled externally
        // this.scene.add(this.sunLight);

        // Add official lens flare effect
        const textureLoader = new THREE.TextureLoader();
        this.lensflare = new Lensflare(); // Store lensflare instance
        this.initialFlareSpecs.forEach(spec => {
            const tex = textureLoader.load(spec.url);
            this.lensflare.addElement(new LensflareElement(tex, spec.size, spec.distance, new THREE.Color(0xffffff)));
        });
        this.sunLight.add(this.lensflare);
    }

    // The Sun's position is now set externally from App3D/PhysicsWorld.
    // This method only updates lens flare size based on camera distance.
    updateLensFlare(camera) {
        if (camera && this.lensflare && Array.isArray(this.lensflare.elements)) {
            // Calculate Inverse Square Scale Factor
            const distance = camera.position.distanceTo(this.sun.position);
            const effectiveDistance = Math.max(distance, this.radius * 2);
            const scaleFactor = Math.max(0.05, Math.min(10.0,
                (this.referenceDistance * this.referenceDistance) / (effectiveDistance * effectiveDistance)
            ));

            this.lensflare.elements.forEach((element, index) => {
                const initialSpec = this.initialFlareSpecs[index];
                if (initialSpec) {
                    // Resize element based on distance
                    element.size = initialSpec.size * scaleFactor;
                } else {
                    console.warn(`Sun.updateLensFlare: no initialSpec for element ${index}`);
                }
            });
        } else if (camera && this.lensflare && !Array.isArray(this.lensflare.elements)) {
            // Log specific case where lensflare exists but elements is not an array
            console.error('[Sun updateLensFlare] this.lensflare exists, but this.lensflare.elements is not an array!', this.lensflare.elements);
        }
    }

    // Add a getter for mass if needed later (e.g., for gravity calculations)
    get mass() {
        return this.config.mass;
    }

    // Add a method to update the sun's position and sync the light
    setPosition(position) {
        this.sun.position.copy(position);
        this.sunLight.position.copy(position);
    }
}
