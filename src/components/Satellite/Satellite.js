// Satellite.js
import * as THREE from 'three';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
// import { OrbitPath } from './OrbitPath.js';
import { SatelliteVisualizer } from './SatelliteVisualizer.js';
import { GroundtrackPath } from './GroundtrackPath.js';
import { ManeuverNodeVisualizer } from './ManeuverNodeVisualizer.js';
import { createManeuverNodeDTO, createManeuverVisualizationDTO } from '../../types/DataTransferObjects.js';
import { PhysicsAPI } from '../../physics/PhysicsAPI.js';

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
     */
    constructor({
        scene, id, color, app3d, name, planetConfig, centralBodyNaifId,
    }) {
        this.app3d = app3d;
        this.scene = scene;
        this.id = id;
        this.name = name ?? `Satellite ${id}`;
        this.color = color;
        this.planetConfig = planetConfig;
        this.centralBodyNaifId = centralBodyNaifId;
        this._initVisuals();
        this.maneuverNodes = [];
        this.maneuverNodeVisualizer = new ManeuverNodeVisualizer(scene, this);
        
        // Listen for maneuver events from physics engine
        this._setupManeuverEventListeners();
        
        // Request orbit update from new orbit manager after a short delay
        // to ensure physics engine has the satellite data
        if (this.app3d?.satelliteOrbitManager) {
            setTimeout(() => {
                this.app3d.satelliteOrbitManager.updateSatelliteOrbit(this.id);
            }, 100);
        }
    }

    _initVisuals() {
        this.visualizer = new SatelliteVisualizer(this.color, undefined, this.app3d);
        if (this.planetConfig && this.planetConfig.orbitGroup) {
            // Add to orbitGroup so satellite moves in inertial space relative to planet
            this.planetConfig.orbitGroup.add(this.visualizer.mesh);
            console.log(`[Satellite] Added mesh for satellite ${this.id} to planetConfig.orbitGroup`, this.planetConfig.orbitGroup.name || this.planetConfig.orbitGroup, this.visualizer.mesh);
        } else {
            this.visualizer.addToScene(this.scene);
            console.warn(`[Satellite] Added mesh for satellite ${this.id} directly to scene (no valid planetConfig)`, this.visualizer.mesh);
        }
        // Skip old orbit path - using new SatelliteOrbitManager instead
        // this.orbitPath = new OrbitPath(this.color);
        // this.scene.add(this.orbitPath.orbitLine);
        // this.orbitPath.orbitLine.visible = this.app3d.getDisplaySetting('showOrbits');
        this.apsisVisualizer = new ApsisVisualizer(this.scene, this.color);
        this.apsisVisualizer.setVisible(this.app3d.getDisplaySetting('showOrbits'));
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
            
            // Debug extreme velocity issue
            const velMag = Math.sqrt(satState.velocity[0]**2 + satState.velocity[1]**2 + satState.velocity[2]**2);
            if (velMag > 50) {
                console.error(`[Satellite.updateVisualsFromState] EXTREME VELOCITY for satellite ${this.id}:`);
                console.error(`  Velocity: [${satState.velocity[0].toFixed(3)}, ${satState.velocity[1].toFixed(3)}, ${satState.velocity[2].toFixed(3)}] km/s`);
                console.error(`  Velocity magnitude: ${velMag.toFixed(3)} km/s`);
                console.error(`  Position: [${satState.position[0].toFixed(1)}, ${satState.position[1].toFixed(1)}, ${satState.position[2].toFixed(1)}] km`);
                // Clamp velocity to reasonable values to prevent crashes
                const maxVel = 50; // km/s
                if (velMag > maxVel) {
                    const scale = maxVel / velMag;
                    satState.velocity = satState.velocity.map(v => v * scale);
                    console.warn(`[Satellite] Clamped velocity to ${maxVel} km/s`);
                }
            }
        }
        
        // Debug: Log position updates
        if (!this._lastUpdateLogTime || Date.now() - this._lastUpdateLogTime > 1000) {
            // console.log(`[Satellite ${this.id}] updateVisualsFromState - position: [${satState.position.map(v => v.toFixed(1)).join(', ')}] km`);
            // console.log(`  velocity: [${satState.velocity.map(v => v.toFixed(3)).join(', ')}] km/s, speed: ${satState.speed?.toFixed(3)} km/s`);
            this._lastUpdateLogTime = Date.now();
        }
        
        // satState.position is already planet-centric (relative to central body)
        // Since the mesh is parented to the central body's group, we can use it directly
        this.visualizer.mesh.position.set(
            satState.position[0],
            satState.position[1],
            satState.position[2]
        );
        
        // Store physics state for other components
        const oldPos = this.position ? this.position.clone() : null;
        const oldVel = this.velocity ? this.velocity.clone() : null;
        
        this.position = new THREE.Vector3(...satState.position);
        this.velocity = new THREE.Vector3(...satState.velocity);
        if (satState.acceleration) {
            this.acceleration = new THREE.Vector3(...satState.acceleration);
        }
        
        // Check if orbit needs update (significant change in state)
        if (this.app3d?.satelliteOrbitManager && oldPos && oldVel) {
            const posDiff = this.position.distanceTo(oldPos);
            const velDiff = this.velocity.distanceTo(oldVel);
            
            // Update orbit if position changed by >10km or velocity by >0.1km/s
            if (posDiff > 10 || velDiff > 0.1) {
                this.app3d.satelliteOrbitManager.updateSatelliteOrbit(this.id);
            }
        }
    }


    setVisible(v) {
        const showOrbit = v && this.app3d.getDisplaySetting('showOrbits');
        this.visualizer.setVisible(v);
        // Orbit visibility handled by SatelliteOrbitManager
        this.apsisVisualizer.setVisible(showOrbit);
    }

    setColor(c) {
        this.color = c;
        this.visualizer.setColor(c);
        
        // Update orbit color in new manager
        if (this.app3d?.satelliteOrbitManager) {
            this.app3d.satelliteOrbitManager.updateSatelliteColor(this.id, c);
        }
        
        // Update physics engine (single source of truth)
        if (this.app3d?.physicsIntegration?.updateSatelliteProperty) {
            this.app3d.physicsIntegration.updateSatelliteProperty(this.id, 'color', c);
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
        
        // Clean up maneuver visualizations
        this.maneuverNodeVisualizer?.dispose();
        
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
            console.log(`[Satellite] setCentralBody: mesh parented to getOrbitGroup() of`, parentBody.name || parentBody, this.visualizer.mesh);
        } else if (parentBody instanceof THREE.Group) {
            parentBody.add(this.visualizer.mesh);
            console.log(`[Satellite] setCentralBody: mesh parented to THREE.Group`, parentBody.name || parentBody, this.visualizer.mesh);
        } else if (parentBody.getMesh) {
            parentBody.getMesh().add(this.visualizer.mesh);
            console.log(`[Satellite] setCentralBody: mesh parented to getMesh() of`, parentBody.name || parentBody, this.visualizer.mesh);
        } else {
            console.warn(`[Satellite] setCentralBody: no valid parent group for naifId ${naifId}`);
        }
        // Log mesh world position after parenting
        const meshWorldPos = new THREE.Vector3();
        this.visualizer.mesh.getWorldPosition(meshWorldPos);
        console.log(`[Satellite] Mesh world position after parenting:`, meshWorldPos);
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
            this._updateManeuverVisualization(event.detail.maneuverNode);
        };
        
        this._onManeuverRemoved = (event) => {
            if (event.detail.satelliteId !== this.id) return;
            this.maneuverNodeVisualizer.removeNodeVisualization(event.detail.nodeId);
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
    _updateManeuverVisualization(maneuverNode) {
        if (!this.position || !this.velocity) return;
        
        // Request maneuver node visualization from orbit manager
        // This will calculate position at maneuver time and post-maneuver orbit
        if (this.app3d?.satelliteOrbitManager) {
            this.app3d.satelliteOrbitManager.requestManeuverNodeVisualization(
                this.id,
                maneuverNode
            );
        } else {
            console.warn('Orbit manager not available for maneuver node visualization');
        }
    }
    
    /**
     * Add a maneuver node (delegates to physics engine)
     */
    addManeuverNode(executionTime, deltaVLocal) {
        if (!this.app3d?.physicsManager?.physicsEngine) {
            console.error('Physics engine not available');
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
        const nodeId = this.app3d.physicsManager.physicsEngine.addManeuverNode(
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
        if (!this.app3d?.physicsManager?.physicsEngine) {
            console.error('Physics engine not available');
            return;
        }
        
        // Remove from physics engine
        this.app3d.physicsManager.physicsEngine.removeManeuverNode(
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
