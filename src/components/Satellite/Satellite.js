// Satellite.js
import * as THREE from 'three';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
import { OrbitPath } from './OrbitPath.js';
import { SatelliteVisualizer } from './SatelliteVisualizer.js';
import { GroundtrackPath } from './GroundtrackPath.js';

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
        this.maneuverGroup = new THREE.Group();
        scene.add(this.maneuverGroup);
    }

    _initVisuals() {
        this.visualizer = new SatelliteVisualizer(this.color, undefined, this.app3d);
        if (this.planetConfig && typeof this.planetConfig.getRotationGroup === 'function') {
            const group = this.planetConfig.getRotationGroup();
            group.add(this.visualizer.mesh);
            console.log(`[Satellite] Added mesh for satellite ${this.id} to planetConfig.getRotationGroup()`, group.name || group, this.visualizer.mesh);
        } else {
            this.visualizer.addToScene(this.scene);
            console.warn(`[Satellite] Added mesh for satellite ${this.id} directly to scene (no valid planetConfig)`, this.visualizer.mesh);
        }
        this.orbitPath = new OrbitPath(this.color);
        this.scene.add(this.orbitPath.orbitLine);
        this.orbitPath.orbitLine.visible = this.app3d.getDisplaySetting('showOrbits');
        this.apsisVisualizer = new ApsisVisualizer(this.scene, this.color);
        this.apsisVisualizer.setVisible(this.app3d.getDisplaySetting('showOrbits'));
        this.groundTrackPath = new GroundtrackPath();
    }

    /**
     * Update visuals from the latest physics state.
     * @param {Object} satState - { position, velocity, acceleration, ... }
     */
    updateVisualsFromState(satState) {
        if (this.visualizer?.mesh && satState.position) {
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
            this.position = new THREE.Vector3(...satState.position);
            this.velocity = new THREE.Vector3(...satState.velocity);
            if (satState.acceleration) {
                this.acceleration = new THREE.Vector3(...satState.acceleration);
            }
        }
    }

    /**
     * Legacy method - redirects to updateVisualsFromState
     * @deprecated Use updateVisualsFromState instead
     */
    updateFromPhysicsEngine(position, velocity) {
        this.updateVisualsFromState({ position, velocity });
    }

    setVisible(v) {
        const showOrbit = v && this.app3d.getDisplaySetting('showOrbits');
        this.visualizer.setVisible(v);
        this.orbitPath.setVisible(showOrbit);
        this.apsisVisualizer.setVisible(showOrbit);
    }

    setColor(c) {
        this.color = c;
        this.visualizer.setColor(c);
        this.orbitPath.orbitLine.material.color.set(c);
        
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
        
        // Remove orbit visualization
        if (this.orbitPath?.orbitLine?.parent) {
            this.orbitPath.orbitLine.parent.remove(this.orbitPath.orbitLine);
        }
        this.orbitPath?.dispose();
        
        // Remove ground track
        this.groundTrackPath?.dispose();
        
        // Remove apsis visualizer
        this.apsisVisualizer?.dispose();
        
        // Remove maneuver nodes
        for (const n of this.maneuverNodes) {
            n.dispose();
        }
        this.maneuverNodes.length = 0;
        
        // Remove maneuver group
        if (this.maneuverGroup?.parent) {
            this.maneuverGroup.parent.remove(this.maneuverGroup);
        }
        
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
}
