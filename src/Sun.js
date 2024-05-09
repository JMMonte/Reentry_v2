import * as THREE from 'three';

export class Sun {
    constructor(scene, timeUtils) {
        this.scene = scene;
        this.timeUtils = timeUtils;  // Inject TimeUtils instance directly into Sun

        const geometry = new THREE.SphereGeometry(69570, 32, 32); // Approximate Sun's radius, scaled down
        const material = new THREE.MeshPhongMaterial({
            color: 0xFFFFFF,  // Sun's color
            emissive: 0xFFFFFF,  // Glowing color
            emissiveIntensity: 5,
            shininess: 100
        });

        this.sun = new THREE.Mesh(geometry, material);
        this.scene.add(this.sun);

        this.sunLight = new THREE.PointLight(0xffffff, 70000000.0, 0);
        this.sunLight.decay = 1;
        this.sunLight.position.copy(this.sun.position);
        this.sunLight.castShadow = true;
        this.scene.add(this.sunLight);

    }

    updatePosition() {
        const position = this.timeUtils.getSunPosition();  // Use TimeUtils to get the current sun position
        this.sun.position.copy(position);
        this.sunLight.position.copy(position);
    }
}
