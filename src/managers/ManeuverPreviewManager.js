import * as THREE from 'three';
import { Orbital, Bodies, Utils } from '../physics/PhysicsAPI.js';
import { UnifiedSatellitePropagator } from '../physics/core/UnifiedSatellitePropagator.js';
import { createManeuverNodeDTO } from '../types/DataTransferObjects.js';

/**
 * ManeuverPreviewManager - Manages preview state for maneuver nodes
 * 
 * This manager handles all preview-related operations separately from committed maneuver nodes.
 * It coordinates with the physics engine for calculations and the orbit manager for visualization.
 */
export class ManeuverPreviewManager {
    constructor(orbitManager) {
        this.orbitManager = orbitManager;
        this.previews = new Map(); // satelliteId -> preview data
        this.visualizations = new Map(); // previewId -> visualization objects
        this.updateCallbacks = new Map(); // satelliteId -> callback
    }

    /**
     * Create or update a manual maneuver preview
     * @param {Object} params - Preview parameters
     * @returns {Object} Preview data including predicted orbit
     */
    async createManualPreview(params) {
        const {
            satellite,
            executionTime,
            deltaV, // THREE.Vector3 in local coordinates (prograde, normal, radial)
            baseState = null // Optional: state to build preview from (for chained maneuvers)
        } = params;

        // Use base state or current satellite state
        const initialState = baseState || {
            position: satellite.position.clone(),
            velocity: satellite.velocity.clone(),
            time: satellite.app3d.physicsEngine.getSimulatedTime()
        };

        // Calculate time to maneuver
        const dtToManeuver = (executionTime.getTime() - initialState.time.getTime()) / 1000; // seconds

        // Use UnifiedSatellitePropagator for consistent physics
        const physicsState = satellite.app3d.physicsEngine.getSimulationState();
        const satelliteConfig = {
            position: [initialState.position.x, initialState.position.y, initialState.position.z],
            velocity: [initialState.velocity.x, initialState.velocity.y, initialState.velocity.z],
            centralBodyNaifId: satellite.centralBodyNaifId,
            mass: satellite.mass || 1000,
            crossSectionalArea: satellite.crossSectionalArea || 10,
            dragCoefficient: satellite.dragCoefficient || 2.2
        };

        const propagationPoints = UnifiedSatellitePropagator.propagateOrbit({
            satellite: satelliteConfig,
            bodies: physicsState.bodies,
            duration: Math.abs(dtToManeuver),
            timeStep: Math.min(60, Math.abs(dtToManeuver) / 10), // Adaptive time step
            includeJ2: true,
            includeDrag: true,
            includeThirdBody: true
        });

        // Get state at maneuver time (last point if propagating forward, first if backward)
        const stateAtManeuver = dtToManeuver >= 0 ? 
            propagationPoints[propagationPoints.length - 1] : 
            propagationPoints[0];
        const posAtManeuver = new THREE.Vector3(...stateAtManeuver.position);
        const velAtManeuver = new THREE.Vector3(...stateAtManeuver.velocity);

        // Convert local delta-V to world coordinates
        const worldDeltaV = Utils.vector.localToWorldDeltaV(deltaV, posAtManeuver, velAtManeuver);
        
        // Apply delta-V
        const velAfterManeuver = velAtManeuver.clone().add(worldDeltaV);

        // Request post-maneuver orbit propagation using UnifiedSatellitePropagator
        const postManeuverConfig = {
            position: [posAtManeuver.x, posAtManeuver.y, posAtManeuver.z],
            velocity: [velAfterManeuver.x, velAfterManeuver.y, velAfterManeuver.z],
            centralBodyNaifId: satellite.centralBodyNaifId,
            mass: satellite.mass || 1000,
            crossSectionalArea: satellite.crossSectionalArea || 10,
            dragCoefficient: satellite.dragCoefficient || 2.2
        };

        const predictionDuration = satellite.app3d.getDisplaySetting?.('orbitPredictionInterval') * 86400 || 86400; // Default 1 day
        const postManeuverPoints = UnifiedSatellitePropagator.propagateOrbit({
            satellite: postManeuverConfig,
            bodies: physicsState.bodies,
            duration: predictionDuration,
            timeStep: 60, // 1 minute steps
            includeJ2: true,
            includeDrag: true,
            includeThirdBody: true
        });

        // Calculate orbital elements for the post-maneuver orbit
        const orbitalElements = Orbital.calculateElements(
            posAtManeuver,
            velAfterManeuver,
            physicsState.bodies[satellite.centralBodyNaifId]
        );

        const postManeuverResult = {
            points: postManeuverPoints,
            orbitalElements: orbitalElements
        };

        // Create preview data with pre-calculated values for visualization
        const dvMagnitude = worldDeltaV.length();
        const dvDirection = dvMagnitude > 0.001 ? worldDeltaV.clone().normalize() : new THREE.Vector3(0, 1, 0);
        
        const preview = {
            id: `preview_${satellite.id}_${Date.now()}`,
            satelliteId: satellite.id,
            executionTime,
            deltaV: deltaV.clone(),
            worldDeltaV: worldDeltaV.clone(),
            // Pre-calculated values for visualization layer
            deltaVMagnitude: dvMagnitude,
            deltaVDirection: dvDirection.toArray(), // Convert to array for DTO
            positionAtManeuver: posAtManeuver,
            velocityBeforeManeuver: velAtManeuver,
            velocityAfterManeuver: velAfterManeuver,
            orbitData: postManeuverResult,
            orbitalElements: postManeuverResult.orbitalElements,
            type: 'manual',
            baseState: initialState
        };

        // Store preview
        this.previews.set(satellite.id, preview);

        // Notify callbacks
        const callback = this.updateCallbacks.get(satellite.id);
        if (callback) callback(preview);

        return preview;
    }

    /**
     * Create Hohmann transfer preview
     * @param {Object} params - Transfer parameters
     * @returns {Object} Preview data with two burns
     */
    async createHohmannPreview(params) {
        const {
            satellite,
            targetPeriapsis, // km above surface
            targetApoapsis,  // km above surface
            targetInclination, // degrees
            targetLAN,       // degrees
            manualBurnTime = null
        } = params;

        // Get current state
        const currentState = {
            position: satellite.position.clone(),
            velocity: satellite.velocity.clone(),
            time: satellite.app3d.physicsEngine.getSimulatedTime()
        };

        // Calculate Hohmann transfer parameters
        const transferParams = Orbital.calculateHohmannTransfer({
            currentPosition: currentState.position,
            currentVelocity: currentState.velocity,
            targetPeriapsis,
            targetApoapsis,
            targetInclination,
            targetLAN,
            bodyRadius: Bodies.getData(satellite.centralBodyNaifId)?.radius || satellite.app3d.physicsEngine.getBodyRadius(satellite.centralBodyNaifId),
            mu: Bodies.getGM(satellite.centralBodyNaifId)
        });

        // Determine burn times
        let burn1Time;
        if (manualBurnTime) {
            burn1Time = manualBurnTime;
        } else {
            // Find next optimal burn point
            burn1Time = Orbital.nextPeriapsis(
                currentState.position,
                currentState.velocity,
                { GM: Bodies.getGM(satellite.centralBodyNaifId) },
                currentState.time
            );
        }

        const burn2Time = new Date(burn1Time.getTime() + transferParams.transferTime * 1000);

        // Create first burn preview
        const burn1DeltaV = new THREE.Vector3(transferParams.burn1.magnitude, 0, 0); // prograde
        const preview1 = await this.createManualPreview({
            satellite,
            executionTime: burn1Time,
            deltaV: burn1DeltaV
        });

        // Create second burn preview based on first burn's final state
        const burn2DeltaV = new THREE.Vector3(
            transferParams.burn2.orbitalComponent,
            0,
            transferParams.burn2.planeChangeComponent
        );
        
        // Get state at burn2 time from transfer orbit
        const transferOrbitState = await this.getStateAtTime(
            preview1,
            burn2Time,
            satellite.centralBodyNaifId
        );

        const preview2 = await this.createManualPreview({
            satellite,
            executionTime: burn2Time,
            deltaV: burn2DeltaV,
            baseState: {
                position: new THREE.Vector3(...transferOrbitState.position),
                velocity: new THREE.Vector3(...transferOrbitState.velocity),
                time: burn2Time
            }
        });

        // Create combined Hohmann preview
        const hohmannPreview = {
            id: `hohmann_${satellite.id}_${Date.now()}`,
            satelliteId: satellite.id,
            type: 'hohmann',
            burn1: preview1,
            burn2: preview2,
            transferParams,
            totalDeltaV: transferParams.totalDeltaV,
            transferTime: transferParams.transferTime
        };

        // Store as array of previews
        this.previews.set(satellite.id, [preview1, preview2]);

        // Notify callbacks
        const callback = this.updateCallbacks.get(satellite.id);
        if (callback) callback(hohmannPreview);

        return hohmannPreview;
    }

    /**
     * Get satellite state at a specific time from preview orbit
     */
    async getStateAtTime(preview, targetTime, centralBodyId) {
        const dt = (targetTime.getTime() - preview.executionTime.getTime()) / 1000;
        
        // Use UnifiedSatellitePropagator for consistent physics
        const satelliteConfig = {
            position: [preview.positionAtManeuver.x, preview.positionAtManeuver.y, preview.positionAtManeuver.z],
            velocity: [preview.velocityAfterManeuver.x, preview.velocityAfterManeuver.y, preview.velocityAfterManeuver.z],
            centralBodyNaifId: centralBodyId,
            mass: 1000,
            crossSectionalArea: 10,
            dragCoefficient: 2.2
        };

        // Get current physics state - fallback to basic Earth if baseState not available
        const physicsState = preview.baseState?.physicsState || {
            bodies: {
                399: {
                    name: 'Earth',
                    GM: 398600.4415,
                    radius: 6371,
                    position: [0, 0, 0],
                    velocity: [0, 0, 0],
                    naifId: 399
                }
            }
        };

        const points = UnifiedSatellitePropagator.propagateOrbit({
            satellite: satelliteConfig,
            bodies: physicsState.bodies,
            duration: Math.abs(dt),
            timeStep: Math.min(60, Math.abs(dt) / 5),
            includeJ2: true,
            includeDrag: true,
            includeThirdBody: true
        });

        // Return the final state
        const finalPoint = dt >= 0 ? points[points.length - 1] : points[0];
        return {
            position: finalPoint.position,
            velocity: finalPoint.velocity,
            time: finalPoint.time
        };
    }

    /**
     * Clear preview for a satellite
     */
    clearPreview(satelliteId) {
        const preview = this.previews.get(satelliteId);
        if (!preview) return;

        // Clean up visualizations
        if (Array.isArray(preview)) {
            preview.forEach(p => this.cleanupVisualization(p.id));
        } else {
            this.cleanupVisualization(preview.id);
        }

        this.previews.delete(satelliteId);

        // Notify callbacks
        const callback = this.updateCallbacks.get(satelliteId);
        if (callback) callback(null);
    }

    /**
     * Register update callback for a satellite
     */
    onUpdate(satelliteId, callback) {
        this.updateCallbacks.set(satelliteId, callback);
    }

    /**
     * Unregister update callback
     */
    offUpdate(satelliteId) {
        this.updateCallbacks.delete(satelliteId);
    }

    /**
     * Get current preview for a satellite
     */
    getPreview(satelliteId) {
        return this.previews.get(satelliteId);
    }

    /**
     * Clean up visualization for a preview
     */
    cleanupVisualization(previewId) {
        const viz = this.visualizations.get(previewId);
        if (!viz) return;

        // Remove from scene
        if (viz.group && viz.group.parent) {
            viz.group.parent.remove(viz.group);
        }

        // Dispose geometries and materials
        if (viz.orbitLine) {
            viz.orbitLine.geometry?.dispose();
            viz.orbitLine.material?.dispose();
        }

        if (viz.nodeMesh) {
            viz.nodeMesh.geometry?.dispose();
            viz.nodeMesh.material?.dispose();
        }

        this.visualizations.delete(previewId);
    }

    /**
     * Convert preview to DTO for physics engine
     */
    previewToDTO(preview) {
        return createManeuverNodeDTO({
            id: preview.id,
            executionTime: preview.executionTime,
            deltaV: preview.deltaV,
            satelliteId: preview.satelliteId
        });
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        // Clean up all visualizations
        this.visualizations.forEach((viz, id) => this.cleanupVisualization(id));
        
        // Clear all data
        this.previews.clear();
        this.updateCallbacks.clear();
        this.visualizations.clear();
    }
}