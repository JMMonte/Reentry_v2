/**
 * OrbitVisualizationManager.js
 * 
 * Manages Three.js visualization of satellite orbits
 */
import * as THREE from 'three';

export class OrbitVisualizationManager {
    constructor(app) {
        this.app = app;
        this.orbitLines = new Map(); // lineKey -> THREE.Line
        this.orbitSegmentCounts = new Map(); // satelliteId -> number of segments
    }

    /**
     * Update Three.js visualization
     */
    updateOrbitVisualization(satelliteId, points, workerTransitions = [], physicsEngine, displaySettings) {
        if (points.length < 2) {
            return;
        }

        // Determine how many points to actually display
        const satellite = physicsEngine.satellites.get(satelliteId);
        if (!satellite) return;
        
        // Get per-satellite simulation properties, fall back to global display settings
        const satelliteProps = satellite.orbitSimProperties || {};
        
        // For now, just show all points - the orbit should be continuous
        // The physics engine will handle showing the correct portion based on time
        const displayPoints = points;

        // Group points by central body AND SOI transitions to create discontinuous segments
        const orbitSegments = [];
        let currentSegment = null;
        let currentBodyId = null;
        
        for (let i = 0; i < displayPoints.length; i++) {
            const point = displayPoints[i];
            
            // Start a new segment if:
            // 1. This is the first point
            // 2. The central body changed
            // 3. This point is marked as SOI entry
            if (!currentSegment || currentBodyId !== point.centralBodyId || point.isSOIEntry) {
                // Save previous segment if it exists
                if (currentSegment && currentSegment.points.length > 0) {
                    orbitSegments.push(currentSegment);
                }
                
                // Start new segment
                currentSegment = {
                    centralBodyId: point.centralBodyId,
                    points: [],
                    isAfterSOITransition: point.isSOIEntry || false
                };
                currentBodyId = point.centralBodyId;
            }
            
            currentSegment.points.push(point);
        }
        
        // Don't forget the last segment
        if (currentSegment && currentSegment.points.length > 0) {
            orbitSegments.push(currentSegment);
        }

        // Create or update orbit segments
        let segmentIndex = 0;
        for (const segment of orbitSegments) {
            const lineKey = `${satelliteId}_${segmentIndex}`;
            let line = this.orbitLines.get(lineKey);
            
            // Get the planet mesh group to add orbit to
            const planet = this.app.celestialBodies?.find(b => b.naifId === parseInt(segment.centralBodyId));
            // Use orbitGroup to match where satellite mesh is added (see Satellite.js _initVisuals)
            const parentGroup = planet?.orbitGroup || this.app.sceneManager?.scene;
            
            if (!parentGroup) {
                console.warn(`[OrbitVisualizationManager] No parent group found for body ${segment.centralBodyId}`);
                continue;
            }
            
            if (!line) {
                // Create new line
                const geometry = new THREE.BufferGeometry();
                const satellite = physicsEngine.satellites.get(satelliteId);
                const color = satellite?.color || 0xffff00;
                
                // Use dashed line for segments after SOI transitions
                const material = segment.isAfterSOITransition ? 
                    new THREE.LineDashedMaterial({
                        color: color,
                        opacity: 0.6,
                        transparent: true,
                        dashSize: 10,
                        gapSize: 5
                    }) :
                    new THREE.LineBasicMaterial({
                        color: color,
                        opacity: 0.6,
                        transparent: true
                    });
                
                line = new THREE.Line(geometry, material);
                line.frustumCulled = false;
                line.name = `orbit_${satelliteId}_segment_${segmentIndex}`;
                
                // Add to parent body's mesh group
                parentGroup.add(line);
                this.orbitLines.set(lineKey, line);
            }

            // Update geometry with positions relative to parent body
            const positions = new Float32Array(segment.points.length * 3);
            
            for (let i = 0; i < segment.points.length; i++) {
                const point = segment.points[i];
                // Positions are already relative to central body
                positions[i * 3] = point.position[0];
                positions[i * 3 + 1] = point.position[1];
                positions[i * 3 + 2] = point.position[2];
            }

            line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            line.geometry.setDrawRange(0, segment.points.length);
            line.geometry.computeBoundingSphere();
            
            // Compute line distances for dashed lines
            if (segment.isAfterSOITransition) {
                line.computeLineDistances();
            }
            
            segmentIndex++;
        }

        // Store the number of segments for this satellite
        this.orbitSegmentCounts.set(satelliteId, segmentIndex);
        
        // Update visibility based on display settings
        const visible = displaySettings?.getSetting('showOrbits') ?? true;
        
        for (let i = 0; i < segmentIndex; i++) {
            const line = this.orbitLines.get(`${satelliteId}_${i}`);
            if (line) {
                line.visible = visible;
            }
        }
    }

    /**
     * Update satellite color
     */
    updateSatelliteColor(satelliteId, color) {
        const segmentCount = this.orbitSegmentCounts.get(satelliteId) || 0;
        for (let i = 0; i < segmentCount; i++) {
            const line = this.orbitLines.get(`${satelliteId}_${i}`);
            if (line) {
                line.material.color.set(color);
            }
        }
    }

    /**
     * Remove satellite orbit visualization
     */
    removeSatelliteOrbit(satelliteId) {
        // Remove all orbit segments
        const segmentCount = this.orbitSegmentCounts.get(satelliteId) || 0;
        for (let i = 0; i < segmentCount; i++) {
            const lineKey = `${satelliteId}_${i}`;
            const line = this.orbitLines.get(lineKey);
            if (line) {
                if (line.parent) {
                    line.parent.remove(line);
                }
                line.geometry.dispose();
                line.material.dispose();
                this.orbitLines.delete(lineKey);
            }
        }
        this.orbitSegmentCounts.delete(satelliteId);
    }

    /**
     * Update visibility based on display settings
     */
    updateVisibility(visible) {
        this.orbitLines.forEach(line => {
            line.visible = visible;
        });
    }

    /**
     * Clear all orbit visualizations
     */
    clearAll() {
        // Clear all visualizations
        for (const satelliteId of this.orbitSegmentCounts.keys()) {
            this.removeSatelliteOrbit(satelliteId);
        }
    }

    /**
     * Create maneuver prediction orbit line
     */
    createManeuverPredictionLine(orbitPoints, satellite, isPreview = false, parentGroup) {
        const positions = orbitPoints.map(p => new THREE.Vector3(...p.position));
        const geometry = new THREE.BufferGeometry().setFromPoints(positions);
        
        const material = new THREE.LineDashedMaterial({
            color: isPreview ? 0xffffff : (satellite.color || 0xffffff),
            dashSize: isPreview ? 8 : 5,
            gapSize: isPreview ? 8 : 5,
            linewidth: 2,
            transparent: true,
            opacity: isPreview ? 0.5 : 0.7
        });
        
        const orbitLine = new THREE.Line(geometry, material);
        orbitLine.computeLineDistances();
        orbitLine.frustumCulled = false;
        
        if (parentGroup) {
            parentGroup.add(orbitLine);
        }
        
        return orbitLine;
    }

    /**
     * Update existing maneuver prediction line
     */
    updateManeuverPredictionLine(orbitLine, orbitPoints) {
        const positions = new Float32Array(orbitPoints.length * 3);
        for (let i = 0; i < orbitPoints.length; i++) {
            const point = orbitPoints[i];
            positions[i * 3] = point.position[0];
            positions[i * 3 + 1] = point.position[1];
            positions[i * 3 + 2] = point.position[2];
        }
        orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        orbitLine.geometry.attributes.position.needsUpdate = true;
        orbitLine.computeLineDistances();
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.clearAll();
        this.orbitLines.clear();
        this.orbitSegmentCounts.clear();
        this.app = null;
    }
}