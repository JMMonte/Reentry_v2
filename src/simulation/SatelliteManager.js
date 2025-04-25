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
        // --- Optimization additions ---
        this._moonPosM = new THREE.Vector3();
        this._sunPosM = new THREE.Vector3();
        this._earthBody = { position: new THREE.Vector3(0, 0, 0), mass: Constants.earthMass };
        this._moonBody = { position: this._moonPosM, mass: Constants.moonMass };
        this._sunBody = { position: this._sunPosM, mass: Constants.sunMass };
        this._lastPhysicsWorkerUpdate = 0;
        this._physicsWorkerUpdateInterval = 50; // 20Hz
        this._pendingSatelliteListUpdate = false;
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
        const nowPerf = performance.now();
        // Sync timeWarp with physics worker if changed
        const currentTimeWarp = this.app3d.timeUtils.timeWarp;
        if (this.physicsWorker && this.workerInitialized && this._lastTimeWarp !== currentTimeWarp) {
            this.setTimeWarp(currentTimeWarp);
            this._lastTimeWarp = currentTimeWarp;
        }
        // --- Optimization: throttle physics worker updates ---
        if (this.physicsWorker && this.workerInitialized && this.app3d.moon) {
            if (!this._lastPhysicsWorkerUpdate || nowPerf - this._lastPhysicsWorkerUpdate > this._physicsWorkerUpdateInterval) {
                // Get absolute world positions for Moon and Sun (km-scale) and convert to meters
                const moonMesh = this.app3d.moon.getMesh ? this.app3d.moon.getMesh() : this.app3d.moon.moonMesh;
                moonMesh.getWorldPosition(this._moonPosM);
                this._moonPosM.multiplyScalar(this._toMetersFactor);
                const sunMesh = this.app3d.sun && this.app3d.sun.sun ? this.app3d.sun.sun : this.app3d.sun?.sunLight;
                if (sunMesh) {
                    sunMesh.getWorldPosition(this._sunPosM);
                    this._sunPosM.multiplyScalar(this._toMetersFactor);
                } else {
                    this._sunPosM.set(0, 0, 0);
                }
                this.physicsWorker.postMessage({
                    type: 'updateBodies',
                    data: {
                        earthPosition: { x: 0, y: 0, z: 0 },
                        moonPosition: { x: this._moonPosM.x, y: this._moonPosM.y, z: this._moonPosM.z },
                        sunPosition: { x: this._sunPosM.x, y: this._sunPosM.y, z: this._sunPosM.z }
                    }
                });
                this._lastPhysicsWorkerUpdate = nowPerf;
            }
        }
        // --- Optimization: cache bodies array ---
        const bodies = [this._earthBody, this._moonBody, this._sunBody];
        // --- Optimization: single satellite loop ---
        const sats = Object.values(this._satellites);
        // Throttled orbit path updates
        const showOrbits = this.app3d.getDisplaySetting('showOrbits');
        const orbitUpdateRate = this.app3d.getDisplaySetting('orbitUpdateInterval');
        const orbitIntervalMs = 1000 / orbitUpdateRate;
        const shouldUpdatePaths = showOrbits && (!this._lastOrbitUpdateTime || nowPerf - this._lastOrbitUpdateTime >= orbitIntervalMs);
        const predPeriods = this.app3d.getDisplaySetting('orbitPredictionInterval');
        const pointsPerPeriod = this.app3d.getDisplaySetting('orbitPointsPerPeriod');
        const nonKeplerianFallbackDays = this.app3d.getDisplaySetting('nonKeplerianFallbackDays') ?? 30;        
        const currentSimTime = this.app3d.timeUtils.getSimulatedTime();
        let anyPathUpdated = false;
        for (let i = 0; i < sats.length; ++i) {
            const sat = sats[i];
            sat.timeWarp = currentTimeWarp;
            if (sat.updateSatellite) {
                sat.updateSatellite(currentTime, realDeltaTime, warpedDeltaTime);
            }
            // --- Orbit/groundtrack updates ---
            if (sat.orbitPath) {
                sat.orbitPath.setVisible(showOrbits);
            }
            const shouldUpdateGroundtrack = shouldUpdatePaths; // same throttle for both
            if (!shouldUpdatePaths && !shouldUpdateGroundtrack) continue;
            const els = sat.getOrbitalElements && sat.getOrbitalElements();
            if (!els) continue;
            // Determine sampling for orbits
            const ecc = els.eccentricity || 0;
            const isHyperbolic = ecc >= 1;
            const isNearParabolic = !isHyperbolic && ecc >= 0.99; // Check for near-parabolic
            // Prediction periods (use 1 if 0)
            const effectivePeriods = (typeof predPeriods === 'number' && predPeriods > 0) ? predPeriods : 1;
            let periodSec, numPoints;
            
            // Use fixed window for hyperbolic AND near-parabolic orbits
            if (isHyperbolic || isNearParabolic) {
                const fallbackDays = this.app3d.getDisplaySetting('nonKeplerianFallbackDays') ?? 1;
                periodSec = fallbackDays * Constants.secondsInDay;
                // Base sample count
                let rawPoints = pointsPerPeriod * fallbackDays;
                // Only apply hyperbolic multiplier inside Earth's SOI (also apply to near-parabolic for consistency)
                const rMeters = sat.position.length();
                if (rMeters <= Constants.earthSOI) {
                    const hyperMultiplier = this.app3d.getDisplaySetting('hyperbolicPointsMultiplier') ?? 1;
                    rawPoints *= hyperMultiplier;
                }
                numPoints = Math.ceil(rawPoints);
            } else {
                // Normal Elliptical: full orbit(s) based on period and prediction settings
                const basePeriod = (els.period > 0 && isFinite(els.period))
                    ? els.period
                    : nonKeplerianFallbackDays * Constants.secondsInDay;
                periodSec = basePeriod * effectivePeriods;
                numPoints = pointsPerPeriod > 0
                    ? Math.ceil(pointsPerPeriod * effectivePeriods)
                    : (sat.orbitPath?._maxOrbitPoints || 180);
            }
            // Reduce sample count outside Earth's SOI to speed up remote trajectories
            const rMeters = sat.position.length();
            if (rMeters > Constants.earthSOI) {
                numPoints = Math.max(10, Math.ceil(numPoints * 0.2));
            }
            if (shouldUpdatePaths && sat.orbitPath) {
                // Always show full orbit ellipse (ignore atmospheric cut-off)
                sat.orbitPath.update(
                    sat.position,
                    sat.velocity,
                    sat.id,
                    bodies,
                    periodSec,
                    numPoints,
                    true // allowFullEllipse: bypass atmosphere stop
                );
                anyPathUpdated = true;
            }
            if (shouldUpdateGroundtrack && sat.groundTrackPath) {
                const startTimeMs = typeof currentSimTime === 'number' ? currentSimTime : currentSimTime.getTime();
                sat.groundTrackPath.update(
                    startTimeMs,
                    sat.position, // Position is ECI in meters
                    sat.velocity, // Velocity is ECI in m/s
                    sat.id,
                    bodies,
                    periodSec,
                    numPoints
                );
                anyPathUpdated = true;
            }
        }
        if (anyPathUpdated && shouldUpdatePaths) {
            this._lastOrbitUpdateTime = nowPerf;
        }
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
        if (this._pendingSatelliteListUpdate) return;
        this._pendingSatelliteListUpdate = true;
        setTimeout(() => {
            const satelliteData = Object.fromEntries(
                Object.entries(this._satellites)
                    .filter(([, sat]) => sat && sat.id != null && sat.name)
                    .map(([id, sat]) => [id, { id: sat.id, name: sat.name }])
            );
            document.dispatchEvent(new CustomEvent('satelliteListUpdated', {
                detail: { satellites: satelliteData }
            }));
            this._pendingSatelliteListUpdate = false;
        }, 0);
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