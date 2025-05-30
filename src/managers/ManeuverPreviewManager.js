import * as THREE from 'three';
import { PhysicsAPI } from '../physics/PhysicsAPI.js';
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

        // Request orbit propagation up to maneuver time
        const propagationResult = await this.orbitManager.requestPropagation({
            satelliteId: satellite.id,
            initialState: {
                position: [initialState.position.x, initialState.position.y, initialState.position.z],
                velocity: [initialState.velocity.x, initialState.velocity.y, initialState.velocity.z]
            },
            timeSpan: dtToManeuver,
            includeIntermediateStates: true,
            centralBodyId: satellite.centralBodyNaifId,
            physicsState: satellite.app3d.physicsEngine.getFullState()
        });

        // Get state at maneuver time
        const stateAtManeuver = propagationResult.finalState || propagationResult.states[propagationResult.states.length - 1];
        const posAtManeuver = new THREE.Vector3(...stateAtManeuver.position);
        const velAtManeuver = new THREE.Vector3(...stateAtManeuver.velocity);

        // Convert local delta-V to world coordinates
        const worldDeltaV = PhysicsAPI.localToWorldDeltaV(deltaV, posAtManeuver, velAtManeuver);
        
        // Apply delta-V
        const velAfterManeuver = velAtManeuver.clone().add(worldDeltaV);

        // Request post-maneuver orbit propagation
        const postManeuverResult = await this.orbitManager.requestPropagation({
            satelliteId: `${satellite.id}_preview_${Date.now()}`,
            initialState: {
                position: [posAtManeuver.x, posAtManeuver.y, posAtManeuver.z],
                velocity: [velAfterManeuver.x, velAfterManeuver.y, velAfterManeuver.z]
            },
            timeSpan: satellite.app3d.getDisplaySetting('orbitPredictionInterval') * 86400, // days to seconds
            includeOrbitalElements: true,
            centralBodyId: satellite.centralBodyNaifId,
            physicsState: satellite.app3d.physicsEngine.getFullState()
        });

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
        const transferParams = PhysicsAPI.calculateHohmannTransfer({
            currentPosition: currentState.position,
            currentVelocity: currentState.velocity,
            targetPeriapsis,
            targetApoapsis,
            targetInclination,
            targetLAN,
            bodyRadius: satellite.app3d.physicsEngine.getBodyRadius(satellite.centralBodyNaifId),
            mu: satellite.app3d.physicsEngine.getBodyGM(satellite.centralBodyNaifId)
        });

        // Determine burn times
        let burn1Time;
        if (manualBurnTime) {
            burn1Time = manualBurnTime;
        } else {
            // Find next optimal burn point
            burn1Time = PhysicsAPI.calculateNextPeriapsis(
                currentState.position,
                currentState.velocity,
                satellite.app3d.physicsEngine.getBodyGM(satellite.centralBodyNaifId),
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
        
        const result = await this.orbitManager.requestPropagation({
            satelliteId: preview.id,
            initialState: {
                position: [preview.positionAtManeuver.x, preview.positionAtManeuver.y, preview.positionAtManeuver.z],
                velocity: [preview.velocityAfterManeuver.x, preview.velocityAfterManeuver.y, preview.velocityAfterManeuver.z]
            },
            timeSpan: dt,
            centralBodyId,
            physicsState: preview.baseState
        });

        return result.finalState || result.states[result.states.length - 1];
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