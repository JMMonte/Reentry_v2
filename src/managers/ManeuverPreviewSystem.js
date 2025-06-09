/**
 * ManeuverPreviewSystem.js
 * 
 * Consolidated maneuver preview system that properly integrates:
 * - ManeuverPreviewManager (calculations)
 * - ManeuverNodeRenderer (visualization)
 * - Physics engine integration
 * - React hooks
 */

import * as THREE from 'three';
import { ManeuverNodeRenderer } from '../components/Satellite/ManeuverNodeRenderer.js';
import { UnifiedSatellitePropagator } from '../physics/core/UnifiedSatellitePropagator.js';
import { Orbital } from '../physics/PhysicsAPI.js';

export class ManeuverPreviewSystem {
    constructor(app3d) {
        this.app3d = app3d;
        this.previews = new Map(); // satelliteId -> { data, renderer }
        this.enabled = true;
    }

    /**
     * Create or update a manual maneuver preview
     */
    async createManualPreview(params) {
        console.log('[ManeuverPreviewSystem] createManualPreview called with params:', params);
        
        const {
            satellite,
            executionTime,
            deltaV, // { prograde, normal, radial } in km/s
            baseState = null
        } = params;

        if (!this.enabled || !satellite?.id) {
            console.warn('[ManeuverPreviewSystem] Preview disabled or no satellite ID', {
                enabled: this.enabled,
                satelliteId: satellite?.id
            });
            return null;
        }

        try {
            // Get physics engine and current state
            const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
            if (!physicsEngine) {
                console.error('[ManeuverPreviewSystem] No physics engine available');
                return null;
            }
            console.log('[ManeuverPreviewSystem] Physics engine found:', physicsEngine);

            // Get current satellite state from physics
            const physicsSat = physicsEngine.satellites.get(satellite.id);
            if (!physicsSat) {
                console.error('[ManeuverPreviewSystem] Satellite not found in physics engine', {
                    satelliteId: satellite.id,
                    availableSatellites: Array.from(physicsEngine.satellites.keys())
                });
                return null;
            }
            console.log('[ManeuverPreviewSystem] Found physics satellite:', physicsSat);

            // Use base state or current state
            const currentTime = physicsEngine.getSimulatedTime();
            const initialState = baseState || {
                position: [...physicsSat.position],
                velocity: [...physicsSat.velocity],
                time: currentTime
            };

            // Calculate time to maneuver
            const dtToManeuver = (executionTime.getTime() - initialState.time.getTime()) / 1000;
            
            console.log('[ManeuverPreviewSystem] Time calculation details:', {
                executionTime: executionTime.toISOString(),
                initialStateTime: initialState.time.toISOString(),
                physicsTime: currentTime.toISOString(),
                dtToManeuver: dtToManeuver
            });
            
            if (dtToManeuver < 0) {
                console.warn('[ManeuverPreviewSystem] Maneuver time is in the past, adjusting to future');
                // Adjust execution time to be at least 10 seconds in the future
                const futureTime = new Date(currentTime.getTime() + 10000);
                const newDt = (futureTime.getTime() - initialState.time.getTime()) / 1000;
                console.log('[ManeuverPreviewSystem] Using adjusted time:', {
                    adjustedTime: futureTime.toISOString(),
                    newDt: newDt
                });
                return await this.createManualPreview({
                    ...params,
                    executionTime: futureTime
                });
            }

            // Get physics state for propagation
            const physicsState = physicsEngine.getSimulationState ? 
                physicsEngine.getSimulationState() : 
                {
                    bodies: physicsEngine.bodies,
                    time: currentTime,
                    epoch: currentTime
                };
            
            // Create propagation config
            const propagationConfig = {
                id: `${satellite.id}_preview`,
                position: initialState.position,
                velocity: initialState.velocity,
                centralBodyNaifId: physicsSat.centralBodyNaifId,
                mass: physicsSat.mass || 1000,
                dragCoefficient: physicsSat.Cd || 2.2,
                crossSectionalArea: physicsSat.area || 10
            };

            // Propagate to maneuver time
            let stateAtManeuver;
            if (dtToManeuver > 0) {
                const propagatedOrbit = UnifiedSatellitePropagator.propagateOrbit({
                    satellite: propagationConfig,
                    bodies: physicsState.bodies,
                    duration: dtToManeuver,
                    timeStep: Math.min(dtToManeuver / 10, 60), // Adaptive time step
                    includeJ2: true,
                    includeDrag: true,
                    includeThirdBody: false
                });
                // Get the final state (last point in the orbit)
                stateAtManeuver = propagatedOrbit[propagatedOrbit.length - 1];
                console.log('[ManeuverPreviewSystem] Propagated to maneuver time:', stateAtManeuver);
            } else {
                stateAtManeuver = { position: initialState.position, velocity: initialState.velocity };
            }

            // Convert delta-V from local (RNP) to world coordinates
            // Get the local coordinate frame
            const r = new THREE.Vector3(...stateAtManeuver.position).normalize(); // Radial
            const v = new THREE.Vector3(...stateAtManeuver.velocity);
            const h = r.clone().cross(v).normalize(); // Normal (angular momentum)
            const p = h.clone().cross(r).normalize(); // Prograde
            
            // Apply delta-V in local frame
            const deltaVWorld = new THREE.Vector3();
            deltaVWorld.addScaledVector(r, deltaV.radial);
            deltaVWorld.addScaledVector(h, deltaV.normal);
            deltaVWorld.addScaledVector(p, deltaV.prograde);

            // Apply delta-V
            const velocityAfterBurn = [
                stateAtManeuver.velocity[0] + deltaVWorld.x,
                stateAtManeuver.velocity[1] + deltaVWorld.y,
                stateAtManeuver.velocity[2] + deltaVWorld.z
            ];

            // Calculate predicted orbit
            console.log('[ManeuverPreviewSystem] Calculating orbit elements from state:', {
                position: stateAtManeuver.position,
                velocity: velocityAfterBurn,
                centralBodyId: physicsSat.centralBodyNaifId
            });
            
            // Get central body data for orbit calculations
            const centralBodyData = physicsState.bodies[physicsSat.centralBodyNaifId];
            if (!centralBodyData) {
                console.error('[ManeuverPreviewSystem] Central body not found:', physicsSat.centralBodyNaifId);
                return null;
            }
            
            // Use correct method name from PhysicsAPI
            console.log('[ManeuverPreviewSystem] Central body data:', centralBodyData);
            const orbitParams = Orbital.calculateElements(
                stateAtManeuver.position,
                velocityAfterBurn,
                centralBodyData,
                centralBodyData.radius || 0
            );
            console.log('[ManeuverPreviewSystem] Calculated orbit elements:', orbitParams);

            // Generate orbit points for visualization
            const orbitPoints = this._generateOrbitPoints(
                stateAtManeuver.position,
                velocityAfterBurn,
                physicsSat.centralBodyNaifId,
                orbitParams.period || 5400, // Default 90 min
                180 // points
            );

            // Create preview data
            const previewData = {
                satelliteId: satellite.id,
                nodeId: `${satellite.id}_preview_manual`,
                executionTime: executionTime,
                positionAtManeuver: stateAtManeuver.position,
                velocityBeforeManeuver: stateAtManeuver.velocity,
                velocityAfterManeuver: velocityAfterBurn,
                deltaV: deltaV,
                deltaMagnitude: Math.sqrt(
                    deltaV.prograde ** 2 + 
                    deltaV.normal ** 2 + 
                    deltaV.radial ** 2
                ),
                orbitData: {
                    points: orbitPoints,
                    elements: orbitParams,
                    period: orbitParams.period
                },
                isPreview: true
            };

            // Clear any existing preview first to ensure clean state
            this.clearPreview(satellite.id);
            
            // Update visualization
            console.log('[ManeuverPreviewSystem] Creating visualization with data:', previewData);
            this._updateVisualization(satellite, previewData);
            console.log('[ManeuverPreviewSystem] Preview creation completed');

            return previewData;

        } catch (error) {
            console.error('[ManeuverPreviewSystem] Error creating preview:', error);
            return null;
        }
    }

    /**
     * Create Hohmann transfer preview
     */
    async createHohmannPreview(params) {
        const {
            satellite,
            targetSma,
            targetEcc = 0,
            burnTimeMode = 'optimal'
        } = params;

        if (!this.enabled || !satellite?.id) return null;

        try {
            const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
            const physicsSat = physicsEngine.satellites.get(satellite.id);
            if (!physicsSat) return null;

            // Calculate Hohmann transfer
            const transfer = Orbital.transfers.calculateHohmann(
                physicsSat.position,
                physicsSat.velocity,
                targetSma,
                physicsSat.centralBodyNaifId
            );

            if (!transfer.success) {
                console.warn('[ManeuverPreviewSystem] Hohmann calculation failed:', transfer.error);
                return null;
            }

            // Create preview data for both burns
            const currentTime = physicsEngine.getSimulatedTime();
            
            const burn1Data = {
                satelliteId: satellite.id,
                nodeId: `${satellite.id}_preview_hohmann_1`,
                executionTime: new Date(currentTime.getTime() + transfer.timeToTransfer1 * 1000),
                positionAtManeuver: transfer.burn1Position,
                velocityBeforeManeuver: transfer.burn1VelocityBefore,
                velocityAfterManeuver: transfer.burn1VelocityAfter,
                deltaV: transfer.burn1DeltaV,
                deltaMagnitude: transfer.burn1Magnitude,
                orbitData: {
                    points: this._generateOrbitPoints(
                        transfer.burn1Position,
                        transfer.burn1VelocityAfter,
                        physicsSat.centralBodyNaifId,
                        transfer.transferOrbitPeriod,
                        180
                    ),
                    period: transfer.transferOrbitPeriod
                },
                isPreview: true,
                burnType: 'hohmann_1'
            };

            const burn2Data = {
                satelliteId: satellite.id,
                nodeId: `${satellite.id}_preview_hohmann_2`,
                executionTime: new Date(currentTime.getTime() + 
                    (transfer.timeToTransfer1 + transfer.transferTime) * 1000),
                positionAtManeuver: transfer.burn2Position,
                velocityBeforeManeuver: transfer.burn2VelocityBefore,
                velocityAfterManeuver: transfer.burn2VelocityAfter,
                deltaV: transfer.burn2DeltaV,
                deltaMagnitude: transfer.burn2Magnitude,
                orbitData: {
                    points: this._generateOrbitPoints(
                        transfer.burn2Position,
                        transfer.burn2VelocityAfter,
                        physicsSat.centralBodyNaifId,
                        transfer.finalOrbitPeriod,
                        180
                    ),
                    period: transfer.finalOrbitPeriod
                },
                isPreview: true,
                burnType: 'hohmann_2'
            };

            // Update visualizations
            this._updateVisualization(satellite, burn1Data, 0);
            this._updateVisualization(satellite, burn2Data, 1);

            return {
                burn1: burn1Data,
                burn2: burn2Data,
                totalDeltaV: transfer.totalDeltaV
            };

        } catch (error) {
            console.error('[ManeuverPreviewSystem] Error creating Hohmann preview:', error);
            return null;
        }
    }

    /**
     * Clear preview for a satellite
     */
    clearPreview(satelliteId) {
        const preview = this.previews.get(satelliteId);
        if (!preview) return;

        console.log('[ManeuverPreviewSystem] Clearing preview for satellite:', satelliteId);

        // Dispose all renderers
        if (Array.isArray(preview.renderers)) {
            preview.renderers.forEach(renderer => {
                if (renderer?.dispose) {
                    renderer.dispose();
                }
            });
        } else if (preview.renderer) {
            if (preview.renderer.dispose) {
                preview.renderer.dispose();
            }
        }

        this.previews.delete(satelliteId);
        console.log('[ManeuverPreviewSystem] Preview cleared for satellite:', satelliteId);
    }

    /**
     * Update visualization for preview data
     */
    _updateVisualization(satellite, previewData, index = 0) {
        console.log('[ManeuverPreviewSystem] _updateVisualization called', {
            satelliteId: satellite.id,
            previewData,
            index
        });
        
        const key = satellite.id;
        let preview = this.previews.get(key);

        if (!preview) {
            preview = { 
                data: null,
                renderer: null,
                renderers: [] 
            };
            this.previews.set(key, preview);
            console.log('[ManeuverPreviewSystem] Created new preview entry for satellite:', key);
        }

        // For Hohmann transfers, use array of renderers
        if (index > 0 || previewData.burnType?.includes('hohmann')) {
            if (!preview.renderers[index]) {
                // Create new renderer
                const renderer = new ManeuverNodeRenderer({
                    scene: this.app3d.scene,
                    satellite: satellite,
                    nodeData: previewData,
                    color: index === 0 ? 0x00ff00 : 0x0000ff, // Green for first, blue for second
                    opacity: 0.8,
                    isPreview: true,
                    font: this.app3d.font
                });
                preview.renderers[index] = renderer;
            } else {
                // Update existing renderer
                preview.renderers[index].updateFromData(previewData);
            }
        } else {
            // Single maneuver preview - use satellite's existing maneuver visualizer
            console.log('[ManeuverPreviewSystem] Using satellite maneuver visualizer for preview');
            
            if (satellite.maneuverNodeVisualizer) {
                // Create visualization data for the existing visualizer
                const visualData = {
                    nodeId: previewData.nodeId,
                    position: previewData.positionAtManeuver,
                    deltaVDirection: [
                        previewData.deltaV.radial || 0,
                        previewData.deltaV.normal || 0, 
                        previewData.deltaV.prograde || 0
                    ],
                    deltaVMagnitude: previewData.deltaMagnitude,
                    color: 0xffff00, // Yellow for preview
                    showPredictedOrbit: true,
                    predictedOrbitPoints: previewData.orbitData?.points || []
                };
                
                console.log('[ManeuverPreviewSystem] Updating satellite maneuver visualizer with:', visualData);
                satellite.maneuverNodeVisualizer.updateNodeVisualization(visualData);
                
                // Store reference for cleanup
                preview.renderer = {
                    dispose: () => {
                        if (satellite.maneuverNodeVisualizer) {
                            satellite.maneuverNodeVisualizer.removeNodeVisualization(previewData.nodeId);
                        }
                    }
                };
            } else {
                console.warn('[ManeuverPreviewSystem] Satellite has no maneuverNodeVisualizer');
            }
        }

        preview.data = previewData;
    }

    /**
     * Generate orbit points for visualization
     */
    _generateOrbitPoints(position, velocity, centralBodyId, period, numPoints) {
        const points = [];
        const dt = period / numPoints;
        
        const physicsState = this.app3d.physicsIntegration.physicsEngine.getSimulationState();
        const config = {
            id: 'temp_preview',
            position: position,
            velocity: velocity,
            centralBodyNaifId: centralBodyId,
            mass: 1000,
            dragCoefficient: 0, // No drag for preview
            crossSectionalArea: 0
        };

        // Generate the full orbit in one propagation for efficiency
        const fullOrbit = UnifiedSatellitePropagator.propagateOrbit({
            satellite: config,
            bodies: physicsState.bodies,
            duration: period,
            timeStep: period / numPoints, // Even spacing
            includeJ2: true,
            includeDrag: false, // No drag for preview orbit visualization
            includeThirdBody: false
        });
        
        // Convert orbit points to the format expected by the renderer
        fullOrbit.forEach((point, i) => {
            points.push({
                position: point.position,
                time: i * dt
            });
        });

        return points;
    }

    /**
     * Set preview visibility
     */
    setVisible(visible) {
        this.enabled = visible;
        
        // Update all existing previews
        this.previews.forEach(preview => {
            if (preview.renderer) {
                preview.renderer.setVisible(visible);
            }
            if (preview.renderers) {
                preview.renderers.forEach(r => r?.setVisible(visible));
            }
        });
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        this.previews.forEach(preview => {
            if (preview.renderer) {
                preview.renderer.dispose();
            }
            if (preview.renderers) {
                preview.renderers.forEach(r => r?.dispose());
            }
        });
        this.previews.clear();
    }
}

// Singleton instance management
let previewSystemInstance = null;

export function getManeuverPreviewSystem(app3d) {
    if (!previewSystemInstance && app3d) {
        previewSystemInstance = new ManeuverPreviewSystem(app3d);
    }
    return previewSystemInstance;
}