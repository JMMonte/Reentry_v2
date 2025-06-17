/**
 * UnifiedManeuverVisualizer.js
 * 
 * Single system that handles ALL maneuver visualization:
 * - Preview nodes (while editing)
 * - Permanent nodes (after adding)
 * - Nested maneuvers (chained)
 * 
 * Replaces: SimpleManeuverPreview, ManeuverOrbitHandler, ManeuverPreviewSystem,
 * ManeuverPreviewManager, ManeuverVisualizationManager, and related hooks
 */

import * as THREE from 'three';
import { Orbital } from '../physics/PhysicsAPI.js';
import { analyzeOrbit, calculatePropagationParameters } from '../physics/integrators/OrbitalIntegrators.js';
import { UnifiedSatellitePropagator } from '../physics/core/UnifiedSatellitePropagator.js';

export class UnifiedManeuverVisualizer {
    /** Shared sphere geometry for all maneuver nodes */
    static _sphereGeometry = new THREE.SphereGeometry(1, 16, 16);

    constructor(app3d) {
        this.app3d = app3d;
        this.visualizations = new Map(); // satelliteId -> { preview, permanentNodes }
        this.lastPreviewParams = new Map(); // satelliteId -> { deltaV, executionTime }
    }

    /**
     * Create or update maneuver preview (temporary, while editing)
     */
    async createPreview(satellite, deltaV, executionTime) {
        try {
            const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
            if (!physicsEngine) {
                console.warn('[UnifiedManeuverVisualizer] No physics engine available');
                return;
            }

            // Check if parameters have changed significantly to avoid unnecessary updates
            const lastParams = this.lastPreviewParams.get(satellite.id);
            if (lastParams) {
                const dvChanged = Math.abs(deltaV.prograde - lastParams.deltaV.prograde) > 0.001 ||
                    Math.abs(deltaV.normal - lastParams.deltaV.normal) > 0.001 ||
                    Math.abs(deltaV.radial - lastParams.deltaV.radial) > 0.001;
                const timeChanged = Math.abs(executionTime.getTime() - lastParams.executionTime.getTime()) > 1000; // 1 second tolerance

                if (!dvChanged && !timeChanged) {
                    return; // Skip update if nothing significant changed
                }
            }

            // Store current parameters
            this.lastPreviewParams.set(satellite.id, {
                deltaV: { ...deltaV },
                executionTime: new Date(executionTime)
            });

            // Clear any existing preview for this satellite
            this.clearPreview(satellite.id);

            // Use PhysicsAPI for all physics calculations (handles nested maneuvers)
            const previewResult = this._calculateManeuverWithSmartPropagation({
                satellite,
                deltaV,
                executionTime,
                physicsEngine,
                isPreview: true // Include existing nodes in calculation
            });

            if (previewResult.error || !previewResult.maneuverPosition) {
                console.warn('[UnifiedManeuverVisualizer] Failed to generate preview:', previewResult.error);
                return;
            }

            // Get or create visualization container for this satellite
            if (!this.visualizations.has(satellite.id)) {
                this.visualizations.set(satellite.id, { preview: null, permanentNodes: new Map() });
            }

            const container = this.visualizations.get(satellite.id);

            // Find parent group (same as satellite's orbit)
            const orbitGroup = satellite.planetConfig?.getOrbitGroup?.() || satellite.planetConfig?.orbitGroup;
            const parent = orbitGroup || satellite.scene || this.app3d.scene;

            // Create preview node (orange sphere)
            const previewNode = this._createManeuverNode({
                position: previewResult.maneuverPosition,
                color: 0xffa500, // Orange for preview
                parent
            });

            // Create preview orbit (white dashed line)
            let previewOrbit = null;
            if (previewResult.orbitPoints && previewResult.orbitPoints.length > 2) {
                previewOrbit = this._createOrbitLine({
                    points: previewResult.orbitPoints,
                    color: 0xffffff, // White for preview
                    opacity: 0.7,
                    dashed: true,
                    parent
                });
            }

            // Store preview
            container.preview = {
                node: previewNode,
                orbit: previewOrbit,
                parent
            };


        } catch (error) {
            console.error('[UnifiedManeuverVisualizer] Error creating preview:', error);
        }
    }

    /**
     * Handle when a maneuver node is added - create it and recalculate subsequent nodes
     */
    async handleManeuverNodeAdded(satellite, newManeuverNode) {
        // Create the new permanent node
        await this.createPermanentNode(satellite, newManeuverNode);

        // Get all maneuver nodes for this satellite from physics engine
        const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
        const allNodes = physicsEngine?.satelliteEngine?.getManeuverNodes?.(satellite.id) || [];

        if (allNodes.length <= 1) {
            return; // No subsequent nodes to recalculate
        }

        // Sort nodes by execution time
        const sortedNodes = allNodes.sort((a, b) => a.executionTime.getTime() - b.executionTime.getTime());

        // Find the index of the new node
        const newNodeIndex = sortedNodes.findIndex(node => node.id === newManeuverNode.id);

        if (newNodeIndex === -1 || newNodeIndex === sortedNodes.length - 1) {
            return; // New node not found or is the last node
        }

        // Recalculate all nodes that come after the new node
        for (let i = newNodeIndex + 1; i < sortedNodes.length; i++) {
            const nodeToRecalculate = sortedNodes[i];
            await this.recalculatePermanentNode(satellite, nodeToRecalculate);
        }
    }

    /**
     * Recalculate and update an existing permanent node visualization
     */
    async recalculatePermanentNode(satellite, maneuverNode) {
        // Remove existing visualization
        this.removePermanentNode(satellite.id, maneuverNode.id);

        // Create new visualization with updated physics
        await this.createPermanentNode(satellite, maneuverNode);
    }

    /**
     * Create permanent maneuver visualization (after user adds maneuver)
     */
    async createPermanentNode(satellite, maneuverNode) {
        try {
            const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
            if (!physicsEngine) {
                console.warn('[UnifiedManeuverVisualizer] No physics engine available');
                return;
            }

            // Use PhysicsAPI for physics calculations (include existing nodes for nested maneuvers)
            const result = this._calculateManeuverWithSmartPropagation({
                satellite,
                deltaV: maneuverNode.deltaV,
                executionTime: maneuverNode.executionTime,
                physicsEngine,
                isPreview: true // Include existing nodes for proper nested positioning
            });

            if (result.error || !result.maneuverPosition) {
                console.warn('[UnifiedManeuverVisualizer] Failed to generate permanent node:', result.error);
                return;
            }

            // Get or create visualization container
            if (!this.visualizations.has(satellite.id)) {
                this.visualizations.set(satellite.id, { preview: null, permanentNodes: new Map() });
            }

            const container = this.visualizations.get(satellite.id);

            // Find parent group
            const orbitGroup = satellite.planetConfig?.getOrbitGroup?.() || satellite.planetConfig?.orbitGroup;
            const parent = orbitGroup || satellite.scene || this.app3d.scene;

            // Create permanent node (satellite color)
            const permanentNode = this._createManeuverNode({
                position: result.maneuverPosition,
                color: satellite.color || 0xffffff,
                parent
            });

            // Create permanent orbit (satellite color, solid line)
            let permanentOrbit = null;
            if (result.orbitPoints && result.orbitPoints.length > 2) {
                permanentOrbit = this._createOrbitLine({
                    points: result.orbitPoints,
                    color: satellite.color || 0xffffff,
                    opacity: 0.8,
                    dashed: false,
                    parent
                });
            }

            // Store permanent visualization
            container.permanentNodes.set(maneuverNode.id, {
                node: permanentNode,
                orbit: permanentOrbit,
                parent
            });

        } catch (error) {
            console.error('[UnifiedManeuverVisualizer] Error creating permanent node:', error);
        }
    }

    /**
     * Clear preview for a satellite
     */
    clearPreview(satelliteId) {
        const container = this.visualizations.get(satelliteId);
        if (container?.preview) {
            this._removeVisualization(container.preview);
            container.preview = null;
        }

        // Clear stored parameters
        this.lastPreviewParams.delete(satelliteId);
    }

    /**
     * Handle when a maneuver node is removed - remove it and recalculate subsequent nodes
     */
    async handleManeuverNodeRemoved(satellite, removedNodeId) {
        // Remove the visualization
        this.removePermanentNode(satellite.id, removedNodeId);

        // Get all remaining nodes (after physics engine has removed the node)
        const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
        const remainingNodes = physicsEngine?.satelliteEngine?.getManeuverNodes?.(satellite.id) || [];

        if (remainingNodes.length === 0) {
            return; // No nodes left to recalculate
        }

        // Sort remaining nodes by execution time
        const sortedNodes = remainingNodes.sort((a, b) => a.executionTime.getTime() - b.executionTime.getTime());

        // Recalculate all remaining nodes since the removal changes the cascade
        // (We don't know exactly which nodes came after the removed one, so recalculate all)
        for (const nodeToRecalculate of sortedNodes) {
            await this.recalculatePermanentNode(satellite, nodeToRecalculate);
        }
    }

    /**
     * Remove permanent maneuver node
     */
    removePermanentNode(satelliteId, nodeId) {
        const container = this.visualizations.get(satelliteId);
        if (container?.permanentNodes.has(nodeId)) {
            const visualization = container.permanentNodes.get(nodeId);
            this._removeVisualization(visualization);
            container.permanentNodes.delete(nodeId);
        }
    }

    /**
     * Clear all visualizations for a satellite
     */
    clearSatellite(satelliteId) {
        const container = this.visualizations.get(satelliteId);
        if (container) {
            // Clear preview
            if (container.preview) {
                this._removeVisualization(container.preview);
            }

            // Clear all permanent nodes
            for (const visualization of container.permanentNodes.values()) {
                this._removeVisualization(visualization);
            }
        }

        this.visualizations.delete(satelliteId);
        this.lastPreviewParams.delete(satelliteId);
    }

    /**
     * Create a maneuver node mesh
     * @private
     */
    _createManeuverNode({ position, color, parent }) {
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9
        });

        const nodeMesh = new THREE.Mesh(UnifiedManeuverVisualizer._sphereGeometry, material);
        nodeMesh.position.set(position[0], position[1], position[2]);

        // Add camera-distance scaling
        nodeMesh.onBeforeRender = (renderer, scene, camera) => {
            const worldPos = new THREE.Vector3();
            nodeMesh.getWorldPosition(worldPos);
            // Use cached distance for better performance
            const satelliteId = `satellite_${this.satelliteId || 'unknown'}`;
            let distance = window.app3d?.distanceCache?.getDistance?.(satelliteId);
            
            // Fallback to direct calculation if cache not available
            if (!distance || distance === 0) {
                distance = camera.position.distanceTo(worldPos);
            }
            const scaleFactor = distance * 0.003;
            nodeMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        };

        parent.add(nodeMesh);

        return { mesh: nodeMesh, material, parent };
    }

    /**
     * Create orbit line visualization
     * @private
     */
    _createOrbitLine({ points, color, opacity, dashed, parent }) {
        if (!points || points.length < 2) {
            return null;
        }

        // Create line using direct THREE.js (OrbitVisualizationManager removed)
        const positions = new Float32Array(points.length * 3);

        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            // Handle both array and object formats
            if (Array.isArray(point.position)) {
                positions[i * 3] = point.position[0];
                positions[i * 3 + 1] = point.position[1];
                positions[i * 3 + 2] = point.position[2];
            } else if (point.position) {
                positions[i * 3] = point.position.x || 0;
                positions[i * 3 + 1] = point.position.y || 0;
                positions[i * 3 + 2] = point.position.z || 0;
            } else {
                // Fallback if point is the position itself
                positions[i * 3] = point[0] || point.x || 0;
                positions[i * 3 + 1] = point[1] || point.y || 0;
                positions[i * 3 + 2] = point[2] || point.z || 0;
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = dashed
            ? new THREE.LineDashedMaterial({
                color,
                dashSize: 10,
                gapSize: 5,
                opacity,
                transparent: true
            })
            : new THREE.LineBasicMaterial({
                color,
                opacity,
                transparent: true
            });

        const orbitLine = new THREE.Line(geometry, material);

        if (dashed) {
            orbitLine.computeLineDistances();
        }

        orbitLine.frustumCulled = false;
        parent.add(orbitLine);

        return { line: orbitLine, geometry, material, parent };
    }

    /**
     * Remove visualization from scene
     * @private
     */
    _removeVisualization(visualization) {
        // Handle maneuver node removal
        if (visualization.mesh && visualization.parent) {
            visualization.parent.remove(visualization.mesh);
            visualization.material.dispose();
        }

        // Handle old-style orbit line removal
        if (visualization.line && visualization.parent) {
            visualization.parent.remove(visualization.line);
            visualization.geometry.dispose();
            visualization.material.dispose();
        }

        // Handle new satellite orbit system removal
        if (visualization.orbit && visualization.orbit.isTemporary) {
            visualization.orbit.cleanup();
        }

        // Recursive cleanup for nested visualizations
        if (visualization.node) {
            this._removeVisualization(visualization.node);
        }

        if (visualization.orbit && !visualization.orbit.isTemporary) {
            this._removeVisualization(visualization.orbit);
        }
    }

    /**
     * Enhanced maneuver calculation with smart orbit propagation for eccentric orbits
     * @private
     */
    _calculateManeuverWithSmartPropagation(params) {
        try {
            // First get the basic maneuver result from PhysicsAPI
            const basicResult = Orbital.previewManeuver(params);

            if (basicResult.error || !basicResult.maneuverPosition || !basicResult.postManeuverVelocity) {
                return basicResult;
            }

            // Check if we need enhanced propagation based on orbit characteristics
            const needsEnhancement = this._shouldEnhanceOrbitPropagation(
                basicResult.maneuverPosition,
                basicResult.postManeuverVelocity,
                params.satellite,
                params.physicsEngine,
                basicResult.orbitPoints
            );

            if (needsEnhancement) {

                const enhancedOrbitPoints = this._generateEnhancedOrbitPoints({
                    position: basicResult.maneuverPosition,
                    velocity: basicResult.postManeuverVelocity,
                    satellite: params.satellite,
                    physicsEngine: params.physicsEngine
                });

                return {
                    ...basicResult,
                    orbitPoints: enhancedOrbitPoints
                };
            }

            return basicResult;

        } catch (error) {
            console.error('[UnifiedManeuverVisualizer] Error in smart propagation:', error);
            return {
                maneuverPosition: null,
                postManeuverVelocity: null,
                orbitPoints: [],
                error: error.message
            };
        }
    }

    /**
     * Determine if orbit propagation should be enhanced
     * @private
     */
    _shouldEnhanceOrbitPropagation(position, velocity, satellite, physicsEngine, existingPoints) {
        try {
            // Always enhance if we have too few points
            if (!existingPoints || existingPoints.length < 50) {
                return true;
            }

            // Get central body data
            const centralBodyId = satellite.centralBodyNaifId;
            const centralBody = physicsEngine.bodies[centralBodyId];
            if (!centralBody) return false;

            // Create mock satellite for analysis
            const mockSatellite = {
                position: Array.isArray(position) ? position : [position.x, position.y, position.z],
                velocity: Array.isArray(velocity) ? velocity : [velocity.x, velocity.y, velocity.z],
                centralBodyNaifId: centralBodyId
            };

            // Analyze the orbit type
            const G = 6.67430e-20; // km³/kg/s²
            const orbitParams = analyzeOrbit(mockSatellite, centralBody, G);

            // Enhance for high eccentricity (> 0.7) or hyperbolic/parabolic orbits
            if (orbitParams.eccentricity > 0.7 || orbitParams.type !== 'elliptical') {
                return true;
            }

            return false;

        } catch (error) {
            console.warn('[UnifiedManeuverVisualizer] Error analyzing orbit for enhancement:', error);
            // If analysis fails, enhance as a safety measure
            return true;
        }
    }

    /**
     * Generate enhanced orbit points for eccentric trajectories
     * @private
     */
    _generateEnhancedOrbitPoints({ position, velocity, satellite, physicsEngine }) {
        try {
            // Use imported orbit analysis functions

            // Get central body data
            const centralBodyId = satellite.centralBodyNaifId;
            const centralBody = physicsEngine.bodies[centralBodyId];

            if (!centralBody) {
                throw new Error(`Central body ${centralBodyId} not found`);
            }

            // Create mock satellite for analysis
            const mockSatellite = {
                position: Array.isArray(position) ? position : [position.x, position.y, position.z],
                velocity: Array.isArray(velocity) ? velocity : [velocity.x, velocity.y, velocity.z],
                centralBodyNaifId: centralBodyId,
                mass: satellite.mass || 1000,
                crossSectionalArea: satellite.crossSectionalArea || 2.0, // Realistic satellite cross-section
                dragCoefficient: satellite.dragCoefficient || 2.2
            };

            // Analyze the orbit type
            const G = 6.67430e-20; // km³/kg/s²
            const orbitParams = analyzeOrbit(mockSatellite, centralBody, G);


            let propagationParams;
            let targetPointCount = 500; // Higher resolution for eccentric orbits

            if (orbitParams.type === 'elliptical') {
                if (orbitParams.eccentricity > 0.95) {
                    // Extremely eccentric ellipse - use much longer duration and high resolution
                    propagationParams = calculatePropagationParameters(orbitParams, 2.0, targetPointCount);
                } else if (orbitParams.eccentricity > 0.8) {
                    // Very eccentric ellipse - use longer duration and more points
                    propagationParams = calculatePropagationParameters(orbitParams, 1.5, targetPointCount);
                } else {
                    // Moderately eccentric ellipse
                    propagationParams = calculatePropagationParameters(orbitParams, 1.2, 300);
                }
            } else {
                // Parabolic or hyperbolic - use much more aggressive distance-based propagation
                const currentRadius = Math.sqrt(position[0] ** 2 + position[1] ** 2 + position[2] ** 2);
                const soiRadius = centralBody.soiRadius || 1e6; // Default SOI

                // Use much larger propagation distance for escape trajectories
                const maxPropDistance = Math.min(soiRadius * 0.9, currentRadius * 50); // Up to 50x current distance

                // Estimate time to reach max distance
                // const velocityMag = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
                const radialVel = (position[0] * velocity[0] + position[1] * velocity[1] + position[2] * velocity[2]) / currentRadius;

                let estimatedTime;
                if (radialVel > 0) {
                    // Escaping - estimate time to reach boundary
                    estimatedTime = (maxPropDistance - currentRadius) / radialVel;
                } else {
                    // Not escaping or incoming - use much longer fixed duration
                    estimatedTime = orbitParams.period || 86400 * 3; // 3 days default for hyperbolic
                }

                // Much more generous time limits for escape trajectories
                estimatedTime = Math.max(3600 * 6, Math.min(estimatedTime, 86400 * 30)); // 6 hours to 30 days

                propagationParams = {
                    maxDuration: estimatedTime,
                    timeStep: estimatedTime / targetPointCount
                };

            }

            // Propagate the orbit with enhanced parameters including all physics effects
            // Use current time as startTime
            const currentTime = new Date();
            const startTimeSeconds = currentTime.getTime() / 1000;
            
            const orbitPoints = UnifiedSatellitePropagator.propagateOrbit({
                satellite: mockSatellite,
                bodies: physicsEngine.bodies,
                duration: propagationParams.maxDuration,
                timeStep: propagationParams.timeStep,
                startTime: startTimeSeconds, // Use current time
                includeJ2: true,
                includeDrag: true,      // ← Now enabled for realistic maneuver orbits
                includeThirdBody: true  // ← Now enabled for full N-body physics
            });

            return orbitPoints || [];

        } catch (error) {
            console.warn('[UnifiedManeuverVisualizer] Error generating enhanced orbit points:', error);
            return [];
        }
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Clean up all visualizations
        for (const satelliteId of this.visualizations.keys()) {
            this.clearSatellite(satelliteId);
        }
        this.visualizations.clear();

        // Clean up all temporary satellites
        if (this._tempSatelliteIds) {
            for (const tempId of this._tempSatelliteIds) {
                this._cleanupTempSatellite(tempId);
            }
            this._tempSatelliteIds.clear();
        }
    }
}