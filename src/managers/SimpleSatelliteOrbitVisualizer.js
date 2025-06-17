/**
 * SatelliteOrbitVisualizer.js
 * 
 * Centralized satellite orbit visualization system with streaming support.
 * Handles all satellite orbit lines and apsis markers through physics engine events.
 * 
 * Features:
 * - Real-time orbit streaming from physics engine
 * - Proper SOI transition handling
 * - Standardized apsis visualization
 * - Performance-optimized rendering
 * - Clean separation from physics calculations
 */

import * as THREE from 'three';
import { ApsisVisualizer } from '../components/planet/ApsisVisualizer.js';

export class SimpleSatelliteOrbitVisualizer {
    constructor(app3d) {
        this.app3d = app3d;
        this.scene = app3d.scene;
        
        // Core storage
        this.satelliteOrbits = new Map(); // Map<satelliteId, OrbitVisualization>
        this.orbitLines = new Map(); // Map<satelliteId, THREE.Line>

        // Set up physics engine event streaming
        this._setupOrbitStreamListener();

        console.log('[SatelliteOrbitVisualizer] Initialized with streaming orbit support');
    }

    // ================================================================
    // PUBLIC API
    // ================================================================

    /**
     * Update satellite orbit visualization (entry point for physics engine)
     * @param {string} satelliteId - Satellite ID
     * @param {Object} satellitePhysicsState - Current physics state
     */
    updateSatelliteOrbit(satelliteId, satellitePhysicsState) {
        if (!this._isDisplayEnabled()) return;

        if (!satellitePhysicsState) {
            console.warn(`[SatelliteOrbitVisualizer] No physics state provided for satellite ${satelliteId}`);
            return;
        }

        // Ensure orbit visualization exists for streaming
        if (!this.satelliteOrbits.has(satelliteId)) {
            this._createOrbitVisualization(satelliteId);
        }

        // Orbit updates handled by streaming events from physics engine
    }

    /**
     * Remove orbit visualization for a satellite
     * @param {string} satelliteId - Satellite ID
     */
    removeOrbit(satelliteId) {
        this._removeOrbitLine(satelliteId);
        this._removeOrbitVisualization(satelliteId);
    }

    // ================================================================
    // STREAMING EVENT HANDLERS
    // ================================================================

    /**
     * Update orbit visibility for a specific satellite
     * @param {string} satelliteId - Satellite ID
     * @param {boolean} visible - Visibility state
     */
    updateVisibility(satelliteId, visible) {
        const line = this.orbitLines.get(satelliteId);
        if (line) {
            line.visible = visible;
        }

        const orbitViz = this.satelliteOrbits.get(satelliteId);
        if (orbitViz?.apsisVisualizer) {
            const showApsis = this.app3d.displaySettingsManager?.getSetting('showApsis');
            orbitViz.apsisVisualizer.setVisible(visible && showApsis);
        }
    }

    /**
     * Update satellite color for orbit visualization
     * @param {string} satelliteId - Satellite ID
     * @param {number} color - New color (hex value)
     */
    updateSatelliteColor(satelliteId, color) {
        // Update orbit line color
        const line = this.orbitLines.get(satelliteId);
        if (line?.material) {
            line.material.color.setHex(color);
        }

        // Update apsis marker colors
        const orbitViz = this.satelliteOrbits.get(satelliteId);
        if (orbitViz?.apsisVisualizer) {
            orbitViz.apsisVisualizer.updateColor(color);
        }
    }

    /**
     * Update visibility for all orbits based on display settings
     */
    updateAllVisibility() {
        const showOrbits = this.app3d.displaySettingsManager?.getSetting('showOrbits');
        const showApsis = this.app3d.displaySettingsManager?.getSetting('showApsis');

        // Update all orbit lines
        for (const line of this.orbitLines.values()) {
            line.visible = showOrbits !== false;
        }

        // Update all apsis visualizers
        for (const orbitViz of this.satelliteOrbits.values()) {
            if (orbitViz.apsisVisualizer) {
                orbitViz.apsisVisualizer.setVisible(showOrbits && showApsis);
            }
        }
    }

    /**
     * Clear all orbit visualizations
     */
    clearAll() {
        for (const satelliteId of this.orbitLines.keys()) {
            this.removeOrbit(satelliteId);
        }
    }

    /**
     * Cleanup resources and event listeners
     */
    async cleanup() {
        this.clearAll();

        // Remove event listener
        if (typeof window !== 'undefined' && this._orbitStreamHandler) {
            window.removeEventListener('orbitStreamUpdate', this._orbitStreamHandler);
            this._orbitStreamHandler = null;
        }
    }

    // Legacy compatibility methods
    removeSatelliteOrbit(satelliteId) { this.removeOrbit(satelliteId); }

    // ================================================================
    // PRIVATE IMPLEMENTATION
    // ================================================================

    /**
     * Check if orbit display is enabled
     * @private
     */
    _isDisplayEnabled() {
        const showOrbits = this.app3d?.displaySettingsManager?.getSetting('showOrbits');
        return showOrbits !== false;
    }

    /**
     * Setup event listener for streaming orbit updates from physics engine
     * @private
     */
    _setupOrbitStreamListener() {
        this._orbitStreamHandler = (event) => {
            const { satelliteId, data } = event.detail;
            this._updateOrbitFromStream(satelliteId, data);
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('orbitStreamUpdate', this._orbitStreamHandler);
        }
    }

    /**
     * Update orbit visualization from streaming data
     * @private
     */
    _updateOrbitFromStream(satelliteId, streamData) {
        if (!this._isDisplayEnabled()) return;

        const { points, metadata } = streamData;
        if (!points || points.length === 0) {
            console.warn(`[SimpleSatelliteOrbitVisualizer] No points received for satellite ${satelliteId}`);
            return;
        }

        // Get or create orbit visualization
        let orbitViz = this.satelliteOrbits.get(satelliteId);
        if (!orbitViz) {
            // Create new orbit visualization
            orbitViz = this._createOrbitVisualization(satelliteId);
            this.satelliteOrbits.set(satelliteId, orbitViz);
        }

        // Update orbit line with streaming points (convert to legacy format)
        this._updateOrbitLineFromStream(orbitViz, points);

        // Update apsis markers from stream data
        this._updateApsisMarkers(orbitViz, streamData);

        // Update progress indicator if extending
        if (metadata.isExtending) {
            this._updateProgressIndicator(orbitViz, metadata.extensionProgress);
        }
    }

    /**
     * Update apsis markers from streaming data
     * @private
     */
    _updateApsisMarkers(orbitViz, streamData) {
        const showApsis = this.app3d.displaySettingsManager?.getSetting('showApsis');
        
        if (!showApsis) {
            if (orbitViz.apsisVisualizer) {
                orbitViz.apsisVisualizer.setVisible(false);
            }
            return;
        }

        // Create apsis markers from physics-provided data
        this._findAndCreateApsisMarkers(orbitViz, streamData);
    }

    /**
     * Update apsis markers using the proper ApsisVisualizer
     * @private
     */
    _findAndCreateApsisMarkers(orbitViz, streamData) {
        // Check for apsis data from OrbitStreamer (top-level apsisData property)
        let apsisData = streamData.apsisData;
        
        // Get central body and debug parent hierarchy
        const centralBody = this._getCentralBodyForSatellite(orbitViz.satelliteId);
        
        // Fallback: Extract apsis from orbit points if no precomputed data
        if (!apsisData && streamData.points && streamData.points.length > 0) {
            if (centralBody) {
                // Convert points to position arrays for ApsisService
                const orbitPoints = streamData.points.map(point => point.position);
                apsisData = this._calculateApsisFromPoints(orbitPoints, centralBody);
            }
        }

        if (orbitViz.apsisVisualizer) {
            if (apsisData) {
                // Use the standardized ApsisVisualizer update method
                orbitViz.apsisVisualizer.update(apsisData);
            } else {
                // Fallback: use orbit points directly for apsis calculation
                if (streamData.points && streamData.points.length > 0) {
                    if (centralBody) {
                        const orbitPoints = streamData.points.map(point => point.position);
                        orbitViz.apsisVisualizer.updateFromOrbitPoints(orbitPoints, centralBody);
                    }
                } else {
                    console.warn(`[SimpleSatelliteOrbitVisualizer] No apsis data or orbit points available for satellite ${orbitViz.satelliteId}`);
                    // Hide apsis markers if no data available
                    orbitViz.apsisVisualizer.setVisible(false);
                }
            }
        } else {
            console.error(`[SimpleSatelliteOrbitVisualizer] No apsis visualizer found for satellite ${orbitViz.satelliteId}`);
        }
    }

    /**
     * Calculate apsis data from orbit points
     * @private
     */
    _calculateApsisFromPoints(orbitPoints, centralBody) {
        try {
            // Import ApsisService dynamically to avoid circular dependencies
            if (!this._apsisService) {
                import('../services/ApsisService.js').then(module => {
                    this._apsisService = module.ApsisService;
                });
                return null; // Will work on next update
            }

            return this._apsisService.getOrbitApsisPoints(orbitPoints, centralBody);
        } catch (error) {
            console.warn('[SimpleSatelliteOrbitVisualizer] Error calculating apsis from points:', error);
            return null;
        }
    }

    /**
     * Update progress indicator for orbit extension
     * @private
     */
    _updateProgressIndicator(orbitViz, progress) {
        // Implementation would add a visual progress indicator
        // For now, just log the progress
        if (progress > 0) {
            console.log(`[SimpleSatelliteOrbitVisualizer] Extension progress for ${orbitViz.satelliteId}: ${(progress * 100).toFixed(1)}%`);
        }
    }

    /**
     * Get satellite color from physics engine
     * @private
     */
    _getSatelliteColor(satelliteId) {
        const physicsEngine = this.app3d?.physicsIntegration?.physicsEngine;
        if (physicsEngine?.satelliteEngine) {
            const satellite = physicsEngine.satelliteEngine.satellites.get(satelliteId);
            return satellite?.color;
        }
        return null;
    }

    /**
     * Update orbit line with streaming points
     * @private
     */
    _updateOrbitLineFromStream(orbitViz, points) {
        if (!points || points.length === 0) return;

        // More aggressive throttling: only update every 100+ points or when extension complete
        const pointCountDiff = Math.abs(points.length - (orbitViz.lastPointCount || 0));
        const hasSignificantChange = pointCountDiff >= 100 || pointCountDiff === 0;

        // Throttle updates to prevent too frequent recreation (max 1 Hz during extension)
        const now = Date.now();
        if (now - orbitViz.lastUpdate < 1000 && !hasSignificantChange) return; // 1000ms throttle
        
        orbitViz.lastUpdate = now;
        orbitViz.lastPointCount = points.length;

        // Remove existing line
        const existingLine = this.orbitLines.get(orbitViz.satelliteId);
        if (existingLine) {
            if (existingLine.parent) {
                existingLine.parent.remove(existingLine);
            }
            existingLine.geometry.dispose();
            existingLine.material.dispose();
        }

        // Validate points have valid positions
        const validPoints = points.filter(point => 
            point.position && 
            Array.isArray(point.position) && 
            point.position.length === 3 &&
            point.position.every(coord => isFinite(coord) && coord !== 0) // Exclude origin points
        );

        if (validPoints.length < 2) {
            console.warn(`[SimpleSatelliteOrbitVisualizer] Insufficient valid points for satellite ${orbitViz.satelliteId}: ${validPoints.length}`);
            return;
        }

        // Check for suspicious origin-pointing lines by filtering out points at origin
        const nonOriginPoints = validPoints.filter(point => {
            const magnitude = Math.sqrt(
                point.position[0] * point.position[0] + 
                point.position[1] * point.position[1] + 
                point.position[2] * point.position[2]
            );
            return magnitude > 100; // Must be at least 100km from origin (above Earth's surface)
        });

        if (nonOriginPoints.length < 2) {
            console.warn(`[SimpleSatelliteOrbitVisualizer] All points too close to origin for satellite ${orbitViz.satelliteId}`);
            return;
        }

        // Create new line geometry from streaming points
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(nonOriginPoints.length * 3);
        
        for (let i = 0; i < nonOriginPoints.length; i++) {
            positions[i * 3] = nonOriginPoints[i].position[0];
            positions[i * 3 + 1] = nonOriginPoints[i].position[1];
            positions[i * 3 + 2] = nonOriginPoints[i].position[2];
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const color = this._getSatelliteColor(orbitViz.satelliteId) || 0xffff00;
        const material = new THREE.LineBasicMaterial({ 
            color,
            transparent: true,
            opacity: 0.8
        });

        // Determine if orbit should be closed (complete orbit) or open (partial)
        const isCompleteOrbit = this._isCompleteOrbit(nonOriginPoints);
        const orbitLine = isCompleteOrbit ? 
            new THREE.LineLoop(geometry, material) : 
            new THREE.Line(geometry, material);

        // Get central body for proper parenting
        const centralBody = this._getCentralBodyForSatellite(orbitViz.satelliteId);
        const orbitParent = centralBody?.getOrbitGroup?.() || centralBody?.orbitGroup || this.scene;

        // Add to parent and store
        orbitParent.add(orbitLine);
        this.orbitLines.set(orbitViz.satelliteId, orbitLine);

        // Set visibility
        const showOrbits = this.app3d.displaySettingsManager?.getSetting('showOrbits');
        orbitLine.visible = showOrbits !== false;
    }

    /**
     * Determine if the orbit points represent a complete orbit
     * @private
     */
    _isCompleteOrbit(points) {
        if (points.length < 50) return false; // Not enough points for complete orbit
        
        // Check if first and last points are reasonably close (orbit closure)
        const firstPoint = points[0].position;
        const lastPoint = points[points.length - 1].position;
        
        const distance = Math.sqrt(
            Math.pow(firstPoint[0] - lastPoint[0], 2) +
            Math.pow(firstPoint[1] - lastPoint[1], 2) +
            Math.pow(firstPoint[2] - lastPoint[2], 2)
        );
        
        const averageRadius = Math.sqrt(
            firstPoint[0] * firstPoint[0] + 
            firstPoint[1] * firstPoint[1] + 
            firstPoint[2] * firstPoint[2]
        );
        
        // Consider complete if endpoints are within 5% of orbital radius
        return distance < averageRadius * 0.05;
    }

    /**
     * Get central body for satellite
     * @private
     */
    _getCentralBodyForSatellite(satelliteId) {
        const physicsEngine = this.app3d?.physicsIntegration?.physicsEngine;
        if (physicsEngine?.satelliteEngine) {
            const satellite = physicsEngine.satelliteEngine.satellites.get(satelliteId);
            if (satellite?.centralBodyNaifId && this.app3d.bodiesByNaifId) {
                return this.app3d.bodiesByNaifId[satellite.centralBodyNaifId];
            }
        }
        return null;
    }

    /**
     * Create orbit visualization object
     * @private
     */
    _createOrbitVisualization(satelliteId) {
        // Get central body for proper parenting
        const centralBody = this._getCentralBodyForSatellite(satelliteId);
        const targetParent = centralBody?.getOrbitGroup?.() || centralBody?.orbitGroup || this.scene;

        // Get satellite color
        const satelliteColor = this._getSatelliteColor(satelliteId) || 0xffff00;

        const orbitViz = {
            satelliteId,
            orbitLine: null,
            apsisVisualizer: new ApsisVisualizer(targetParent, satelliteColor, satelliteId),
            progressIndicator: null,
            lastUpdate: 0, // Initialize throttling timestamp
            lastPointCount: 0 // Track point count for throttling
        };

        console.log(`[SimpleSatelliteOrbitVisualizer] Created orbit visualization for satellite ${satelliteId}`);
        return orbitViz;
    }

    /**
     * Remove orbit line visualization
     * @private
     */
    _removeOrbitLine(satelliteId) {
        const line = this.orbitLines.get(satelliteId);
        if (line) {
            if (line.parent) {
                line.parent.remove(line);
            }
            line.geometry.dispose();
            line.material.dispose();
            this.orbitLines.delete(satelliteId);
        }
    }

    /**
     * Remove orbit visualization object
     * @private
     */
    _removeOrbitVisualization(satelliteId) {
        const orbitViz = this.satelliteOrbits.get(satelliteId);
        if (orbitViz?.apsisVisualizer) {
            orbitViz.apsisVisualizer.dispose();
        }
        this.satelliteOrbits.delete(satelliteId);
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Clean up event listeners
        if (typeof window !== 'undefined' && this._orbitStreamHandler) {
            window.removeEventListener('orbitStreamUpdate', this._orbitStreamHandler);
        }

        // Clean up all orbit visualizations
        for (const satelliteId of this.satelliteOrbits.keys()) {
            this.removeOrbit(satelliteId);
        }

        // Clear all maps
        this.satelliteOrbits.clear();
        this.orbitLines.clear();

        console.log('[SatelliteOrbitVisualizer] Disposed of all resources');
    }
} 