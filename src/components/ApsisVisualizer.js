import * as THREE from 'three';

export class ApsisVisualizer {
    /** Shared sphere geometry for periapsis and apoapsis markers */
    static _sphereGeometry = new THREE.SphereGeometry(1, 8, 8);
    /** Shared materials */
    static _periMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, depthWrite: false });
    static _apoMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.8, depthWrite: false });
    constructor(scene, color) {
        this.scene = scene;
        this.color = color;
        this.initializeApsides();
    }

    initializeApsides() {
        // Create meshes using shared geometry and materials
        this.periapsisMesh = new THREE.Mesh(ApsisVisualizer._sphereGeometry, ApsisVisualizer._periMaterial);
        this.apoapsisMesh = new THREE.Mesh(ApsisVisualizer._sphereGeometry, ApsisVisualizer._apoMaterial);

        // Add onBeforeRender callback to maintain relative size
        const targetSize = 0.003; // Adjust this value to change the relative size
        this.periapsisMesh.onBeforeRender = (renderer, scene, camera) => {
            const distance = camera.position.distanceTo(this.periapsisMesh.position);
            const scale = distance * targetSize;
            this.periapsisMesh.scale.set(scale, scale, scale);
        };

        this.apoapsisMesh.onBeforeRender = (renderer, scene, camera) => {
            const distance = camera.position.distanceTo(this.apoapsisMesh.position);
            const scale = distance * targetSize;
            this.apoapsisMesh.scale.set(scale, scale, scale);
        };

        // Add periapsis to scene
        this.scene.add(this.periapsisMesh);
        
        // Don't set initial visibility - let it be controlled by display options
    }

    update(position, velocity, apsisData) {
        // Use apsis data from physics worker
        if (!apsisData) {
            console.warn('No apsisData from physics worker');
            return null;
        }
        let inc, lan, aop, rPeriWorld, rApoWorld, periapsisAltitude, apoapsisAltitude;
        // Convert angles (degrees) to radians
        inc = THREE.MathUtils.degToRad(apsisData.inclination);
        lan = THREE.MathUtils.degToRad(apsisData.longitudeOfAscendingNode);
        aop = THREE.MathUtils.degToRad(apsisData.argumentOfPeriapsis);
        // Radial distances from debug are in km; convert to world units
        rPeriWorld = apsisData.periapsisRadial;
        rApoWorld = apsisData.apoapsisRadial != null ? apsisData.apoapsisRadial : null;
        periapsisAltitude = apsisData.periapsisAltitude;
        apoapsisAltitude = apsisData.apoapsisAltitude;

        // Update periapsis mesh position
        const periapsisVector = new THREE.Vector3(rPeriWorld, 0, 0);
        this.rotateVector(periapsisVector, inc, lan, aop);
        this.periapsisMesh.position.copy(periapsisVector);

        // Update apoapsis mesh position
        if (rApoWorld != null) {
            const apoapsisVector = new THREE.Vector3(-rApoWorld, 0, 0);
            this.rotateVector(apoapsisVector, inc, lan, aop);
            this.apoapsisMesh.position.copy(apoapsisVector);
            if (!this.apoapsisMesh.parent) this.scene.add(this.apoapsisMesh);
        } else {
            if (this.apoapsisMesh.parent) this.scene.remove(this.apoapsisMesh);
        }

        return { periapsisAltitude, apoapsisAltitude };
    }

    rotateVector(vector, inclination, longAscNode, argPeriapsis) {
        // Apply argument of periapsis rotation
        vector.applyAxisAngle(new THREE.Vector3(0, 0, 1), argPeriapsis);
        
        // Apply inclination rotation
        vector.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclination);
        
        // Apply longitude of ascending node rotation
        vector.applyAxisAngle(new THREE.Vector3(0, 0, 1), longAscNode);
    }

    setVisible(visible) {
        this.periapsisMesh.visible = visible;
        if (this.apoapsisMesh.parent) {
            this.apoapsisMesh.visible = visible;
        }
    }

    dispose() {
        this.scene.remove(this.periapsisMesh);
        if (this.apoapsisMesh.parent) {
            this.scene.remove(this.apoapsisMesh);
        }
        this.periapsisMesh.material.dispose();
        this.apoapsisMesh.material.dispose();
        this.periapsisMesh.geometry.dispose();
        this.apoapsisMesh.geometry.dispose();
    }
}
