/**
 * ManeuverOrbitHandler.js
 * 
 * Handles maneuver node orbit visualization and prediction
 */
import * as THREE from 'three';
import { Utils, Orbital } from '../physics/PhysicsAPI.js';

export class ManeuverOrbitHandler {
    constructor(app, workerPoolManager, orbitCacheManager) {
        this.app = app;
        this.workerPoolManager = workerPoolManager;
        this.orbitCacheManager = orbitCacheManager;
        
        // Maneuver visualization queue
        this.maneuverQueue = new Map(); // satelliteId -> maneuverNode[]
    }

    /**
     * Request visualization for a maneuver node
     * This will calculate the position at maneuver time and post-maneuver orbit
     */
    requestManeuverNodeVisualization(satelliteId, maneuverNode, physicsEngine) {
        // Only log for non-preview nodes or first preview request to avoid spam
        if (!maneuverNode.id.startsWith('preview_') || !this._lastPreviewLog || Date.now() - this._lastPreviewLog > 2000) {
            console.log(`[ManeuverOrbitHandler] Request for satellite ${satelliteId}, node ${maneuverNode.id}`);
            if (maneuverNode.id.startsWith('preview_')) {
                this._lastPreviewLog = Date.now();
            }
        }
        
        if (!physicsEngine || !physicsEngine.satellites) {
            console.error(`[ManeuverOrbitHandler] Physics engine not available or satellites not initialized`);
            return false;
        }
        
        const satellite = physicsEngine.satellites.get(satelliteId);
        if (!satellite) {
            console.error(`[ManeuverOrbitHandler] Satellite ${satelliteId} not found`);
            return false;
        }
        
        // Simplified approach - let PhysicsAPI handle all the nested maneuver logic
        // Just create basic visualization data for the maneuver node
        const visualData = {
            nodeId: maneuverNode.id,
            position: satellite.position?.toArray?.() || [0, 0, 0], // Temporary position, will be updated by orbit calculation
            deltaVDirection: [1, 0, 0], // Temporary direction, will be updated
            deltaVMagnitude: maneuverNode.deltaMagnitude || 0,
            color: satellite.color || 0xffffff,
            scale: 1,
            showPredictedOrbit: true,
            predictedOrbitPoints: [],
            timeIndex: 0,
            referenceFrame: {
                centralBodyId: satellite.centralBodyNaifId,
                position: satellite.position?.toArray?.() || [0, 0, 0],
                velocity: satellite.velocity?.toArray?.() || [0, 0, 0]
            }
        };
        
        // Update the satellite's maneuver node visualizer
        const satObj = this.app.satellites?.satellites.get(satelliteId);
        if (satObj?.maneuverNodeVisualizer) {
            // Only log for non-preview nodes to avoid spam
            if (!visualData.nodeId.startsWith('preview_')) {
                console.log(`[ManeuverOrbitHandler] Updating node visualization for ${visualData.nodeId}`);
            }
            satObj.maneuverNodeVisualizer.updateNodeVisualization(visualData);
        } else {
            console.warn(`[ManeuverOrbitHandler] Could not find satellite visualizer for ${satelliteId}`);
        }
        
        // Request post-maneuver orbit propagation using centralized physics
        this._requestPostManeuverOrbit(satelliteId, maneuverNode, satellite, physicsEngine);
        
        return true;
    }
    
    /**
     * Request orbit propagation after a maneuver using centralized physics
     */
    _requestPostManeuverOrbit(satelliteId, maneuverNode, satellite, physicsEngine) {
        try {
            // Use PhysicsAPI.previewManeuver for consistent physics calculations
            const previewResult = Orbital.previewManeuver({
                satellite,
                deltaV: maneuverNode.deltaV, // Already in the correct format { prograde, normal, radial }
                executionTime: maneuverNode.executionTime,
                physicsEngine,
                isPreview: false // This is a permanent node, don't include existing nodes
            });
            
            if (previewResult.error) {
                console.error(`[ManeuverOrbitHandler] Physics API error for ${maneuverNode.id}:`, previewResult.error);
                return;
            }
            
            if (!previewResult.orbitPoints || previewResult.orbitPoints.length === 0) {
                console.warn(`[ManeuverOrbitHandler] No orbit points returned for ${maneuverNode.id}`);
                return;
            }
            
            // Send the predicted orbit to the maneuver node visualizer
            this.updateManeuverPredictionVisualization(
                satelliteId,
                maneuverNode.id,
                previewResult.orbitPoints
            );
            
        } catch (error) {
            console.error(`[ManeuverOrbitHandler] Error requesting post-maneuver orbit for ${maneuverNode.id}:`, error);
        }
    }

    /**
     * Handle worker messages for maneuver predictions
     */
    _handleManeuverWorkerMessage(type, satelliteId, points, params, isComplete, soiTransitions, error) {
        if (type === 'error') {
            console.error(`[ManeuverOrbitHandler] Maneuver prediction error for ${satelliteId}:`, error);
            return;
        }
        
        if (type === 'chunk' && isComplete && params.isManeuverPrediction) {
            console.log(`[ManeuverOrbitHandler] Received ${points?.length} orbit points for maneuver ${params.maneuverNodeId}`);
            
            // Send the predicted orbit to the maneuver node visualizer
            this.updateManeuverPredictionVisualization(
                params.parentSatelliteId,
                params.maneuverNodeId,
                points
            );
            
            // Process any queued maneuvers that might be waiting for this orbit
            const physicsEngine = this.app.physicsIntegration?.physicsEngine;
            if (physicsEngine) {
                this.processQueuedManeuvers(params.parentSatelliteId, physicsEngine);
            }
        }
    }

    /**
     * Update maneuver prediction visualization
     */
    updateManeuverPredictionVisualization(satelliteId, maneuverNodeId, orbitPoints) {
        // Get the satellite object
        const satellite = this.app.satellites?.satellites.get(satelliteId);
        if (!satellite || !satellite.maneuverNodeVisualizer) {
            console.warn(`[ManeuverOrbitHandler] Satellite or visualizer not found for ${satelliteId}`);
            return;
        }
        
        // Update the maneuver node with predicted orbit points
        const nodeVisuals = satellite.maneuverNodeVisualizer.nodeVisuals.get(maneuverNodeId);
        if (!nodeVisuals) {
            console.warn(`[ManeuverOrbitHandler] Node visual not found for ${maneuverNodeId}`);
            return;
        }
        
        // Validate orbit points
        if (!orbitPoints || orbitPoints.length === 0) {
            console.warn(`[ManeuverOrbitHandler] No orbit points to visualize`);
            return;
        }
        
        // Create or update the predicted orbit line
        if (nodeVisuals.orbitLine) {
            // Update existing line
            const positions = new Float32Array(orbitPoints.length * 3);
            for (let i = 0; i < orbitPoints.length; i++) {
                const point = orbitPoints[i];
                // Positions are already in planet-relative coordinates from the worker
                positions[i * 3] = point.position[0];
                positions[i * 3 + 1] = point.position[1];
                positions[i * 3 + 2] = point.position[2];
            }
            nodeVisuals.orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            nodeVisuals.orbitLine.geometry.attributes.position.needsUpdate = true;
            nodeVisuals.orbitLine.geometry.computeBoundingSphere();
            nodeVisuals.orbitLine.computeLineDistances();
            
            // Ensure visibility based on display settings
            const showOrbits = this.app.displaySettingsManager?.getSetting('showOrbits') ?? true;
            nodeVisuals.orbitLine.visible = showOrbits;
            console.log(`[ManeuverOrbitHandler] Updated orbit line for ${maneuverNodeId}, visible:`, nodeVisuals.orbitLine.visible);
        } else {
            // Create new orbit line
            // Positions are already in planet-relative coordinates from the worker
            const positions = orbitPoints.map(p => new THREE.Vector3(...p.position));
            const geometry = new THREE.BufferGeometry().setFromPoints(positions);
            geometry.computeBoundingSphere(); // Ensure bounding sphere is calculated
            
            // Check if this is a preview
            const isPreview = maneuverNodeId && maneuverNodeId.startsWith('preview_');
            
            // Create dashed line material for maneuver orbit
            const material = new THREE.LineDashedMaterial({
                color: isPreview ? 0xffffff : (satellite.color || 0xffffff),
                dashSize: 10,  // Increased dash size
                gapSize: 5,    // Reduced gap size
                linewidth: 2,
                transparent: true,
                opacity: isPreview ? 0.6 : 0.8,
                depthTest: true,
                depthWrite: false
            });
            
            const orbitLine = new THREE.Line(geometry, material);
            orbitLine.computeLineDistances();
            orbitLine.frustumCulled = false;
            orbitLine.renderOrder = 10; // Render on top of other objects
            
            // Add to the appropriate parent group (same as regular orbits)
            const physicsEngine = this.app.physicsIntegration?.physicsEngine;
            const sat = physicsEngine?.satellites.get(satelliteId);
            const centralBodyId = sat?.centralBodyNaifId;
            
            // Find parent group with multiple fallbacks
            let parentGroup = null;
            
            // Try to find planet from celestialBodies
            const planet = this.app.celestialBodies?.find(b => b.naifId === parseInt(centralBodyId));
            if (planet) {
                // Primary: Use getOrbitGroup() method
                if (typeof planet.getOrbitGroup === 'function') {
                    parentGroup = planet.getOrbitGroup();
                }
                // Fallback: Direct property access
                else if (planet.orbitGroup) {
                    parentGroup = planet.orbitGroup;
                }
            }
            
            // Try bodiesByNaifId lookup if still no parent group
            if (!parentGroup && this.app.bodiesByNaifId) {
                const bodyById = this.app.bodiesByNaifId[parseInt(centralBodyId)];
                if (bodyById?.getOrbitGroup) {
                    parentGroup = bodyById.getOrbitGroup();
                } else if (bodyById?.orbitGroup) {
                    parentGroup = bodyById.orbitGroup;
                }
            }
            
            // Final fallback: Use scene
            if (!parentGroup) {
                parentGroup = this.app.sceneManager?.scene || this.app.scene;
            }
            if (parentGroup) {
                parentGroup.add(orbitLine);
            } else {
                console.warn(`[ManeuverOrbitHandler] No parent group found for predicted orbit`);
            }
            
            nodeVisuals.orbitLine = orbitLine;
            
            // Ensure the line is visible based on display settings
            const showOrbits = this.app.displaySettingsManager?.getSetting('showOrbits') ?? true;
            orbitLine.visible = showOrbits;
            console.log(`[ManeuverOrbitHandler] Created orbit line for ${maneuverNodeId}, visible:`, orbitLine.visible, 'showOrbits:', showOrbits, 'parent:', parentGroup ? 'found' : 'using scene');
        }
    }

    /**
     * Process queued maneuver visualizations
     * DISABLED - PhysicsAPI now handles nested maneuvers internally
     */
    processQueuedManeuvers(satelliteId, physicsEngine) {
        // No-op: PhysicsAPI.previewManeuver handles nested maneuvers internally
        return;
    }

    /**
     * Remove maneuver queue for satellite
     */
    removeManeuverQueue(satelliteId) {
        this.maneuverQueue.delete(satelliteId);
    }

    /**
     * Request calculation of a previous maneuver's orbit to enable chaining
     * DISABLED - PhysicsAPI now handles nested maneuvers internally
     */
    _requestPreviousManeuverCalculation(satelliteId, previousNode, currentManeuverNode, physicsEngine) {
        // No-op: PhysicsAPI.previewManeuver handles nested maneuvers internally
        return;
    }

    /**
     * Clear all queued maneuvers
     */
    clearAll() {
        this.maneuverQueue.clear();
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.clearAll();
        this.app = null;
        this.workerPoolManager = null;
        this.orbitCacheManager = null;
    }
}