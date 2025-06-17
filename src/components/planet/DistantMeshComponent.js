import * as THREE from 'three';

export class DistantMeshComponent {
    constructor(planet) {
        this.planet = planet;
        this.camera = null; // Will be set by the planet
        const geo = new THREE.SphereGeometry(1, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: planet.dotColor, transparent: true, opacity: 0.7 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.visible = false;
        planet.orbitGroup.add(this.mesh);
    }

    /**
     * Set the camera reference for LOD calculations
     * @param {THREE.Camera} camera - The camera to use for distance calculations
     */
    setCamera(camera) {
        this.camera = camera;
    }

    update() {
        if (!this.camera || !this.planet.planetMesh) return;
        
        const planetPos = new THREE.Vector3();
        this.planet.planetMesh.getWorldPosition(planetPos);
        const camPos = this.camera.position;
        
        // Use cached distance for better performance
        const planetId = this.planet.name || 'unknown';
        let dist = window.app3d?.distanceCache?.getDistance?.(planetId);
        
        // Fallback to direct calculation if cache not available
        if (!dist || dist === 0) {
            dist = planetPos.distanceTo(camPos);
        }
        const fovY = THREE.MathUtils.degToRad(this.camera.fov);
        const scrH = window.innerHeight;
        
        // For irregular bodies (with dimensions), use the maximum dimension
        // This ensures the dot doesn't appear until the body is truly small
        let effectiveRadius = this.planet.radius;
        if (this.planet.dimensions && Array.isArray(this.planet.dimensions)) {
            effectiveRadius = Math.max(...this.planet.dimensions) / 2; // Use max dimension / 2
        }
        
        const pix = (2 * Math.atan(effectiveRadius / dist) / fovY) * scrH;

        const dotMode = pix < this.planet.dotPixelSizeThreshold;

        // Toggle dot and hi-detail meshes
        this.mesh.visible = dotMode;
        this.planet.planetMesh.visible = !dotMode;

        // Mirror atmosphere visibility so we don't update uniforms when hidden
        if (this.planet.atmosphereMesh) {
            this.planet.atmosphereMesh.visible = !dotMode;
        }

        if (dotMode) {
            const ang = (this.planet.dotPixelSizeThreshold / scrH) * fovY;
            this.mesh.scale.setScalar(Math.tan(ang / 2) * dist);
        } else {
            this.planet.planetLOD && this.planet.planetLOD.update(this.camera);
        }
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.planet.orbitGroup.remove(this.mesh);
    }
}