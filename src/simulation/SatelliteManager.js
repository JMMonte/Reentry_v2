import { Satellite } from '../components/Satellite/Satellite.js';
import { Constants } from '../utils/Constants.js';
import * as THREE from 'three';

/**
 * Manages satellites and physics worker for App3D.
 */
export class SatelliteManager {
    /**
     * @param {App3D} app3d - Reference to the main App3D instance
     */
    constructor(app3d) {
        this.app3d = app3d;
        this._satellites = {};
        this._satelliteAddQueue = [];
        this.physicsWorker = null;
        this.workerInitialized = false;
        this._lastTimeWarp = undefined;
    }

    /**
     * Add a satellite to the scene and physics.
     * @param {Object} params - Satellite parameters
     * @returns {Satellite}
     */
    addSatellite(params) {
        const satellite = new Satellite({ ...params, scene: this.app3d.scene, app3d: this.app3d });
        // Inherit display settings from the simulation
        const dsm = this.app3d.displaySettingsManager;
        if (dsm) {
            if (typeof satellite.setVectorsVisible === 'function') {
                satellite.setVectorsVisible(dsm.getSetting('showSatVectors'));
            }
            if (satellite.orbitLine) {
                satellite.orbitLine.visible = dsm.getSetting('showOrbits');
            }
            if (satellite.apsisVisualizer && typeof satellite.apsisVisualizer.setVisible === 'function') {
                satellite.apsisVisualizer.setVisible(dsm.getSetting('showOrbits'));
            }
            if (satellite.traceLine) {
                satellite.traceLine.visible = dsm.getSetting('showTraces');
            }
            if (satellite.groundTrack && typeof satellite.groundTrack.setVisible === 'function') {
                satellite.groundTrack.setVisible(dsm.getSetting('showGroundTraces'));
            }
        }
        // Set initial timeWarp
        if (this.app3d && this.app3d.timeUtils) {
            satellite.timeWarp = this.app3d.timeUtils.timeWarp;
        }
        this._satellites[satellite.id] = satellite;
        this._checkPhysicsWorkerNeeded();
        this._updateSatelliteList();
        if (this.physicsWorker && this.workerInitialized) {
            this._addSatelliteToWorker(satellite);
        } else {
            this._satelliteAddQueue.push(satellite);
        }
        return satellite;
    }

    /**
     * Remove a satellite by ID.
     * @param {number|string} id
     */
    removeSatellite(id) {
        const satellite = this._satellites[id];
        if (satellite) {
            satellite.dispose();
            delete this._satellites[id];
            this._updateSatelliteList();
            this._checkPhysicsWorkerNeeded();
        }
    }

    /**
     * Get all satellites as an object.
     */
    getSatellites() {
        return this._satellites;
    }

    /**
     * Update all satellites (called from animation loop).
     */
    updateAll(currentTime, realDeltaTime, warpedDeltaTime) {
        // Sync timeWarp with physics worker if changed
        const currentTimeWarp = this.app3d.timeUtils.timeWarp;
        if (this.physicsWorker && this.workerInitialized && this._lastTimeWarp !== currentTimeWarp) {
            this.setTimeWarp(currentTimeWarp);
            this._lastTimeWarp = currentTimeWarp;
        }
        Object.values(this._satellites).forEach(satellite => {
            // Keep satellite.timeWarp in sync
            satellite.timeWarp = currentTimeWarp;
            if (satellite.updateSatellite) {
                satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
            }
        });
    }

    /**
     * Initialize or cleanup the physics worker as needed.
     */
    _checkPhysicsWorkerNeeded() {
        const count = Object.keys(this._satellites).length;
        if (count > 0 && !this.physicsWorker) {
            this._initPhysicsWorker();
        } else if (count === 0 && this.physicsWorker) {
            this._cleanupPhysicsWorker();
        }
    }

    _initPhysicsWorker() {
        this.physicsWorker = new Worker(new URL('../workers/physicsWorker.js', import.meta.url), { type: 'module' });
        this.workerInitialized = false;
        this.physicsWorker.onmessage = (event) => {
            const { type, data } = event.data;
            if (type === 'satellitesUpdate') {
                data.forEach(update => {
                    const sat = this._satellites[update.id];
                    if (sat) {
                        const position = new THREE.Vector3(update.position[0], update.position[1], update.position[2]);
                        const velocity = new THREE.Vector3(update.velocity[0], update.velocity[1], update.velocity[2]);
                        sat.updatePosition(position, velocity);
                    }
                });
            } else if (type === 'initialized') {
                this.workerInitialized = true;
                if (this._satelliteAddQueue.length > 0) {
                    this._satelliteAddQueue.forEach(sat => this._addSatelliteToWorker(sat));
                    this._satelliteAddQueue = [];
                }
            }
        };
        // Initialize worker
        this.physicsWorker.postMessage({
            type: 'init',
            data: {
                earthMass: Constants.earthMass,
                moonMass: Constants.moonMass,
                G: Constants.G,
                scale: Constants.scale
            }
        });
    }

    _cleanupPhysicsWorker() {
        if (this.physicsWorker) {
            this.physicsWorker.terminate();
            this.physicsWorker = null;
            this.workerInitialized = false;
        }
    }

    _addSatelliteToWorker(satellite) {
        if (!this.physicsWorker || !this.workerInitialized) return;
        this.physicsWorker.postMessage({
            type: 'addSatellite',
            data: {
                id: satellite.id,
                position: {
                    x: satellite.position.x / (Constants.metersToKm * Constants.scale),
                    y: satellite.position.y / (Constants.metersToKm * Constants.scale),
                    z: satellite.position.z / (Constants.metersToKm * Constants.scale)
                },
                velocity: {
                    x: satellite.velocity.x / (Constants.metersToKm * Constants.scale),
                    y: satellite.velocity.y / (Constants.metersToKm * Constants.scale),
                    z: satellite.velocity.z / (Constants.metersToKm * Constants.scale)
                },
                mass: satellite.mass
            }
        });
    }

    /**
     * Clean up all satellites and the worker.
     */
    dispose() {
        Object.values(this._satellites).forEach(sat => sat.dispose());
        this._satellites = {};
        this._cleanupPhysicsWorker();
    }

    /**
     * Update React/UI with the current satellite list.
     */
    _updateSatelliteList() {
        const satelliteData = Object.fromEntries(
            Object.entries(this._satellites)
                .filter(([, sat]) => sat && sat.id != null && sat.name)
                .map(([id, sat]) => [id, { id: sat.id, name: sat.name }])
        );
        document.dispatchEvent(new CustomEvent('satelliteListUpdated', {
            detail: { satellites: satelliteData }
        }));
    }

    /**
     * Set the timeWarp in the physics worker.
     */
    setTimeWarp(value) {
        if (this.physicsWorker && this.workerInitialized) {
            this.physicsWorker.postMessage({ type: 'setTimeWarp', data: { value } });
        }
    }
} 