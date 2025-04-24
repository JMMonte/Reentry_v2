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
        // track last time orbits were updated for throttling
        this._lastOrbitUpdateTime = 0;
        // Pre-calculate conversion factor from world units (km*scale) to meters for physics worker
        this._toMetersFactor = 1 / (Constants.metersToKm * Constants.scale);
        // Default scale for dynamic integration tolerance based on force magnitude
        this.sensitivityScale = 1.0;
    }

    /**
     * Add a satellite to the scene and physics.
     * @param {Object} params - Satellite parameters
     * @returns {Satellite}
     */
    addSatellite(params) {
        const satellite = new Satellite({ ...params, scene: this.app3d.scene, app3d: this.app3d });
        // Apply display settings to the new satellite
        this._applyDisplaySettings(satellite);
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

            // Remove from add queue so it won't be added to the worker later
            this._satelliteAddQueue = this._satelliteAddQueue.filter(sat => sat.id !== id);

            // Notify physics worker to remove the satellite from simulation
            if (this.physicsWorker && this.workerInitialized) {
                this.physicsWorker.postMessage({ type: 'removeSatellite', data: { id } });
            }

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
            // Get absolute world positions for Moon and Sun (km-scale) and convert to meters
            const moonMesh = this.app3d.moon.getMesh ? this.app3d.moon.getMesh() : this.app3d.moon.moonMesh;
            const worldMoon = new THREE.Vector3();
            moonMesh.getWorldPosition(worldMoon);
            const factor = this._toMetersFactor;
            const moonPosM = { x: worldMoon.x * factor, y: worldMoon.y * factor, z: worldMoon.z * factor };
            const sunMesh = this.app3d.sun && this.app3d.sun.sun ? this.app3d.sun.sun : this.app3d.sun?.sunLight;
            let sunPosM;
            if (sunMesh) {
                const worldSun = new THREE.Vector3();
                sunMesh.getWorldPosition(worldSun);
                sunPosM = { x: worldSun.x * factor, y: worldSun.y * factor, z: worldSun.z * factor };
            } else {
                sunPosM = { x: 0, y: 0, z: 0 };
            }
            this.physicsWorker.postMessage({
                type: 'updateBodies',
                data: { earthPosition: { x: 0, y: 0, z: 0 }, moonPosition: moonPosM, sunPosition: sunPosM }
            });
        }
        // Update satellites
        Object.values(this._satellites).forEach(satellite => {
            satellite.timeWarp = currentTimeWarp;
            if (satellite.updateSatellite) {
                satellite.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
            }
        });
        
        // Throttled orbit path updates
        const showOrbits = this.app3d.getDisplaySetting('showOrbits');
        const nowPerf = performance.now();
        const orbitUpdateRate = this.app3d.getDisplaySetting('orbitUpdateInterval');
        const orbitIntervalMs = 1000 / orbitUpdateRate;
        const shouldUpdatePaths = showOrbits && (!this._lastOrbitUpdateTime || nowPerf - this._lastOrbitUpdateTime >= orbitIntervalMs);
        // Predefine gravity bodies once
        const factor2 = this._toMetersFactor;
        const earthBody = { position: new THREE.Vector3(0, 0, 0), mass: Constants.earthMass };
        let moonPosM = new THREE.Vector3();
        if (this.app3d.moon) {
            const moonMesh = this.app3d.moon.getMesh?.() || this.app3d.moon.moonMesh;
            moonPosM.set(
                moonMesh.position.x * factor2,
                moonMesh.position.y * factor2,
                moonMesh.position.z * factor2
            );
        }
        const moonBody = { position: moonPosM, mass: Constants.moonMass };
        let sunPosM = new THREE.Vector3();
        if (this.app3d.sun) {
            const sunMesh = this.app3d.sun.getMesh?.() || this.app3d.sun.sunLight;
            sunPosM.set(
                sunMesh.position.x * factor2,
                sunMesh.position.y * factor2,
                sunMesh.position.z * factor2
            );
        }
        const sunBody = { position: sunPosM, mass: Constants.sunMass };
        Object.values(this._satellites).forEach(sat => {
            const path = sat.orbitPath;
            if (!path) return;
            path.setVisible(showOrbits);
            if (!shouldUpdatePaths) return;
            const els = sat.getOrbitalElements();
            if (!els) return;
            const predictionPeriods = this.app3d.getDisplaySetting('orbitPredictionInterval');
            let periodSec;
            if (predictionPeriods > 0) {
                const basePeriod = els.period;
                periodSec = (basePeriod > 0 && isFinite(basePeriod))
                    ? basePeriod * predictionPeriods
                    : Constants.secondsInDay * 7 * predictionPeriods;
            } else {
                periodSec = els.period;
            }
            const pointsPerPeriod = this.app3d.getDisplaySetting('orbitPointsPerPeriod');
            const numPoints = (pointsPerPeriod > 0)
                ? Math.ceil(pointsPerPeriod * (predictionPeriods > 0 ? predictionPeriods : 1))
                : path._maxOrbitPoints;
            path.update(sat.position.clone(), sat.velocity.clone(), sat.id,
                [earthBody, moonBody, sunBody], periodSec, numPoints);
        });
        if (shouldUpdatePaths) this._lastOrbitUpdateTime = nowPerf;
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
                        // Pass through debug data for UI
                        const debug = update.debug;
                        sat.updatePosition(position, velocity, debug);
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
        // Initialize worker with simulation constants and initial timestep/perturbation scale
        this.physicsWorker.postMessage({
            type: 'init',
            data: {
                earthMass: Constants.earthMass,
                moonMass: Constants.moonMass,
                G: Constants.G,
                scale: Constants.scale,
                timeStep: this.app3d.getDisplaySetting('physicsTimeStep'),
                perturbationScale: this.app3d.getDisplaySetting('perturbationScale'),
                sensitivityScale: this.sensitivityScale
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
        // Convert from scaled world units to meters using cached factor
        const factor = this._toMetersFactor;
        const posM = {
            x: satellite.position.x * factor,
            y: satellite.position.y * factor,
            z: satellite.position.z * factor
        };
        const velM = {
            x: satellite.velocity.x * factor,
            y: satellite.velocity.y * factor,
            z: satellite.velocity.z * factor
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

    /**
     * Update the physics worker's integration time step.
     * @param {number} value
     */
    setPhysicsTimeStep(value) {
        if (this.physicsWorker && this.workerInitialized) {
            this.physicsWorker.postMessage({ type: 'setTimeStep', data: { value } });
        }
    }

    /**
     * Update the physics worker's third-body perturbation scale.
     * @param {number} value
     */
    setPerturbationScale(value) {
        if (this.physicsWorker && this.workerInitialized) {
            this.physicsWorker.postMessage({ type: 'setPerturbationScale', data: { value } });
        }
    }

    /**
     * Update the physics worker's dynamic sensitivity scale for adaptive integrator.
     * @param {number} value
     */
    setSensitivityScale(value) {
        this.sensitivityScale = value;
        if (this.physicsWorker && this.workerInitialized) {
            this.physicsWorker.postMessage({ type: 'setSensitivityScale', data: { value } });
        }
    }

    /**
     * Apply display settings from DisplaySettingsManager to a satellite.
     * @private
     */
    _applyDisplaySettings(satellite) {
        const dsm = this.app3d.displaySettingsManager;
        if (!dsm) return;
        if (typeof satellite.setVectorsVisible === 'function') {
            satellite.setVectorsVisible(dsm.getSetting('showSatVectors'));
        }
        if (satellite.orbitLine) {
            satellite.orbitLine.visible = dsm.getSetting('showOrbits');
        }
        if (satellite.apsisVisualizer && typeof satellite.apsisVisualizer.setVisible === 'function') {
            satellite.apsisVisualizer.setVisible(dsm.getSetting('showOrbits'));
        }
    }
} 