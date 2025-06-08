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
        
        // Get the orbit data to use for this maneuver node
        // For nested maneuver nodes, we need to use the post-maneuver orbit from the previous node
        let orbitData = null;
        let baseOrbitId = satelliteId; // Default to original satellite orbit
        
        // Check if there are previous maneuver nodes for this satellite
        const allManeuverNodes = physicsEngine?.maneuverNodes?.get(satelliteId) || [];
        if (allManeuverNodes.length > 0) {
            // Sort by execution time to find the correct sequence
            const sortedNodes = [...allManeuverNodes].sort((a, b) => 
                a.executionTime.getTime() - b.executionTime.getTime()
            );
            
            // Find the current maneuver node in the sorted list
            const currentNodeIndex = sortedNodes.findIndex(node => node.id === maneuverNode.id);
            
            // If there's a previous maneuver node, use its post-maneuver orbit
            if (currentNodeIndex > 0) {
                const previousNode = sortedNodes[currentNodeIndex - 1];
                const previousManeuverOrbitId = `${satelliteId}_maneuver_${previousNode.id}`;
                
                // Try to get the cached orbit from the previous maneuver
                orbitData = this.orbitCacheManager.getCachedOrbit(previousManeuverOrbitId);
                if (orbitData) {
                    baseOrbitId = previousManeuverOrbitId;
                    console.log(`[ManeuverOrbitHandler] Using orbit from previous maneuver ${previousNode.id} for node ${maneuverNode.id}`);
                } else {
                    // Cache not available yet - request immediate calculation and queue this maneuver
                    console.log(`[ManeuverOrbitHandler] Previous maneuver orbit not cached, queuing current maneuver for later processing`);
                    this._requestPreviousManeuverCalculation(satelliteId, previousNode, maneuverNode, physicsEngine);
                    return false; // Indicate that orbit calculation is needed first
                }
            }
        }
        
        // If we didn't get orbit data from a previous maneuver, use the original satellite orbit
        if (!orbitData) {
            orbitData = this.orbitCacheManager.getCachedOrbit(satelliteId);
        }
        
        if (!orbitData || !orbitData.points || orbitData.points.length === 0) {
            console.warn(`[ManeuverOrbitHandler] No orbit data available for satellite ${satelliteId} (base orbit: ${baseOrbitId})`);
            // Queue maneuver visualization for after orbit is calculated
            if (!this.maneuverQueue.has(satelliteId)) {
                this.maneuverQueue.set(satelliteId, []);
            }
            this.maneuverQueue.get(satelliteId).push(maneuverNode);
            
            // Request orbit calculation if needed
            if (this.app.satelliteOrbitManager) {
                console.log(`[ManeuverOrbitHandler] Requesting orbit calculation for ${satelliteId}`);
                this.app.satelliteOrbitManager.updateSatelliteOrbit(satelliteId);
            }
            
            return false; // Indicate that orbit calculation is needed first
        }
        
        // Find the point in the orbit closest to maneuver execution time
        const currentTime = physicsEngine.simulationTime || new Date();
        const maneuverTime = maneuverNode.executionTime;
        
        // Get the calculation time of the orbit data to compute correct time delta
        const orbitCalculationTime = orbitData.calculationTime ? new Date(orbitData.calculationTime) : currentTime;
        
        // Calculate time delta based on when the orbit was calculated
        let timeDelta;
        if (baseOrbitId === satelliteId) {
            // Using original satellite orbit - time is relative to when orbit was calculated
            timeDelta = (maneuverTime.getTime() - orbitCalculationTime.getTime()) / 1000; // seconds
        } else {
            // Using previous maneuver's orbit - time is relative to that maneuver's execution time
            const allManeuverNodes = physicsEngine?.maneuverNodes?.get(satelliteId) || [];
            const sortedNodes = [...allManeuverNodes].sort((a, b) => 
                a.executionTime.getTime() - b.executionTime.getTime()
            );
            const currentNodeIndex = sortedNodes.findIndex(node => node.id === maneuverNode.id);
            const previousNode = sortedNodes[currentNodeIndex - 1];
            
            // Time delta from the previous maneuver's execution time
            timeDelta = (maneuverTime.getTime() - previousNode.executionTime.getTime()) / 1000; // seconds
        }
        
        
        // Find the orbit point at or near the maneuver time
        let nodePoint = null;
        let nodeIndex = -1;
        
        for (let i = 0; i < orbitData.points.length; i++) {
            const point = orbitData.points[i];
            if (point.time >= timeDelta) {
                nodePoint = point;
                nodeIndex = i;
                break;
            }
        }
        
        if (!nodePoint) {
            console.warn(`[ManeuverOrbitHandler] Maneuver time ${timeDelta}s is beyond orbit prediction range`);
            nodePoint = orbitData.points[orbitData.points.length - 1]; // Use last point
            nodeIndex = orbitData.points.length - 1;
        }
        
        // Calculate world delta-V at the maneuver point
        const position = new THREE.Vector3(...nodePoint.position);
        const velocity = new THREE.Vector3(...(nodePoint.velocity || satellite.velocity.toArray()));
        
        const localDeltaV = new THREE.Vector3(
            maneuverNode.deltaV.prograde,
            maneuverNode.deltaV.normal,
            maneuverNode.deltaV.radial
        );
        
        const worldDeltaV = Utils.vector.localToWorldDeltaV(localDeltaV, position, velocity);
        
        // Calculate post-maneuver velocity for proper reference frame
        const postManeuverVelocity = velocity.clone().add(worldDeltaV);
        
        // Convert position from absolute SSB coordinates to planet-relative coordinates
        // (same transformation we use for apsis visualization)
        const centralBodyId = nodePoint.centralBodyId || satellite.centralBodyNaifId;
        const centralBody = physicsEngine?.bodies?.[centralBodyId];
        const centralBodyPosition = centralBody?.position?.toArray?.() || [0, 0, 0];
        const planetRelativePosition = [
            nodePoint.position[0] - centralBodyPosition[0],
            nodePoint.position[1] - centralBodyPosition[1],
            nodePoint.position[2] - centralBodyPosition[2]
        ];
        
        // Create visualization data with correct reference frame
        const visualData = {
            nodeId: maneuverNode.id,
            position: planetRelativePosition,
            deltaVDirection: worldDeltaV.clone().normalize().toArray(),
            deltaVMagnitude: maneuverNode.deltaMagnitude,
            color: satellite.color || 0xffffff,
            scale: 1,
            showPredictedOrbit: true,
            predictedOrbitPoints: [],
            timeIndex: nodeIndex,
            referenceFrame: {
                centralBodyId: centralBodyId,
                position: position.toArray(),
                velocity: postManeuverVelocity.toArray(), // Use POST-maneuver velocity for reference frame
                // Store both pre and post velocities for debugging/analysis
                preManeuverVelocity: velocity.toArray(),
                deltaV: worldDeltaV.toArray(),
                orbitContext: baseOrbitId // Track which orbit this node is based on
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
        
        // Request post-maneuver orbit propagation
        this._requestPostManeuverOrbit(satelliteId, nodePoint, worldDeltaV, maneuverNode, satellite);
        
        return true;
    }
    
    /**
     * Request orbit propagation after a maneuver
     */
    _requestPostManeuverOrbit(satelliteId, maneuverPoint, worldDeltaV, maneuverNode, satellite) {
        // Apply delta-V to velocity
        const preManeuverVel = new THREE.Vector3(...maneuverPoint.velocity);
        const postManeuverVelocity = preManeuverVel.clone().add(worldDeltaV);
        
        // Start a new propagation job for post-maneuver orbit
        const centralBody = this.app.physicsIntegration?.physicsEngine?.bodies[maneuverPoint.centralBodyId];
        if (!centralBody) {
            console.error(`[ManeuverOrbitHandler] Central body ${maneuverPoint.centralBodyId} not found`);
            return;
        }
        
        // CRITICAL: Convert from SSB coordinates to planet-relative coordinates
        // The maneuverPoint.position is in SSB frame, but orbit propagator needs planet-relative
        const centralBodyPosition = centralBody?.position?.toArray?.() || [0, 0, 0];
        const planetRelativePosition = [
            maneuverPoint.position[0] - centralBodyPosition[0],
            maneuverPoint.position[1] - centralBodyPosition[1],
            maneuverPoint.position[2] - centralBodyPosition[2]
        ];
        
        // Use per-satellite simulation properties if available, otherwise fall back to global settings
        const satelliteProps = satellite.orbitSimProperties || {};
        const orbitPeriods = satelliteProps.periods || this.app.displaySettingsManager?.getSetting('orbitPredictionInterval') || 1;
        const pointsPerPeriod = satelliteProps.pointsPerPeriod || this.app.displaySettingsManager?.getSetting('orbitPointsPerPeriod') || 180;
        
        // Calculate actual orbital period for the post-maneuver orbit
        const centralBodyGM = centralBody?.GM || 398600.4415; // Earth default
        const position = new THREE.Vector3(...planetRelativePosition); // Use planet-relative position
        const orbitalPeriod = Orbital.calculateOrbitalPeriod(position, postManeuverVelocity, centralBodyGM);
        
        // Calculate duration based on actual orbital period
        // For non-elliptical orbits (period = 0), fall back to 1 day per "period"
        const duration = orbitalPeriod > 0 ? 
            orbitPeriods * orbitalPeriod : 
            orbitPeriods * 86400;
        const timeStep = duration / (pointsPerPeriod * orbitPeriods);
        
        // Create a unique ID for this maneuver prediction
        const predictionId = `${satelliteId}_maneuver_${maneuverNode.id}`;
        
        // Start propagation for post-maneuver orbit
        const success = this.workerPoolManager.startPropagationJob({
            satelliteId: predictionId,
            satellite: {
                position: planetRelativePosition, // Use planet-relative position for propagation
                velocity: postManeuverVelocity.toArray(),
                centralBodyNaifId: maneuverPoint.centralBodyId,
                mass: satellite.mass || 1000,
                crossSectionalArea: satellite.crossSectionalArea || 10,
                dragCoefficient: satellite.dragCoefficient || 2.2
            },
            duration,
            timeStep,
            hash: `maneuver_${maneuverNode.id}`,
            isManeuverPrediction: true,
            parentSatelliteId: satelliteId,
            maneuverNodeId: maneuverNode.id
        }, this._handleManeuverWorkerMessage.bind(this));
        
        if (!success) {
            console.warn(`[ManeuverOrbitHandler] No worker available for maneuver prediction ${predictionId}`);
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
     */
    processQueuedManeuvers(satelliteId, physicsEngine) {
        const queuedManeuvers = this.maneuverQueue.get(satelliteId);
        if (queuedManeuvers && queuedManeuvers.length > 0) {
            queuedManeuvers.forEach(maneuverNode => {
                this.requestManeuverNodeVisualization(satelliteId, maneuverNode, physicsEngine);
            });
            this.maneuverQueue.delete(satelliteId);
        }
    }

    /**
     * Remove maneuver queue for satellite
     */
    removeManeuverQueue(satelliteId) {
        this.maneuverQueue.delete(satelliteId);
    }

    /**
     * Request calculation of a previous maneuver's orbit to enable chaining
     * This delegates to existing systems rather than reimplementing physics
     */
    _requestPreviousManeuverCalculation(satelliteId, previousNode, currentManeuverNode, physicsEngine) {
        // Queue the current maneuver for processing after the previous one completes
        if (!this.maneuverQueue.has(satelliteId)) {
            this.maneuverQueue.set(satelliteId, []);
        }
        
        // Add current maneuver to queue
        this.maneuverQueue.get(satelliteId).push(currentManeuverNode);
        
        // Check if the previous maneuver visualization is already in progress
        // If not, trigger its calculation by re-requesting it
        console.log(`[ManeuverOrbitHandler] Requesting calculation for previous maneuver ${previousNode.id}`);
        
        // Use the existing system to calculate the previous maneuver
        // This will eventually populate the cache and then process the queue
        this.requestManeuverNodeVisualization(satelliteId, previousNode, physicsEngine);
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