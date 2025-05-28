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
            this.planetConfig.getRotationGroup().add(this.visualizer.mesh);
        } else {
            this.visualizer.addToScene(this.scene);
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
            this.visualizer.mesh.position.set(
                satState.position[0],
                satState.position[1],
                satState.position[2]
            );
        }
        // Optionally update orientation, color, etc. if needed
        // (add more as needed for your visuals)
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
    }

    delete() {
        if (this.app3d?.satellites?.removeSatellite) {
            this.app3d.satellites.removeSatellite(this.id);
        } else {
            console.error('[Satellite] Cannot delete satellite: SatelliteManager not found on app3d');
        }
    }

    dispose() {
        this.visualizer?.removeFromScene(this.scene);
        this.visualizer?.dispose();
        this.scene.remove(this.orbitPath.orbitLine);
        this.orbitPath?.dispose();
        this.groundTrackPath?.dispose();
        this.apsisVisualizer?.dispose();
        for (const n of this.maneuverNodes) n.dispose();
        this.maneuverNodes.length = 0;
        this.scene.remove(this.maneuverGroup);
        document.dispatchEvent(new CustomEvent('satelliteDeleted', { detail: { id: this.id } }));
    }

    setCentralBody(naifId) {
        if (!this.app3d || !this.visualizer?.mesh) return;
        const parentBody = this.app3d.bodiesByNaifId?.[naifId];
        if (!parentBody) return;
        if (this.visualizer.mesh.parent) {
            this.visualizer.mesh.parent.remove(this.visualizer.mesh);
        }
        if (parentBody.getOrbitGroup) {
            parentBody.getOrbitGroup().add(this.visualizer.mesh);
        } else if (parentBody instanceof THREE.Group) {
            parentBody.add(this.visualizer.mesh);
        } else if (parentBody.getMesh) {
            parentBody.getMesh().add(this.visualizer.mesh);
        }
    }
}
