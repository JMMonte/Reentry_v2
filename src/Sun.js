import * as THREE from 'three';

export class Sun {
    constructor(scene) {
        const geometry = new THREE.SphereGeometry(695700, 32, 32);  // Sun's radius approximately to scale but reduced for performance
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.sun = new THREE.Mesh(geometry, material);
        scene.add(this.sun);

        this.sunLight = new THREE.PointLight(0xffffff, 400000000.0, 0);
        this.sunLight.decay = 1;
        this.sunLight.position.copy(this.sun.position);
        scene.add(this.sunLight);
    }

    updatePosition(date) {
        const position = this.getSunPosition(date);
        this.sun.position.copy(position);
        this.sunLight.position.copy(position);
    }

    getSunPosition(date) {
        const dayOfYear = this.getDayOfYear(date);
        const meanAnomaly = (357.5291 + 0.98560028 * dayOfYear) % 360;  // degrees
        const meanLongitude = (280.4665 + 0.98564736 * dayOfYear) % 360;  // degrees
        const eccentricity = 0.0167;  // Orbital eccentricity of Earth

        // Equation of the center
        const equationOfCenter = (1.9148 * Math.sin(meanAnomaly * Math.PI / 180) +
                                  0.0200 * Math.sin(2 * meanAnomaly * Math.PI / 180) +
                                  0.0003 * Math.sin(3 * meanAnomaly * Math.PI / 180));

        const trueLongitude = (meanLongitude + equationOfCenter) % 360;  // degrees

        // Convert to Cartesian coordinates
        const distance = 1.496e+8; // 1 AU in km
        const x = -distance * Math.cos(trueLongitude * Math.PI / 180);
        const z = distance * Math.sin(trueLongitude * Math.PI / 180);
        return new THREE.Vector3(x, 0, z);
    }

    getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start + (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }
}
