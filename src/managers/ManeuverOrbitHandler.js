/**
 * ManeuverOrbitHandler.js
 * 
 * Handles maneuver node orbit visualization and prediction
 */
import * as THREE from 'three';
import { Utils } from '../physics/PhysicsAPI.js';

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
        const satellite = physicsEngine?.satellites.get(satelliteId);
        if (!satellite) {
            console.error(`[ManeuverOrbitHandler] Satellite ${satelliteId} not found`);
            return;
        }
        
        // Get the current orbit data
        const orbitData = this.orbitCacheManager.getCachedOrbit(satelliteId);
        if (!orbitData || !orbitData.points || orbitData.points.length === 0) {
            console.warn(`[ManeuverOrbitHandler] No orbit data available for satellite ${satelliteId}`);
            // Queue maneuver visualization for after orbit is calculated
            if (!this.maneuverQueue.has(satelliteId)) {
                this.maneuverQueue.set(satelliteId, []);
            }
            this.maneuverQueue.get(satelliteId).push(maneuverNode);
            return false; // Indicate that orbit calculation is needed first
        }
        
        // Find the point in the orbit closest to maneuver execution time
        const currentTime = physicsEngine.simulationTime || new Date();
        const maneuverTime = maneuverNode.executionTime;
        const timeDelta = (maneuverTime.getTime() - currentTime.getTime()) / 1000; // seconds
        
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
            console.warn(`[ManeuverOrbitHandler] Maneuver time ${timeDelta}s is beyond orbit prediction`);
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
        
        // Create visualization data
        const visualData = {
            nodeId: maneuverNode.id,
            position: nodePoint.position,
            deltaVDirection: worldDeltaV.clone().normalize().toArray(),
            deltaVMagnitude: maneuverNode.deltaMagnitude,
            color: satellite.color || 0xffffff,
            scale: 1,
            showPredictedOrbit: true,
            predictedOrbitPoints: [],
            timeIndex: nodeIndex,
            referenceFrame: {
                centralBodyId: nodePoint.centralBodyId,
                position: position.toArray(),
                velocity: velocity.toArray()
            }
        };
        
        // Update the satellite's maneuver node visualizer
        const satObj = this.app.satellites?.satellites.get(satelliteId);
        if (satObj?.maneuverNodeVisualizer) {
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
        
        // Use per-satellite simulation properties if available, otherwise fall back to global settings
        const satelliteProps = satellite.orbitSimProperties || {};
        const orbitPeriods = satelliteProps.periods || this.app.displaySettingsManager?.getSetting('orbitPredictionInterval') || 1;
        const pointsPerPeriod = satelliteProps.pointsPerPeriod || this.app.displaySettingsManager?.getSetting('orbitPointsPerPeriod') || 180;
        
        // Estimate duration based on orbit type
        const duration = 86400 * orbitPeriods; // days in seconds
        const timeStep = duration / (pointsPerPeriod * orbitPeriods);
        
        // Create a unique ID for this maneuver prediction
        const predictionId = `${satelliteId}_maneuver_${maneuverNode.id}`;
        
        // Start propagation for post-maneuver orbit
        const success = this.workerPoolManager.startPropagationJob({
            satelliteId: predictionId,
            satellite: {
                position: maneuverPoint.position,
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
            // Send the predicted orbit to the maneuver node visualizer
            this.updateManeuverPredictionVisualization(
                params.parentSatelliteId,
                params.maneuverNodeId,
                points
            );
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
        
        // Create or update the predicted orbit line
        if (nodeVisuals.orbitLine) {
            // Update existing line
            const positions = new Float32Array(orbitPoints.length * 3);
            for (let i = 0; i < orbitPoints.length; i++) {
                const point = orbitPoints[i];
                positions[i * 3] = point.position[0];
                positions[i * 3 + 1] = point.position[1];
                positions[i * 3 + 2] = point.position[2];
            }
            nodeVisuals.orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            nodeVisuals.orbitLine.geometry.attributes.position.needsUpdate = true;
            nodeVisuals.orbitLine.computeLineDistances();
        } else {
            // Create new orbit line
            const positions = orbitPoints.map(p => new THREE.Vector3(...p.position));
            const geometry = new THREE.BufferGeometry().setFromPoints(positions);
            
            // Check if this is a preview
            const isPreview = maneuverNodeId && maneuverNodeId.startsWith('preview_');
            
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
            
            // Add to the appropriate parent group (same as regular orbits)
            const physicsEngine = this.app.physicsIntegration?.physicsEngine;
            const sat = physicsEngine?.satellites.get(satelliteId);
            const planet = this.app.celestialBodies?.find(b => b.naifId === parseInt(sat?.centralBodyNaifId));
            const parentGroup = planet?.orbitGroup || this.app.sceneManager?.scene;
            if (parentGroup) {
                parentGroup.add(orbitLine);
            } else {
                console.warn(`[ManeuverOrbitHandler] No parent group found for predicted orbit`);
            }
            
            nodeVisuals.orbitLine = orbitLine;
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