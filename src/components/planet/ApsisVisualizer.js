import * as THREE from 'three';

export class ApsisVisualizer {
    /** Shared sphere geometry for periapsis and apoapsis markers */
    static _sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
    /** Shared circle geometry for outlined apoapsis */
    static _circleGeometry = new THREE.RingGeometry(0.8, 1.0, 16);

    constructor(parent, color = 0xffffff) {
        this.parent = parent; // Can be orbit group or scene
        this.color = color;
        this.isOrbitGroup = parent && parent.isGroup && parent.type !== 'Scene';

        // Create materials with satellite's orbit color
        this.periMaterial = new THREE.MeshBasicMaterial({
            color: this.color,
            opacity: 1.0,
            transparent: false
        });

        // Apoapsis uses MeshToonMaterial for cartoon-style outline effect
        this.apoMaterial = new THREE.MeshToonMaterial({
            color: this.color,
            transparent: true,
            opacity: 0.8
        });

        this.initializeApsides();
    }

    initializeApsides() {
        // Periapsis: filled sphere with satellite color
        this.periapsisMesh = new THREE.Mesh(ApsisVisualizer._sphereGeometry, this.periMaterial);

        // Apoapsis: create a toon outline effect using multiple layers
        this.createToonOutlineApoapsis();

        // Periapsis scaling
        this.periapsisMesh.onBeforeRender = (renderer, scene, camera) => {
            const worldPos = new THREE.Vector3();
            this.periapsisMesh.getWorldPosition(worldPos);
            const distance = camera.position.distanceTo(worldPos);
            const scale = distance * 0.003;
            this.periapsisMesh.scale.set(scale, scale, scale);
        };

        // Add both periapsis and apoapsis to parent (scene or group)
        this.parent.add(this.periapsisMesh);
        this.parent.add(this.apoapsisMesh);

        // Don't set initial visibility - let it be controlled by display options
    }

    /**
     * Create a toon outline effect for apoapsis using wireframe and solid combo
     */
    createToonOutlineApoapsis() {
        // Create a group to hold multiple circle outlines for a hollow sphere effect
        this.apoapsisMesh = new THREE.Group();

        // Create three ring geometries for X, Y, Z planes to simulate a hollow sphere outline
        const ringGeometry = new THREE.RingGeometry(0.7, 1.0, 32); // Much thicker ring for better visibility
        const circleMaterial = new THREE.MeshBasicMaterial({
            color: this.color,
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide
        });

        // Create three rings in different orientations
        const ringX = new THREE.Mesh(ringGeometry, circleMaterial.clone());
        const ringY = new THREE.Mesh(ringGeometry, circleMaterial.clone());
        const ringZ = new THREE.Mesh(ringGeometry, circleMaterial.clone());

        // Rotate rings to form a sphere-like outline
        ringX.rotation.x = Math.PI / 2; // XZ plane
        ringY.rotation.y = Math.PI / 2; // YZ plane  
        ringZ.rotation.z = 0;           // XY plane

        this.apoapsisMesh.add(ringX);
        this.apoapsisMesh.add(ringY);
        this.apoapsisMesh.add(ringZ);

        // Store references for color updates and disposal
        this.apoWireframe = this.apoapsisMesh;
        this.apoFill = null;
        this.apoRings = [ringX, ringY, ringZ]; // For color updates


        // Make apoapsis scale with distance - apply to group
        this.apoapsisMesh.onBeforeRender = (renderer, scene, camera) => {
            const worldPos = new THREE.Vector3();
            this.apoapsisMesh.getWorldPosition(worldPos);
            const distance = camera.position.distanceTo(worldPos);
            const scale = distance * 0.003;
            this.apoapsisMesh.scale.set(scale, scale, scale);

        };

        // Also apply scaling to individual rings as backup in case group onBeforeRender doesn't work
        const scaleFunction = (renderer, scene, camera) => {
            const worldPos = new THREE.Vector3();
            this.apoapsisMesh.getWorldPosition(worldPos);
            const distance = camera.position.distanceTo(worldPos);
            const scale = distance * 0.003;
            this.apoapsisMesh.scale.set(scale, scale, scale);
        };

        // Apply to each ring as well
        ringX.onBeforeRender = scaleFunction;
        ringY.onBeforeRender = scaleFunction;
        ringZ.onBeforeRender = scaleFunction;
    }

    /**
     * Update apsis visualization using standardized apsis data
     * @param {Object} apsisData - Data from ApsisService with periapsis/apoapsis info
     * @returns {Object} - Altitude information for UI display
     */
    update(apsisData) {

        if (!apsisData || !apsisData.periapsis) {
            this.setVisible(false);
            return null;
        }

        // Update periapsis mesh position (position comes as [x, y, z] array)
        if (apsisData.periapsis.position) {
            // Apsis positions are already planet-relative coordinates, use directly
            this.periapsisMesh.position.fromArray(apsisData.periapsis.position);
            this.periapsisMesh.visible = true;
        }

        // Update apoapsis mesh position (only for elliptical orbits)
        if (apsisData.apoapsis && apsisData.apoapsis.position) {
            // Apsis positions are already planet-relative coordinates, use directly
            this.apoapsisMesh.position.fromArray(apsisData.apoapsis.position);
            this.apoapsisMesh.visible = true;
        } else {
            // Hide apoapsis for hyperbolic/parabolic orbits
            this.apoapsisMesh.visible = false;

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

        // Update mesh positions - use coordinates directly (same as satellite positioning)
        if (periapsisPoint) {
            this.periapsisMesh.position.fromArray(periapsisPoint);
            this.periapsisMesh.visible = true;
        }

        if (apoapsisPoint && Math.abs(maxDistance - minDistance) > centralBody.radius * 0.01) {
            // Only show apoapsis if it's significantly different from periapsis
            this.apoapsisMesh.position.fromArray(apoapsisPoint);
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
        this.apoapsisMesh.visible = visible;
    }

    /**
     * Update the color of apsis markers to match satellite orbit color
     * @param {number|string} color - New color for the apsis markers
     */
    updateColor(color) {
        this.color = color;
        this.periMaterial.color.set(color);

        // Update apoapsis ring colors (using rings for hollow outline)
        if (this.apoRings) {
            this.apoRings.forEach(ring => {
                if (ring.material) {
                    ring.material.color.set(color);
                }
            });
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
        this.parent.remove(this.periapsisMesh);
        this.parent.remove(this.apoapsisMesh);

        // Dispose unique materials
        this.periMaterial.dispose();
        this.apoMaterial.dispose();

        // Dispose apoapsis ring materials
        if (this.apoRings) {
            this.apoRings.forEach(ring => {
                if (ring.material) {
                    ring.material.dispose();
                }
            });
        }

        // Don't dispose shared sphere geometry (still used by other instances)
    }
}
