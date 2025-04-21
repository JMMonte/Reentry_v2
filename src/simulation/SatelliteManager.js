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
        // Update dynamic body positions (Earth at origin, Moon) in physicsWorker for n-body
        if (this.physicsWorker && this.workerInitialized && this.app3d.moon) {
            // Get Moon's mesh position (km-scale) and convert to meters
            const moonMesh = this.app3d.moon.getMesh ? this.app3d.moon.getMesh() : this.app3d.moon.moonMesh;
            const factor = 1 / (Constants.metersToKm * Constants.scale);
            const moonPosM = {
                x: moonMesh.position.x * factor,
                y: moonMesh.position.y * factor,
                z: moonMesh.position.z * factor
            };
            // Also grab Sun position and send all bodies
            const sunMesh = this.app3d.sun && this.app3d.sun.sun ? this.app3d.sun.sun : this.app3d.sun?.sunLight;
            const sunPosM = sunMesh ? { x: sunMesh.position.x * factor, y: sunMesh.position.y * factor, z: sunMesh.position.z * factor } : { x: 0, y: 0, z: 0 };
            this.physicsWorker.postMessage({
                type: 'updateBodies',
                data: { earthPosition: { x: 0, y: 0, z: 0 }, moonPosition: moonPosM, sunPosition: sunPosM }
            });
        }
        Object.values(this._satellites).forEach(satellite => {
            // Keep satellite.timeWarp in sync
            satellite.timeWarp = currentTimeWarp;
            if (satellite.updateSatellite) {
                satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
            }
        });
        // Draw multi-body propagated orbits (Earth + Moon) via OrbitPath worker
        const showOrbits = this.app3d.getDisplaySetting('showOrbits');
        Object.values(this._satellites).forEach(sat => {
            const path = sat.orbitPath;
            if (!path) return;
            // Toggle visibility of the path
            path.setVisible(showOrbits);
            if (!showOrbits) return;
            // derive orbital period (2-body approximation)
            const els = sat.getOrbitalElements();
            if (!els || !els.period) return;
            const period = els.period;
            // define gravitational sources: Earth, Moon, and Sun
            const factor2 = 1 / (Constants.metersToKm * Constants.scale);
            const bodies = [ { position: new THREE.Vector3(0, 0, 0), mass: Constants.earthMass } ];
            // Moon
            if (this.app3d.moon) {
                const moonMesh = this.app3d.moon.getMesh ? this.app3d.moon.getMesh() : this.app3d.moon.moonMesh;
                const moonPosM = new THREE.Vector3(
                    moonMesh.position.x * factor2,
                    moonMesh.position.y * factor2,
                    moonMesh.position.z * factor2
                );
                bodies.push({ position: moonPosM, mass: Constants.moonMass });
            }
            // Sun
            if (this.app3d.sun) {
                const sunMesh = this.app3d.sun.sun ? this.app3d.sun.sun : this.app3d.sun.sunLight;
                const sunPosM = new THREE.Vector3(
                    sunMesh.position.x * factor2,
                    sunMesh.position.y * factor2,
                    sunMesh.position.z * factor2
                );
                bodies.push({ position: sunPosM, mass: Constants.sunMass });
            }
            // Request propagation update from OrbitPath worker
            path.update(
                sat.position.clone(),
                sat.velocity.clone(),
                sat.id,
                bodies,
                period,
                path._maxOrbitPoints
            );
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
                // update each satellite's position
                data.forEach(update => {
                    const sat = this._satellites[update.id];
                    if (sat) {
                        const position = new THREE.Vector3(update.position[0], update.position[1], update.position[2]);
                        const velocity = new THREE.Vector3(update.velocity[0], update.velocity[1], update.velocity[2]);
                        sat.updatePosition(position, velocity);
                    }
                });
                // (orbit drawing now handled in updateAll)
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
        // Clear any pending satellite additions
        this._satelliteAddQueue = [];
    }

    _addSatelliteToWorker(satellite) {
        if (!this.physicsWorker || !this.workerInitialized) return;
        // Debug: log what's sent to physics worker
        const posM = {
            x: satellite.position.x / (Constants.metersToKm * Constants.scale),
            y: satellite.position.y / (Constants.metersToKm * Constants.scale),
            z: satellite.position.z / (Constants.metersToKm * Constants.scale)
        };
        const velM = {
            x: satellite.velocity.x / (Constants.metersToKm * Constants.scale),
            y: satellite.velocity.y / (Constants.metersToKm * Constants.scale),
            z: satellite.velocity.z / (Constants.metersToKm * Constants.scale)
        };

        this.physicsWorker.postMessage({
            type: 'addSatellite',
            data: {
                id: satellite.id,
                position: posM,
                velocity: velM,
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
        // Clear any pending satellite additions
        this._satelliteAddQueue = [];
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