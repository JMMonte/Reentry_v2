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
import { Orbital } from '../physics/PhysicsAPI.js';

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
     * Create preview orbit visualization using centralized physics
     * @private
     */
    async _createPreviewOrbit(satellite, deltaV, executionTime, parent) {
        try {
            const physicsEngine = this.app3d.physicsIntegration?.physicsEngine;
            if (!physicsEngine) {
                console.warn('[SimpleManeuverPreview] No physics engine available for orbit preview');
                return;
            }

            // Use PhysicsAPI.previewManeuver for consistent physics calculations
            const previewResult = Orbital.previewManeuver({
                satellite,
                deltaV,
                executionTime,
                physicsEngine,
                isPreview: true // This is a temporary preview, include existing nodes
            });
            
            if (previewResult.error) {
                console.error('[SimpleManeuverPreview] Physics API error:', previewResult.error);
                return;
            }
            
            if (!previewResult.maneuverPosition || !previewResult.orbitPoints) {
                console.warn('[SimpleManeuverPreview] No preview data returned from PhysicsAPI');
                return;
            }
            
            // Update maneuver node position to the actual maneuver location
            if (this.activePreview && this.activePreview.nodeMesh) {
                this.activePreview.nodeMesh.position.set(
                    previewResult.maneuverPosition[0],
                    previewResult.maneuverPosition[1],
                    previewResult.maneuverPosition[2]
                );
            }

            if (previewResult.orbitPoints && previewResult.orbitPoints.length > 2) {
                // Create orbit line visualization
                const orbitObjects = this._createOrbitLine(previewResult.orbitPoints, parent);
                
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