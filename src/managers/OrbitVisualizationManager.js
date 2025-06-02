/**
 * OrbitVisualizationManager.js
 * 
 * Manages Three.js visualization of satellite orbits
 */
import * as THREE from 'three';
import { Bodies } from '../physics/PhysicsAPI.js';

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

        // Group points by central body AND SOI transitions to create segments
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
                    isAfterSOITransition: point.isSOIEntry || false,
                    startIndex: i
                };
                currentBodyId = point.centralBodyId;
            }
            
            currentSegment.points.push(point);
        }
        
        // Don't forget the last segment
        if (currentSegment && currentSegment.points.length > 0) {
            orbitSegments.push(currentSegment);
        }

        // === TRAJECTORY STITCHING ===
        // Add connection points between segments for visual continuity
        const stitchedSegments = this._stitchTrajectorySegments(orbitSegments, physicsEngine);

        // Create or update orbit segments
        let segmentIndex = 0;
        for (const segment of stitchedSegments) {
            const lineKey = `${satelliteId}_${segmentIndex}`;
            let line = this.orbitLines.get(lineKey);
            
            // Get the planet mesh group to add orbit to
            const planet = this.app.celestialBodies?.find(b => b.naifId === parseInt(segment.centralBodyId));
            
            // Try multiple fallback methods to find parent group
            let parentGroup = null;
            if (planet) {
                // Primary: Use getOrbitGroup() method (Planet class)
                if (typeof planet.getOrbitGroup === 'function') {
                    parentGroup = planet.getOrbitGroup();
                }
                // Fallback 1: Direct property access (for other object types)
                else if (planet.orbitGroup) {
                    parentGroup = planet.orbitGroup;
                }
                // Fallback 2: Try bodiesByNaifId lookup
                else if (this.app.bodiesByNaifId) {
                    const bodyById = this.app.bodiesByNaifId[parseInt(segment.centralBodyId)];
                    if (bodyById?.getOrbitGroup) {
                        parentGroup = bodyById.getOrbitGroup();
                    } else if (bodyById?.orbitGroup) {
                        parentGroup = bodyById.orbitGroup;
                    }
                }
            }
            
            // Final fallback: Use scene
            if (!parentGroup) {
                parentGroup = this.app.sceneManager?.scene || this.app.scene;
            }
            
            if (!parentGroup) {
                console.warn(`[OrbitVisualizationManager] No parent group found for body ${segment.centralBodyId}`);
                continue;
            }
            
            if (!line) {
                // Create new line
                const geometry = new THREE.BufferGeometry();
                const satellite = physicsEngine.satellites.get(satelliteId);
                const color = satellite?.color || 0xffff00;
                
                // Use different materials for different segment types
                let material;
                if (segment.isConnectionSegment) {
                    // Connection segments: Dotted line to show inter-SOI connections
                    material = new THREE.LineDashedMaterial({
                        color: segment.isTimeCompensated ? 0x00ff00 : color, // Green if time-compensated
                        opacity: 0.8,
                        transparent: true,
                        dashSize: 3,
                        gapSize: 3
                    });
                } else if (segment.isAfterSOITransition) {
                    // Post-SOI segments: Dashed line
                    material = new THREE.LineDashedMaterial({
                        color: segment.isTimeCompensated ? 0x00ffff : color, // Cyan if time-compensated
                        opacity: 0.6,
                        transparent: true,
                        dashSize: 10,
                        gapSize: 5
                    });
                } else {
                    // Regular segments: Solid line
                    material = new THREE.LineBasicMaterial({
                        color: color,
                        opacity: 0.6,
                        transparent: true
                    });
                }
                
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
            if (segment.isAfterSOITransition || segment.isConnectionSegment) {
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
     * Stitch trajectory segments for visual continuity across SOI boundaries
     * @private
     */
    _stitchTrajectorySegments(orbitSegments, physicsEngine) {
        if (orbitSegments.length <= 1) {
            return orbitSegments; // No stitching needed for single segment
        }

        const stitchedSegments = [];
        
        for (let i = 0; i < orbitSegments.length; i++) {
            const currentSegment = orbitSegments[i];
            stitchedSegments.push(currentSegment);
            
            // Add connection line to next segment if there is one
            if (i < orbitSegments.length - 1) {
                const nextSegment = orbitSegments[i + 1];
                const connectionSegment = this._createConnectionSegment(
                    currentSegment, 
                    nextSegment, 
                    physicsEngine
                );
                
                if (connectionSegment) {
                    stitchedSegments.push(connectionSegment);
                }
            }
        }
        
        return stitchedSegments;
    }

    /**
     * Create a connection segment between two orbit segments
     * @private
     */
    _createConnectionSegment(fromSegment, toSegment, physicsEngine) {
        if (!fromSegment.points.length || !toSegment.points.length) {
            return null;
        }
        
        // Get the last point of the first segment and first point of the second segment
        const fromPoint = fromSegment.points[fromSegment.points.length - 1];
        const toPoint = toSegment.points[0];
        
        // Transform both points to a common reference frame (the parent of both central bodies)
        const fromGlobalPos = this._transformToGlobalPosition(fromPoint, physicsEngine);
        const toGlobalPos = this._transformToGlobalPosition(toPoint, physicsEngine);
        
        // Find common parent for rendering the connection
        const commonParent = this._findCommonParent(
            fromSegment.centralBodyId, 
            toSegment.centralBodyId, 
            physicsEngine
        );
        
        if (!commonParent) {
            return null;
        }
        
        // Create connection points relative to common parent at the transition time
        const transitionTime = fromPoint.time || toPoint.time;
        const connectionPoints = [
            this._transformToRelativePosition(fromGlobalPos, commonParent, physicsEngine, transitionTime),
            this._transformToRelativePosition(toGlobalPos, commonParent, physicsEngine, transitionTime)
        ];
        
        return {
            centralBodyId: commonParent,
            points: connectionPoints.map(pos => ({
                position: pos.toArray(),
                time: transitionTime, // Use time from transition
                centralBodyId: commonParent,
                isSOITransition: true,
                isTimeCompensated: !!transitionTime // Mark if time-aware positioning was used
            })),
            isAfterSOITransition: true,
            isConnectionSegment: true, // Mark as connection for special rendering
            isTimeCompensated: !!transitionTime // Mark segment as using time-aware coordinates
        };
    }

    /**
     * Transform orbit point to global position using time-aware planetary positions
     * @private
     */
    _transformToGlobalPosition(point, physicsEngine) {
        // Get the central body's position at the specific time of this orbit point
        const centralBodyPos = this._getBodyPositionAtTime(point.centralBodyId, point.time, physicsEngine);
        if (!centralBodyPos) {
            return new THREE.Vector3(...point.position);
        }
        
        const relativePos = new THREE.Vector3(...point.position);
        return relativePos.add(centralBodyPos);
    }

    /**
     * Transform global position to relative position of target body at specific time
     * @private
     */
    _transformToRelativePosition(globalPos, targetBodyId, physicsEngine, time = null) {
        // Get the target body's position at the specified time
        const targetBodyPos = this._getBodyPositionAtTime(targetBodyId, time, physicsEngine);
        if (!targetBodyPos) {
            return globalPos.clone();
        }
        
        return globalPos.clone().sub(targetBodyPos);
    }

    /**
     * Get body position at specific time, with fallback to current position
     * @private
     */
    _getBodyPositionAtTime(bodyId, time, physicsEngine) {
        try {
            // If time is provided and we have time-aware position capability
            if (time && Bodies.getPosition) {
                // Get body name from NAIF ID for Bodies.getPosition
                const bodyName = this._getBodyNameFromNaifId(bodyId, physicsEngine);
                if (bodyName) {
                    // Convert time to appropriate format (Bodies.getPosition expects Date)
                    const timeDate = time instanceof Date ? time : new Date(time);
                    const timePosition = Bodies.getPosition(bodyName, timeDate);
                    if (timePosition && timePosition.length >= 3) {
                        return new THREE.Vector3(...timePosition);
                    }
                }
            }
        } catch (error) {
            console.warn(`[OrbitVisualizationManager] Error getting time-aware position for body ${bodyId}:`, error);
        }
        
        // Fallback to current position from physics engine
        const currentBody = physicsEngine.bodies[bodyId];
        if (currentBody && currentBody.position) {
            return new THREE.Vector3(...currentBody.position);
        }
        
        console.warn(`[OrbitVisualizationManager] No position available for body ${bodyId}`);
        return null;
    }

    /**
     * Get body name from NAIF ID for time-aware position lookups
     * @private
     */
    _getBodyNameFromNaifId(naifId, physicsEngine) {
        const bodyData = physicsEngine.bodies[naifId];
        if (bodyData && bodyData.name) {
            return bodyData.name.toLowerCase();
        }
        
        // Common NAIF ID mappings as fallback
        const naifMap = {
            0: 'ss_barycenter',
            10: 'sun',
            399: 'earth',
            301: 'moon',
            499: 'mars',
            599: 'jupiter',
            699: 'saturn',
            799: 'uranus',
            899: 'neptune'
        };
        
        return naifMap[parseInt(naifId)] || null;
    }

    /**
     * Find common parent body for two central bodies
     * @private
     */
    _findCommonParent(bodyId1, bodyId2, physicsEngine) {
        // Use the physics engine's hierarchy if available
        if (physicsEngine.hierarchy) {
            return this._findCommonParentUsingHierarchy(bodyId1, bodyId2, physicsEngine.hierarchy);
        }
        
        // Fallback to simple heuristics
        const id1 = Number(bodyId1);
        const id2 = Number(bodyId2);
        
        // If same body, return that body
        if (id1 === id2) return id1;
        
        // If one is Earth (399) and other is Moon (301), use Earth
        if ((id1 === 399 && id2 === 301) || (id1 === 301 && id2 === 399)) {
            return 399;
        }
        
        // If either is the Sun (10), use Sun
        if (id1 === 10 || id2 === 10) {
            return 10;
        }
        
        // Default to Solar System Barycenter
        return 0;
    }

    /**
     * Find common parent using hierarchy data
     * @private
     */
    _findCommonParentUsingHierarchy(bodyId1, bodyId2, hierarchy) {
        const id1 = Number(bodyId1);
        const id2 = Number(bodyId2);
        
        if (id1 === id2) return id1;
        
        // Get parent chains for both bodies
        const getParentChain = (bodyId) => {
            const chain = [bodyId];
            let current = bodyId;
            while (hierarchy[current] && hierarchy[current].parent !== null) {
                current = hierarchy[current].parent;
                chain.push(current);
            }
            return chain;
        };
        
        const chain1 = getParentChain(id1);
        const chain2 = getParentChain(id2);
        
        // Find the first common ancestor
        for (const ancestor1 of chain1) {
            if (chain2.includes(ancestor1)) {
                return ancestor1;
            }
        }
        
        // Default to Solar System Barycenter
        return 0;
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