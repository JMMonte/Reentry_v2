/**
 * SimpleManeuverPreview.js
 * 
 * Manages visualization of maneuver nodes and their predicted orbits.
 * 
 * Lifecycle:
 * 1. createPreview() - Creates/updates active preview while editing
 * 2. commitActivePreview() - Makes the preview permanent when user saves
 * 3. clearActivePreview() - Discards uncommitted changes
 * 
 * Similar to ApsisVisualizer pattern but supports multiple permanent previews.
 */
import * as THREE from 'three';
import { UnifiedSatellitePropagator } from '../physics/core/UnifiedSatellitePropagator.js';
import { Constants } from '../physics/PhysicsAPI.js';

export class SimpleManeuverPreview {
    /** Shared sphere geometry for maneuver nodes */
    static _sphereGeometry = new THREE.SphereGeometry(1, 16, 16);

    constructor(app3d) {
        this.app3d = app3d;
        this.activePreview = null; // The preview currently being edited
        this.committedPreviews = []; // Previews that have been committed (permanent)
    }

    /**
     * Create maneuver preview following ApsisVisualizer pattern
     */
    async createPreview(satellite, deltaV, executionTime) {
        // Check if we're updating the currently active preview (being edited)
        // For the same satellite, always update the active preview rather than creating new ones
        const isUpdatingActive = this.activePreview && 
            this.activePreview.satelliteId === satellite.id;
            
        if (isUpdatingActive) {
            
            // Update the active preview properties
            this.activePreview.deltaV = deltaV;
            this.activePreview.executionTime = executionTime;
            
            // Clear old orbit line only for the active preview
            if (this.activePreview.orbitLine && this.activePreview.parent) {
                this.activePreview.parent.remove(this.activePreview.orbitLine);
                if (this.activePreview.orbitGeometry) {
                    this.activePreview.orbitGeometry.dispose();
                }
                if (this.activePreview.orbitMaterial) {
                    this.activePreview.orbitMaterial.dispose();
                }
                this.activePreview.orbitLine = null;
                this.activePreview.orbitGeometry = null;
                this.activePreview.orbitMaterial = null;
            }
            
            // Recreate orbit with new parameters
            const parent = this.activePreview.parent;
            const hasDeltaV = deltaV && (deltaV.prograde || deltaV.normal || deltaV.radial);
            
            if (hasDeltaV) {
                try {
                    await this._createPreviewOrbit(satellite, deltaV, executionTime, parent);
                } catch (orbitError) {
                    console.error('[SimpleManeuverPreview] Error creating orbit preview:', orbitError);
                }
            }
            
            return this.activePreview;
        }
        
        // This is a new preview (or first preview for this satellite)

        try {
            // Get satellite's orbit group (same parent as satellite mesh and apsis)
            const orbitGroup = satellite.planetConfig?.getOrbitGroup?.() || satellite.planetConfig?.orbitGroup;
            const parent = orbitGroup || satellite.scene || this.app3d.scene;
            
            if (!parent) {
                console.error('[SimpleManeuverPreview] No parent found for satellite');
                return null;
            }

            // Create maneuver node material using preview color (yellow/orange)
            const nodeMaterial = new THREE.MeshBasicMaterial({
                color: 0xffa500, // Orange for maneuver nodes
                transparent: true,
                opacity: 0.9
            });

            // Create maneuver node mesh using shared geometry (like ApsisVisualizer)
            const nodeMesh = new THREE.Mesh(SimpleManeuverPreview._sphereGeometry, nodeMaterial);
            
            // Position at satellite's current location (will be updated by orbit manager)
            if (satellite.position) {
                nodeMesh.position.copy(satellite.position);
            } else {
                console.warn('[SimpleManeuverPreview] Satellite has no position, using origin');
                nodeMesh.position.set(0, 0, 0);
            }
            
            // Add camera-distance scaling like ApsisVisualizer
            nodeMesh.onBeforeRender = (renderer, scene, camera) => {
                const worldPos = new THREE.Vector3();
                nodeMesh.getWorldPosition(worldPos);
                const distance = camera.position.distanceTo(worldPos);
                const scale = distance * 0.003; // Same scaling as apsis
                nodeMesh.scale.set(scale, scale, scale);
            };
            
            // Add to same parent as satellite mesh and apsis
            parent.add(nodeMesh);

            // Create preview orbit if we have deltaV
            const hasDeltaV = deltaV && (deltaV.prograde || deltaV.normal || deltaV.radial);
            
            if (hasDeltaV) {
                try {
                    await this._createPreviewOrbit(satellite, deltaV, executionTime, parent);
                } catch (orbitError) {
                    console.error('[SimpleManeuverPreview] Error creating orbit preview during initial creation:', orbitError);
                    // Continue anyway - at least show the node
                }
            }

            // Create preview object
            const preview = {
                satelliteId: satellite.id,
                nodeMesh: nodeMesh,
                parent: parent,
                material: nodeMaterial,
                deltaV: deltaV,
                executionTime: executionTime,
                orbitLine: null,
                orbitGeometry: null,
                orbitMaterial: null
            };
            
            // Set as active preview (not yet committed)
            this.activePreview = preview;

            return preview;

        } catch (error) {
            console.error('[SimpleManeuverPreview] Error creating preview:', error);
            return null;
        }
    }

    /**
     * Create preview orbit visualization
     * @private
     */
    async _createPreviewOrbit(satellite, deltaV, executionTime, parent) {
        try {
            const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
            if (!physicsEngine) {
                console.warn('[SimpleManeuverPreview] No physics engine available for orbit preview');
                return;
            }

            // Get central body (no default - must match actual satellite)
            const centralBodyId = satellite.centralBodyNaifId;
            if (!centralBodyId) {
                console.error('[SimpleManeuverPreview] No central body ID found for satellite');
                return;
            }
            const centralBody = physicsEngine.bodies?.[centralBodyId];
            if (!centralBody) {
                console.warn('[SimpleManeuverPreview] No central body found for ID:', centralBodyId);
                return;
            }

            // Calculate position at maneuver time
            const currentTime = physicsEngine.getSimulatedTime();
            const timeToManeuver = (executionTime.getTime() - currentTime) / 1000; // Convert to seconds
            

            let stateAtManeuver;
            
            // Get existing maneuver nodes from physics engine
            const existingNodes = physicsEngine.satelliteEngine?.getManeuverNodes?.(satellite.id) || [];
            
            // Sort nodes by execution time
            const sortedNodes = [...existingNodes].sort((a, b) => {
                const timeA = a.executionTime instanceof Date ? a.executionTime.getTime() : new Date(a.executionTime).getTime();
                const timeB = b.executionTime instanceof Date ? b.executionTime.getTime() : new Date(b.executionTime).getTime();
                return timeA - timeB;
            });
            
            // Find nodes that execute before our preview time
            const nodesBeforePreview = sortedNodes.filter(node => {
                const nodeTime = node.executionTime instanceof Date ? node.executionTime : new Date(node.executionTime);
                return nodeTime.getTime() < executionTime.getTime();
            });
            
            // Get satellite state safely
            let satPosition = satellite.position?.toArray ? satellite.position.toArray() : [0, 0, 0];
            let satVelocity = satellite.velocity?.toArray ? satellite.velocity.toArray() : [0, 0, 0];
            
            // If we have nodes before this preview, we need to propagate through them
            if (nodesBeforePreview.length > 0) {
                
                // Start from current satellite state
                let currentPos = [...satPosition];
                let currentVel = [...satVelocity];
                let lastTime = currentTime;
                
                // Propagate through each maneuver
                for (const node of nodesBeforePreview) {
                    const nodeTime = node.executionTime instanceof Date ? node.executionTime : new Date(node.executionTime);
                    const timeDiff = (nodeTime.getTime() - lastTime) / 1000; // seconds
                    
                    if (timeDiff > 0) {
                        // Propagate to this maneuver
                        const propagation = UnifiedSatellitePropagator.propagateOrbit({
                            satellite: {
                                position: currentPos,
                                velocity: currentVel,
                                centralBodyNaifId: centralBodyId,
                                mass: satellite.mass,
                                crossSectionalArea: satellite.crossSectionalArea,
                                dragCoefficient: satellite.dragCoefficient
                            },
                            bodies: physicsEngine.bodies,
                            duration: timeDiff,
                            timeStep: Math.min(60, Math.max(1, timeDiff / 100)),
                            includeJ2: true,
                            includeDrag: true,
                            includeThirdBody: false
                        });
                        
                        if (propagation && propagation.length > 0) {
                            const stateAtNode = propagation[propagation.length - 1];
                            currentPos = stateAtNode.position;
                            currentVel = stateAtNode.velocity;
                            
                            // Apply the maneuver
                            const appliedVel = this._applyDeltaV(currentVel, node.deltaV, currentPos);
                            currentVel = appliedVel;
                        }
                    }
                    
                    lastTime = nodeTime.getTime();
                }
                
                // Update starting position/velocity to post-maneuver state
                satPosition = currentPos;
                satVelocity = currentVel;
                
                // Now propagate from last maneuver to preview time
                const finalTimeDiff = (executionTime.getTime() - lastTime) / 1000;
                
                if (finalTimeDiff < 1) {
                    stateAtManeuver = {
                        position: satPosition,
                        velocity: satVelocity,
                        centralBodyId: centralBodyId
                    };
                } else {
                    const finalProp = UnifiedSatellitePropagator.propagateOrbit({
                        satellite: {
                            position: satPosition,
                            velocity: satVelocity,
                            centralBodyNaifId: centralBodyId,
                            mass: satellite.mass,
                            crossSectionalArea: satellite.crossSectionalArea,
                            dragCoefficient: satellite.dragCoefficient
                        },
                        bodies: physicsEngine.bodies,
                        duration: finalTimeDiff,
                        timeStep: Math.min(60, Math.max(1, finalTimeDiff / 100)),
                        includeJ2: true,
                        includeDrag: true,
                        includeThirdBody: false
                    });
                    
                    if (finalProp && finalProp.length > 0) {
                        stateAtManeuver = finalProp[finalProp.length - 1];
                    } else {
                        stateAtManeuver = {
                            position: satPosition,
                            velocity: satVelocity,
                            centralBodyId: centralBodyId
                        };
                    }
                }
            } else {
                // No existing maneuvers, proceed as before
                const timeToManeuver = (executionTime.getTime() - currentTime) / 1000;
                
                // If maneuver is immediate or very close, use current state
                if (Math.abs(timeToManeuver) < 1) {
                    stateAtManeuver = {
                        position: satPosition,
                        velocity: satVelocity,
                        centralBodyId: centralBodyId
                    };
                } else {
                    // Propagate to maneuver time
                    try {
                        const orbitPoints = UnifiedSatellitePropagator.propagateOrbit({
                            satellite: {
                                position: satPosition,
                                velocity: satVelocity,
                                centralBodyNaifId: centralBodyId,
                                mass: satellite.mass,
                                crossSectionalArea: satellite.crossSectionalArea,
                                dragCoefficient: satellite.dragCoefficient
                            },
                            bodies: physicsEngine.bodies,
                            duration: timeToManeuver,
                            timeStep: Math.min(60, Math.max(1, timeToManeuver / 100)), // Adaptive time step
                            includeJ2: true,
                            includeDrag: true,
                            includeThirdBody: false
                        });

                        if (!orbitPoints || orbitPoints.length === 0) {
                            console.error('[SimpleManeuverPreview] Failed to propagate to maneuver time');
                            return;
                        }

                        // Get the state at maneuver time (last point in the array)
                        stateAtManeuver = orbitPoints[orbitPoints.length - 1];
                    } catch (propError) {
                        console.error('[SimpleManeuverPreview] Error during propagation:', propError);
                        return;
                    }
                }
            }
            
            // Update maneuver node position to the actual maneuver location
            if (this.activePreview && this.activePreview.nodeMesh) {
                this.activePreview.nodeMesh.position.set(
                    stateAtManeuver.position[0],
                    stateAtManeuver.position[1],
                    stateAtManeuver.position[2]
                );
            }

            // Apply deltaV at maneuver position
            const maneuverVelocity = this._applyDeltaV(stateAtManeuver.velocity, deltaV, stateAtManeuver.position);
            
            // Find any maneuvers that come after this preview
            const nodesAfterPreview = sortedNodes.filter(node => {
                const nodeTime = node.executionTime instanceof Date ? node.executionTime : new Date(node.executionTime);
                return nodeTime.getTime() > executionTime.getTime();
            });
            
            // Create post-burn orbit points
            const postBurnOrbitPoints = await this._propagatePostBurnOrbit(
                stateAtManeuver.position,
                maneuverVelocity,
                centralBody,
                satellite.centralBodyNaifId,
                physicsEngine,
                executionTime,
                nodesAfterPreview,
                satellite
            );

            if (postBurnOrbitPoints && postBurnOrbitPoints.length > 2) {
                // Create orbit line visualization
                const orbitObjects = this._createOrbitLine(postBurnOrbitPoints, parent);
                
                // Store orbit references in the active preview
                if (this.activePreview && orbitObjects) {
                    this.activePreview.orbitLine = orbitObjects.orbitLine;
                    this.activePreview.orbitMaterial = orbitObjects.material;
                    this.activePreview.orbitGeometry = orbitObjects.geometry;
                }
            }

        } catch (error) {
            console.error('[SimpleManeuverPreview] Error creating preview orbit:', error);
        }
    }

    /**
     * Apply deltaV in local orbital frame
     * @private
     */
    _applyDeltaV(velocity, deltaV, position) {
        // Calculate local orbital frame (prograde, normal, radial)
        const r = new THREE.Vector3(...position);
        const v = new THREE.Vector3(...velocity);
        
        // Prograde: along velocity vector
        const prograde = v.clone().normalize();
        
        // Normal: perpendicular to orbital plane
        const normal = r.clone().cross(v).normalize();
        
        // Radial: from central body to satellite
        const radial = r.clone().normalize();
        
        // Apply deltaV components
        const deltaVVector = new THREE.Vector3()
            .addScaledVector(prograde, deltaV.prograde)
            .addScaledVector(normal, deltaV.normal)
            .addScaledVector(radial, deltaV.radial);
        
        // Return new velocity
        return [
            velocity[0] + deltaVVector.x,
            velocity[1] + deltaVVector.y,
            velocity[2] + deltaVVector.z
        ];
    }

    /**
     * Propagate post-burn orbit for visualization
     * @private
     */
    async _propagatePostBurnOrbit(position, velocity, centralBody, centralBodyId, physicsEngine, startTime, futureNodes = [], satellite) {
        try {
            // First, determine the orbital characteristics to adapt preview length
            const r = Math.sqrt(position[0]**2 + position[1]**2 + position[2]**2);
            const v = Math.sqrt(velocity[0]**2 + velocity[1]**2 + velocity[2]**2);
            const mu = centralBody.GM || (Constants.PHYSICS.G * centralBody.mass);
            
            // Calculate specific orbital energy to determine orbit type
            const energy = (v * v) / 2 - mu / r;
            const isHyperbolic = energy >= 0;
            
            // Calculate semi-major axis
            const a = -mu / (2 * energy);
            
            // Estimate orbital period for elliptical orbits
            let duration, timeStep;
            if (!isHyperbolic && a > 0) {
                // Elliptical orbit - show at least one full orbit
                const period = 2 * Math.PI * Math.sqrt(a * a * a / mu);
                duration = Math.min(period * 1.5, 86400); // Show 1.5 orbits or max 24 hours
                timeStep = Math.max(period / 200, 30); // 200 points per orbit, min 30 seconds
                
            } else {
                // Hyperbolic or parabolic - show escape trajectory
                duration = 3600 * 4; // 4 hours for escape trajectories
                timeStep = 60; // 1 minute steps
            }
            
            // If we have future nodes, limit duration to the next node
            if (futureNodes.length > 0) {
                const nextNode = futureNodes[0];
                const nextNodeTime = nextNode.executionTime instanceof Date ? nextNode.executionTime : new Date(nextNode.executionTime);
                const timeToNextNode = (nextNodeTime.getTime() - startTime.getTime()) / 1000; // seconds
                
                if (timeToNextNode > 0 && timeToNextNode < duration) {
                    duration = timeToNextNode;
                }
            }
            
            // Use UnifiedSatellitePropagator with correct params format
            const orbitPoints = UnifiedSatellitePropagator.propagateOrbit({
                satellite: {
                    position: position,
                    velocity: velocity,
                    centralBodyNaifId: centralBodyId,
                    mass: satellite.mass,
                    crossSectionalArea: satellite.crossSectionalArea,
                    dragCoefficient: satellite.dragCoefficient
                },
                bodies: physicsEngine.bodies,
                duration: duration,
                timeStep: timeStep,
                includeJ2: true,
                includeDrag: false, // No drag for preview clarity
                includeThirdBody: false
            });
            
            return orbitPoints || [];
        } catch (error) {
            console.error('[SimpleManeuverPreview] Error propagating post-burn orbit:', error);
            return [];
        }
    }

    /**
     * Create orbit line visualization
     * @private
     */
    _createOrbitLine(orbitPoints, parent) {
        const positions = new Float32Array(orbitPoints.length * 3);
        
        for (let i = 0; i < orbitPoints.length; i++) {
            const point = orbitPoints[i];
            positions[i * 3] = point.position[0];
            positions[i * 3 + 1] = point.position[1];
            positions[i * 3 + 2] = point.position[2];
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Create dashed line material for preview
        const material = new THREE.LineDashedMaterial({
            color: 0xffffff, // White for preview
            dashSize: 10,
            gapSize: 5,
            opacity: 0.7,
            transparent: true
        });
        
        const orbitLine = new THREE.Line(geometry, material);
        orbitLine.computeLineDistances();
        orbitLine.frustumCulled = false;
        
        parent.add(orbitLine);
        
        // Return the orbit objects for storage in preview
        return { orbitLine, material, geometry };
    }

    /**
     * Clear all previews (both active and committed)
     */
    clearAllPreviews() {
        
        // Clear active preview
        if (this.activePreview) {
            this._removePreviewFromScene(this.activePreview);
            this.activePreview = null;
        }
        
        // Clear all committed previews
        for (const preview of this.committedPreviews) {
            this._removePreviewFromScene(preview);
        }
        
        this.committedPreviews = [];
    }
    
    /**
     * Remove a preview from the scene
     * @private
     */
    _removePreviewFromScene(preview) {
        // Remove node mesh from parent
        if (preview.nodeMesh && preview.parent) {
            preview.parent.remove(preview.nodeMesh);
            // Don't dispose shared geometry, only dispose material
            preview.material.dispose();
        }
        
        // Remove orbit line if exists
        if (preview.orbitLine && preview.parent) {
            preview.parent.remove(preview.orbitLine);
            if (preview.orbitGeometry) {
                preview.orbitGeometry.dispose();
            }
            if (preview.orbitMaterial) {
                preview.orbitMaterial.dispose();
            }
        }
    }
    
    /**
     * Clear a specific committed preview by satellite ID and execution time
     */
    clearCommittedPreview(satelliteId, executionTime) {
        const index = this.committedPreviews.findIndex(p => 
            p.satelliteId === satelliteId &&
            Math.abs(p.executionTime.getTime() - executionTime.getTime()) < 1000
        );
        
        if (index >= 0) {
            const preview = this.committedPreviews[index];
            
            // Remove from scene
            this._removePreviewFromScene(preview);
            
            // Remove from array
            this.committedPreviews.splice(index, 1);
        }
    }
    
    /**
     * Clear only the active preview (discard uncommitted changes)
     */
    clearActivePreview() {
        if (this.activePreview) {
            this._removePreviewFromScene(this.activePreview);
            this.activePreview = null;
        }
    }
    
    
    /**
     * Commit the active preview (make it permanent)
     */
    commitActivePreview() {
        if (this.activePreview) {
            // Move from active to committed
            this.committedPreviews.push(this.activePreview);
            this.activePreview = null;
        }
    }
    
    /**
     * Check if we have any previews (active or committed)
     */
    hasAnyPreviews() {
        return !!this.activePreview || this.committedPreviews.length > 0;
    }
    
    /**
     * Get count of committed previews
     */
    getCommittedCount() {
        return this.committedPreviews.length;
    }
    
    /**
     * Get all committed preview data
     */
    getCommittedPreviews() {
        return this.committedPreviews.map(preview => ({
            satelliteId: preview.satelliteId,
            deltaV: preview.deltaV,
            executionTime: preview.executionTime
        }));
    }

    /**
     * Update preview when parameters change
     */
    async updatePreview(satellite, deltaV, executionTime) {
        // Always recreate the preview to ensure it's up to date
        // The createPreview method already handles reusing the node mesh
        return this.createPreview(satellite, deltaV, executionTime);
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        this.clearAllPreviews();
    }
}