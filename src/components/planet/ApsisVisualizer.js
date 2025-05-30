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

    /**
     * Update apsis visualization using standardized apsis data
     * @param {Object} apsisData - Data from ApsisService with periapsis/apoapsis info
     * @returns {Object} - Altitude information for UI display
     */
    update(apsisData) {
        if (!apsisData || !apsisData.periapsis) {
            console.warn('[ApsisVisualizer] No valid apsis data provided');
            this.setVisible(false);
            return null;
        }

        // Update periapsis mesh position (position comes as [x, y, z] array)
        if (apsisData.periapsis.position) {
            this.periapsisMesh.position.fromArray(apsisData.periapsis.position);
            this.periapsisMesh.visible = true;
        }

        // Update apoapsis mesh position (only for elliptical orbits)
        if (apsisData.apoapsis && apsisData.apoapsis.position) {
            this.apoapsisMesh.position.fromArray(apsisData.apoapsis.position);
            if (!this.apoapsisMesh.parent) this.scene.add(this.apoapsisMesh);
            this.apoapsisMesh.visible = true;
        } else {
            // Hide apoapsis for hyperbolic/parabolic orbits
            if (this.apoapsisMesh.parent) {
                this.apoapsisMesh.visible = false;
            }
        }

        // Return altitude information for UI display
        return {
            periapsisAltitude: apsisData.periapsis.altitude || 0,
            apoapsisAltitude: apsisData.apoapsis ? apsisData.apoapsis.altitude : null
        };
    }

    /**
     * Update visualization from orbit points (alternative method)
     * Used when apsis data is not available from service
     * @param {Array} orbitPoints - Array of orbit positions [[x,y,z], ...]
     * @param {Object} centralBody - Central body data for altitude calculation
     */
    updateFromOrbitPoints(orbitPoints, centralBody) {
        if (!orbitPoints || orbitPoints.length < 3) {
            this.setVisible(false);
            return null;
        }

        // Find periapsis (closest point) and apoapsis (farthest point)
        let minDistance = Infinity;
        let maxDistance = 0;
        let periapsisPoint = null;
        let apoapsisPoint = null;

        for (const point of orbitPoints) {
            const distance = Math.sqrt(point[0] ** 2 + point[1] ** 2 + point[2] ** 2);
            
            if (distance < minDistance) {
                minDistance = distance;
                periapsisPoint = point;
            }
            
            if (distance > maxDistance) {
                maxDistance = distance;
                apoapsisPoint = point;
            }
        }

        // Update mesh positions
        if (periapsisPoint) {
            this.periapsisMesh.position.fromArray(periapsisPoint);
            this.periapsisMesh.visible = true;
        }

        if (apoapsisPoint && Math.abs(maxDistance - minDistance) > centralBody.radius * 0.01) {
            // Only show apoapsis if it's significantly different from periapsis
            this.apoapsisMesh.position.fromArray(apoapsisPoint);
            if (!this.apoapsisMesh.parent) this.scene.add(this.apoapsisMesh);
            this.apoapsisMesh.visible = true;
        } else {
            this.apoapsisMesh.visible = false;
        }

        return {
            periapsisAltitude: minDistance - centralBody.radius,
            apoapsisAltitude: maxDistance > minDistance ? maxDistance - centralBody.radius : null
        };
    }

    /**
     * Set visibility of apsis markers
     * @param {boolean} visible - Whether to show apsis markers
     */
    setVisible(visible) {
        this.periapsisMesh.visible = visible;
        if (this.apoapsisMesh.parent) {
            this.apoapsisMesh.visible = visible;
        }
    }

    /**
     * Get current apsis positions for external use
     * @returns {Object} - Current periapsis and apoapsis positions
     */
    getCurrentPositions() {
        return {
            periapsis: this.periapsisMesh.position.toArray(),
            apoapsis: this.apoapsisMesh.visible ? this.apoapsisMesh.position.toArray() : null
        };
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
