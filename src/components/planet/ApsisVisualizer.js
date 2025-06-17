import * as THREE from 'three';

export class ApsisVisualizer {
    /** Shared sphere geometry for periapsis and apoapsis markers */
    static _sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
    /** Shared circle geometry for outlined apoapsis */
    static _circleGeometry = new THREE.RingGeometry(0.8, 1.0, 16);

    constructor(parent, color = 0xffffff, satelliteId = null) {
        this.parent = parent; // Can be orbit group or scene
        this.color = color;
        this.satelliteId = satelliteId; // For distance cache optimization
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

        // Periapsis scaling - use cached distance for better performance
        this.periapsisMesh.onBeforeRender = (renderer, scene, camera) => {
            // Try to use cached satellite distance first
            const satelliteId = `satellite_${this.satelliteId || 'unknown'}`;
            let distance = window.app3d?.distanceCache?.getDistance?.(satelliteId);
            
            // Fallback to direct calculation if cache not available
            if (!distance || distance === 0) {
                const worldPos = new THREE.Vector3();
                this.periapsisMesh.getWorldPosition(worldPos);
                distance = camera.position.distanceTo(worldPos);
            }
            
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
            // Try to use cached satellite distance first
            const satelliteId = `satellite_${this.satelliteId || 'unknown'}`;
            let distance = window.app3d?.distanceCache?.getDistance?.(satelliteId);
            
            // Fallback to direct calculation if cache not available
            if (!distance || distance === 0) {
                const worldPos = new THREE.Vector3();
                this.apoapsisMesh.getWorldPosition(worldPos);
                distance = camera.position.distanceTo(worldPos);
            }
            
            const scale = distance * 0.003;
            this.apoapsisMesh.scale.set(scale, scale, scale);
        };

        // Also apply scaling to individual rings as backup in case group onBeforeRender doesn't work
        const scaleFunction = (renderer, scene, camera) => {
            // Try to use cached satellite distance first
            const satelliteId = `satellite_${this.satelliteId || 'unknown'}`;
            let distance = window.app3d?.distanceCache?.getDistance?.(satelliteId);
            
            // Fallback to direct calculation if cache not available
            if (!distance || distance === 0) {
                const worldPos = new THREE.Vector3();
                this.apoapsisMesh.getWorldPosition(worldPos);
                distance = camera.position.distanceTo(worldPos);
            }
            
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

        // Find NEXT periapsis and apoapsis, not absolute min/max
        const nextApsisPoints = this._findNextApsisPoints(orbitPoints);
        
        if (!nextApsisPoints.periapsis && !nextApsisPoints.apoapsis) {
            this.setVisible(false);
            return null;
        }

        // Update mesh positions - use coordinates directly (same as satellite positioning)
        if (nextApsisPoints.periapsis) {
            this.periapsisMesh.position.fromArray(nextApsisPoints.periapsis.position);
            this.periapsisMesh.visible = true;
        } else {
            this.periapsisMesh.visible = false;
        }

        if (nextApsisPoints.apoapsis && 
            Math.abs(nextApsisPoints.apoapsis.distance - nextApsisPoints.periapsis?.distance || 0) > centralBody.radius * 0.01) {
            // Only show apoapsis if it's significantly different from periapsis
            this.apoapsisMesh.position.fromArray(nextApsisPoints.apoapsis.position);
            this.apoapsisMesh.visible = true;
        } else {
            this.apoapsisMesh.visible = false;
        }

        return {
            periapsisAltitude: nextApsisPoints.periapsis ? nextApsisPoints.periapsis.distance - centralBody.radius : null,
            apoapsisAltitude: nextApsisPoints.apoapsis ? nextApsisPoints.apoapsis.distance - centralBody.radius : null
        };
    }

    /**
     * Find the next periapsis and apoapsis points in the orbit
     * @private
     * @param {Array} orbitPoints - Array of orbit positions [[x,y,z], ...]
     * @returns {Object} - {periapsis: {position, distance}, apoapsis: {position, distance}}
     */
    _findNextApsisPoints(orbitPoints) {
        // Calculate distances for all points
        const pointsWithDistance = orbitPoints.map((point, index) => ({
            position: point,
            distance: Math.sqrt(point[0] ** 2 + point[1] ** 2 + point[2] ** 2),
            index: index
        }));

        let nextPeriapsis = null;
        let nextApoapsis = null;

        // Find local extrema (peaks and valleys in distance)
        for (let i = 1; i < pointsWithDistance.length - 1; i++) {
            const prev = pointsWithDistance[i - 1];
            const curr = pointsWithDistance[i];
            const next = pointsWithDistance[i + 1];

            // Check for local minimum (periapsis)
            if (curr.distance < prev.distance && curr.distance < next.distance) {
                if (!nextPeriapsis) {
                    nextPeriapsis = {
                        position: curr.position,
                        distance: curr.distance,
                        index: curr.index
                    };
                }
            }

            // Check for local maximum (apoapsis)
            if (curr.distance > prev.distance && curr.distance > next.distance) {
                if (!nextApoapsis) {
                    nextApoapsis = {
                        position: curr.position,
                        distance: curr.distance,
                        index: curr.index
                    };
                }
            }
        }

        // If we haven't found both, check the start and end points too
        // (in case apsis is at orbit boundary)
        if (!nextPeriapsis || !nextApoapsis) {
            const startPoint = pointsWithDistance[0];
            const endPoint = pointsWithDistance[pointsWithDistance.length - 1];

            // Check if start point could be an apsis
            if (pointsWithDistance.length > 2) {
                const secondPoint = pointsWithDistance[1];
                const secondLastPoint = pointsWithDistance[pointsWithDistance.length - 2];

                // Start point as periapsis
                if (!nextPeriapsis && startPoint.distance < secondPoint.distance && startPoint.distance < endPoint.distance) {
                    nextPeriapsis = {
                        position: startPoint.position,
                        distance: startPoint.distance,
                        index: startPoint.index
                    };
                }

                // Start point as apoapsis
                if (!nextApoapsis && startPoint.distance > secondPoint.distance && startPoint.distance > endPoint.distance) {
                    nextApoapsis = {
                        position: startPoint.position,
                        distance: startPoint.distance,
                        index: startPoint.index
                    };
                }

                // End point as periapsis
                if (!nextPeriapsis && endPoint.distance < secondLastPoint.distance && endPoint.distance < startPoint.distance) {
                    nextPeriapsis = {
                        position: endPoint.position,
                        distance: endPoint.distance,
                        index: endPoint.index
                    };
                }

                // End point as apoapsis
                if (!nextApoapsis && endPoint.distance > secondLastPoint.distance && endPoint.distance > startPoint.distance) {
                    nextApoapsis = {
                        position: endPoint.position,
                        distance: endPoint.distance,
                        index: endPoint.index
                    };
                }
            }
        }

        // Fallback: if still no apsis found, use global min/max as last resort
        if (!nextPeriapsis && !nextApoapsis) {
            let minDistance = Infinity;
            let maxDistance = 0;
            let minPoint = null;
            let maxPoint = null;

            for (const point of pointsWithDistance) {
                if (point.distance < minDistance) {
                    minDistance = point.distance;
                    minPoint = point;
                }
                if (point.distance > maxDistance) {
                    maxDistance = point.distance;
                    maxPoint = point;
                }
            }

            nextPeriapsis = minPoint ? {
                position: minPoint.position,
                distance: minPoint.distance,
                index: minPoint.index
            } : null;

            nextApoapsis = maxPoint ? {
                position: maxPoint.position,
                distance: maxPoint.distance,
                index: maxPoint.index
            } : null;
        }

        return { periapsis: nextPeriapsis, apoapsis: nextApoapsis };
    }

    /**
     * Update visualization from next apsis points (temporal-aware method)
     * Used by SimpleSatelliteOrbitVisualizer with proper temporal ordering
     * @param {Object} nextApsisPoints - {periapsis: {position, distance, time}, apoapsis: {position, distance, time}}
     * @param {Object} centralBody - Central body data for altitude calculation
     */
    updateFromNextApsisPoints(nextApsisPoints, centralBody) {
        if (!nextApsisPoints || (!nextApsisPoints.periapsis && !nextApsisPoints.apoapsis)) {
            this.setVisible(false);
            return null;
        }

        // Update periapsis mesh position
        if (nextApsisPoints.periapsis) {
            this.periapsisMesh.position.fromArray(nextApsisPoints.periapsis.position);
            this.periapsisMesh.visible = true;
        } else {
            this.periapsisMesh.visible = false;
        }

        // Update apoapsis mesh position
        if (nextApsisPoints.apoapsis && 
            Math.abs(nextApsisPoints.apoapsis.distance - (nextApsisPoints.periapsis?.distance || 0)) > centralBody.radius * 0.01) {
            // Only show apoapsis if it's significantly different from periapsis
            this.apoapsisMesh.position.fromArray(nextApsisPoints.apoapsis.position);
            this.apoapsisMesh.visible = true;
        } else {
            this.apoapsisMesh.visible = false;
        }

        return {
            periapsisAltitude: nextApsisPoints.periapsis ? nextApsisPoints.periapsis.distance - centralBody.radius : null,
            apoapsisAltitude: nextApsisPoints.apoapsis ? nextApsisPoints.apoapsis.distance - centralBody.radius : null
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
