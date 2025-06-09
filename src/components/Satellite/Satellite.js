// Satellite.js
import * as THREE from 'three';
import { ApsisVisualizer } from '../planet/ApsisVisualizer.js';
import { SatelliteVisualizer } from './SatelliteVisualizer.js';
import { GroundtrackPath } from '../../services/GroundtrackPath.js';
// ManeuverVisualizationManager removed - now using UnifiedManeuverVisualizer
import { createManeuverNodeDTO } from '../../types/DataTransferObjects.js';

/**
 * Satellite (UI/View only)
 *
 * This class is a pure UI/view for a satellite. All state is updated by the browser physics engine.
 * There is no backend, worker, or local integration logic. The only way to update position/velocity
 * is via updateFromPhysicsEngine, which is called by the physics engine integration layer.
 */
export class Satellite {
    /**
     * @param {Object} opts
     * @param {THREE.Scene}   opts.scene
     * @param {THREE.Vector3} opts.position  – ECI km
     * @param {THREE.Vector3} opts.velocity  – ECI km/s
     * @param {string|number} opts.id
     * @param {string|number|THREE.Color} opts.color
     * @param {number}  [opts.mass=100]  – kg
     * @param {number}  [opts.size=1]    – purely visual scale
     * @param {App3D}   opts.app3d
     * @param {string}  [opts.name]
     * @param {Object}  opts.planetConfig
     * @param {number}  opts.centralBodyNaifId
     * @param {Object}  [opts.commsConfig] - Communication system configuration
     */
    constructor({
        scene, id, color, app3d, name, planetConfig, centralBodyNaifId,
        position, velocity, ...otherProps
    }) {
        this.app3d = app3d;
        this.scene = scene;
        this.id = id;
        this.name = name ?? `Satellite ${id}`;
        this.color = color;
        this.planetConfig = planetConfig;
        this.centralBodyNaifId = centralBodyNaifId;
        
        // Store initial position and velocity if provided
        this.position = position ? new THREE.Vector3().copy(position) : new THREE.Vector3();
        this.velocity = velocity ? new THREE.Vector3().copy(velocity) : new THREE.Vector3();
        
        // Pre-allocate vectors for updateVisualsFromState to avoid GC pressure
        this._oldPosition = new THREE.Vector3();
        this._oldVelocity = new THREE.Vector3();
        
        // Dirty flags for optimized updates
        this._isDirty = true; // Force initial update
        this._lastUpdateTime = 0;
        this._positionThreshold = 1.0; // 1 km threshold for position changes
        this._velocityThreshold = 0.01; // 0.01 km/s threshold for velocity changes
        
        this._initVisuals();
        
        // If we have an initial position, set it on the mesh
        if (position) {
            this.visualizer.mesh.position.copy(this.position);
        }
        
        this.maneuverNodes = [];
        
        // Maneuver visualization now handled by UnifiedManeuverVisualizer
        // No need to create a separate visualizer per satellite
        
        // Listen for maneuver events from physics engine
        this._setupManeuverEventListeners();
        
        // Request orbit update from new orbit manager after a short delay
        // to ensure physics engine has the satellite data
        if (this.app3d?.satelliteOrbitManager) {
            this._orbitUpdateTimeout = setTimeout(() => {
                this.app3d.satelliteOrbitManager.updateSatelliteOrbit(this.id);
                this._orbitUpdateTimeout = null;
            }, 100);
        }
    }

    _initVisuals() {
        this.visualizer = new SatelliteVisualizer(this.color, undefined, this.app3d);
        // Get orbit group using Planet class getter method
        const orbitGroup = this.planetConfig?.getOrbitGroup?.() || this.planetConfig?.orbitGroup;
        if (orbitGroup) {
            // Add to orbitGroup so satellite moves in inertial space relative to planet
            orbitGroup.add(this.visualizer.mesh);
        } else {
            this.visualizer.addToScene(this.scene);
            console.warn(`[Satellite] Added mesh for satellite ${this.id} directly to scene (no valid planetConfig)`, this.visualizer.mesh);
        }
        // Skip old orbit path - using new SatelliteOrbitManager instead
        // this.orbitPath = new OrbitPath(this.color);
        // this.scene.add(this.orbitPath.orbitLine);
        // this.orbitPath.orbitLine.visible = this.app3d.getDisplaySetting('showOrbits');
        // Add apsis visualizer to the same parent as satellite mesh
        const apsisParent = orbitGroup || this.scene;
        this.apsisVisualizer = new ApsisVisualizer(apsisParent, this.color);
        this.apsisVisualizer.setVisible(
            this.app3d.getDisplaySetting('showOrbits') && 
            this.app3d.getDisplaySetting('showApsis')
        );
        this.groundTrackPath = new GroundtrackPath();
    }

    /**
     * Update visuals from the latest physics state.
     * @param {Object} satState - { position, velocity, acceleration, ... }
     */
    updateVisualsFromState(satState) {
        if (!this.visualizer?.mesh || !satState?.position) return;
        
        // Validate position array
        if (!Array.isArray(satState.position) || satState.position.length !== 3) {
            console.error(`[Satellite] Invalid position array for satellite ${this.id}:`, satState.position);
            return;
        }
        
        // Check for NaN or invalid values in position
        if (satState.position.some(v => !Number.isFinite(v))) {
            console.error(`[Satellite] Invalid position values for satellite ${this.id}:`, satState.position);
            
            // Try to remove this satellite from physics engine to prevent spam
            if (this.app3d?.physicsIntegration?.physicsEngine?.satelliteEngine?.removeSatellite) {
                console.warn(`[Satellite] Removing satellite ${this.id} due to invalid state`);
                this.app3d.physicsIntegration.physicsEngine.satelliteEngine.removeSatellite(this.id);
            }
            return;
        }
        
        // Validate velocity if present
        if (satState.velocity) {
            if (!Array.isArray(satState.velocity) || satState.velocity.length !== 3) {
                console.error(`[Satellite] Invalid velocity array for satellite ${this.id}:`, satState.velocity);
                return;
            }
            
            if (satState.velocity.some(v => !Number.isFinite(v))) {
                console.error(`[Satellite] Invalid velocity values for satellite ${this.id}:`, satState.velocity);
                return;
            }
            
            // Note: Velocity validation should be handled by physics engine
            // This UI component should only handle valid data from physics layer
        }
        
        // satState.position is already planet-centric (relative to central body)
        // Since the mesh is parented to the central body's group, we can use it directly
        this.visualizer.mesh.position.set(
            satState.position[0],
            satState.position[1],
            satState.position[2]
        );
        
        // Store old state for comparison
        if (this.position) {
            this._oldPosition.copy(this.position);
        }
        if (this.velocity) {
            this._oldVelocity.copy(this.velocity);
        }
        
        // Update current state - avoid creating new Vector3 if they already exist
        if (!this.position) {
            this.position = new THREE.Vector3();
        }
        this.position.set(satState.position[0], satState.position[1], satState.position[2]);
        
        if (!this.velocity) {
            this.velocity = new THREE.Vector3();
        }
        this.velocity.set(satState.velocity[0], satState.velocity[1], satState.velocity[2]);
        
        if (satState.acceleration) {
            if (!this.acceleration) {
                this.acceleration = new THREE.Vector3();
            }
            this.acceleration.set(satState.acceleration[0], satState.acceleration[1], satState.acceleration[2]);
        }
        
        // Check if orbit needs update (significant change in state)
        if (this.app3d?.satelliteOrbitManager && this._oldPosition.lengthSq() > 0) {
            const posDiff = this.position.distanceTo(this._oldPosition);
            const velDiff = this.velocity.distanceTo(this._oldVelocity);
            
            // Update orbit if position changed by >10km or velocity by >0.1km/s
            if (posDiff > 10 || velDiff > 0.1) {
                this.app3d.satelliteOrbitManager.updateSatelliteOrbit(this.id);
            }
        }
    }


    setVisible(v) {
        const showOrbit = v && this.app3d.getDisplaySetting('showOrbits');
        const showApsis = showOrbit && this.app3d.getDisplaySetting('showApsis');
        this.visualizer.setVisible(v);
        // Orbit visibility handled by SatelliteOrbitManager
        this.apsisVisualizer.setVisible(showApsis);
    }

    setColor(c, fromPhysicsUpdate = false) {
        this.color = c;
        this.visualizer.setColor(c);
        
        // Update apsis visualizer color to match satellite
        if (this.apsisVisualizer) {
            this.apsisVisualizer.updateColor(c);
        }
        
        // Update orbit color in new manager
        if (this.app3d?.satelliteOrbitManager) {
            this.app3d.satelliteOrbitManager.updateSatelliteColor(this.id, c);
        }
        
        // Use SatelliteManager to coordinate updates (prevents recursion)
        if (!fromPhysicsUpdate && this.app3d?.satellites?.updateSatelliteColor) {
            this.app3d.satellites.updateSatelliteColor(this.id, c);
        }
    }

    delete() {
        if (this.app3d?.satellites?.removeSatellite) {
            this.app3d.satellites.removeSatellite(this.id);
        } else {
            console.error('[Satellite] Cannot delete satellite: SatelliteManager not found on app3d');
        }
    }

    dispose() {
        // Clear any pending timeouts
        if (this._orbitUpdateTimeout) {
            clearTimeout(this._orbitUpdateTimeout);
            this._orbitUpdateTimeout = null;
        }
        
        // Remove visualizer mesh from its actual parent (might be planet group or scene)
        if (this.visualizer?.mesh?.parent) {
            this.visualizer.mesh.parent.remove(this.visualizer.mesh);
        }
        this.visualizer?.dispose();
        
        // Remove orbit from new manager
        if (this.app3d?.satelliteOrbitManager) {
            this.app3d.satelliteOrbitManager.removeSatelliteOrbit(this.id);
        }
        
        // Remove ground track
        this.groundTrackPath?.dispose();
        
        // Remove apsis visualizer
        this.apsisVisualizer?.dispose();
        
        // Maneuver visualizations cleaned up by UnifiedManeuverVisualizer
        const visualizer = this.app3d?.maneuverVisualizer;
        if (visualizer) {
            visualizer.clearSatellite(this.id);
        }
        
        // Remove event listeners
        this._removeManeuverEventListeners();
        
        // Dispatch deletion event
        document.dispatchEvent(new CustomEvent('satelliteDeleted', { detail: { id: this.id } }));
    }

    setCentralBody(naifId) {
        if (!this.app3d || !this.visualizer?.mesh) return;
        const parentBody = this.app3d.bodiesByNaifId?.[naifId];
        if (!parentBody) {
            console.warn(`[Satellite] setCentralBody: parentBody not found for naifId ${naifId}`);
            return;
        }
        if (this.visualizer.mesh.parent) {
            this.visualizer.mesh.parent.remove(this.visualizer.mesh);
        }
        if (parentBody.getOrbitGroup) {
            parentBody.getOrbitGroup().add(this.visualizer.mesh);
        } else if (parentBody instanceof THREE.Group) {
            parentBody.add(this.visualizer.mesh);
        } else if (parentBody.getMesh) {
            parentBody.getMesh().add(this.visualizer.mesh);
        } else {
            console.warn(`[Satellite] setCentralBody: no valid parent group for naifId ${naifId}`);
        }
        // Log mesh world position after parenting
        const meshWorldPos = new THREE.Vector3();
        this.visualizer.mesh.getWorldPosition(meshWorldPos);
    }

    getMesh() {
        return this.visualizer?.mesh;
    }
    
    /**
     * Set up event listeners for maneuver updates from physics engine
     */
    _setupManeuverEventListeners() {
        this._onManeuverAdded = (event) => {
            if (event.detail.satelliteId !== this.id) return;
            // Use unified visualizer for permanent nodes and handle cascade recalculation
            if (this.app3d?.maneuverVisualizer) {
                this.app3d.maneuverVisualizer.handleManeuverNodeAdded(this, event.detail.maneuverNode);
            }
        };
        
        this._onManeuverRemoved = (event) => {
            if (event.detail.satelliteId !== this.id) return;
            // Use unified visualizer for removal and handle cascade recalculation
            if (this.app3d?.maneuverVisualizer) {
                this.app3d.maneuverVisualizer.handleManeuverNodeRemoved(this, event.detail.nodeId);
            }
        };
        
        this._onManeuverExecuted = (event) => {
            if (event.detail.satelliteId !== this.id) return;
            // Update orbit visualization after maneuver
            if (this.app3d?.satelliteOrbitManager) {
                this.app3d.satelliteOrbitManager.updateSatelliteOrbit(this.id);
            }
        };
        
        window.addEventListener('maneuverNodeAdded', this._onManeuverAdded);
        window.addEventListener('maneuverNodeRemoved', this._onManeuverRemoved);
        window.addEventListener('maneuverExecuted', this._onManeuverExecuted);
    }
    
    /**
     * Remove maneuver event listeners
     */
    _removeManeuverEventListeners() {
        window.removeEventListener('maneuverNodeAdded', this._onManeuverAdded);
        window.removeEventListener('maneuverNodeRemoved', this._onManeuverRemoved);
        window.removeEventListener('maneuverExecuted', this._onManeuverExecuted);
    }
    
    /**
     * Update visualization for a maneuver node
     */
    // _updateManeuverVisualization removed - now handled by UnifiedManeuverVisualizer
    
    /**
     * Add a maneuver node (delegates to physics engine)
     */
    addManeuverNode(executionTime, deltaVLocal) {
        
        if (!this.app3d?.physicsIntegration?.physicsEngine) {
            console.error('[Satellite] Physics engine not available');
            return null;
        }
        
        // Create DTO
        const maneuverNode = createManeuverNodeDTO({
            executionTime,
            deltaV: {
                prograde: deltaVLocal.x,
                normal: deltaVLocal.y,
                radial: deltaVLocal.z
            }
        });
        
        // Add to physics engine
        const nodeId = this.app3d.physicsIntegration.addManeuverNode(
            this.id,
            maneuverNode
        );
        
        if (nodeId) {
            this.maneuverNodes.push(maneuverNode);
        }
        
        return maneuverNode;
    }
    
    /**
     * Remove a maneuver node (delegates to physics engine)
     */
    removeManeuverNode(node) {
        if (!this.app3d?.physicsIntegration?.physicsEngine) {
            console.error('Physics engine not available');
            return;
        }
        
        // Remove from physics engine
        this.app3d.physicsIntegration.removeManeuverNode(
            this.id,
            node.id
        );
        
        // Remove from local array
        const index = this.maneuverNodes.findIndex(n => n.id === node.id);
        if (index !== -1) {
            this.maneuverNodes.splice(index, 1);
        }
    }
}
