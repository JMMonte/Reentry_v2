// SatelliteManager.js

import * as THREE from 'three';
import { Satellite } from '../components/Satellite/Satellite.js';
import { OrbitPath } from '../components/Satellite/OrbitPath.js';
import { Constants } from '../utils/Constants.js';

/**
 * Manages satellites, the physics Web-Worker and all related scene updates.
 * – Uses Map<> for O(1) ops and cleaner iteration
 * – Centralises worker messaging in _post()
 * – Minimises Vector3 allocations & loops
 * – Batches UI updates with queueMicrotask()
 */
export class SatelliteManager {
    /** Throttle interval for worker updates (ms) */
    static WORKER_THROTTLE_MS = 50;

    /**
     * @param {App3D} app3d – Main App3D instance
     */
    constructor(app3d) {
        /** @readonly */ this.app3d = app3d;

        /** @type {Map<string|number, Satellite>} */
        this._satellites = new Map();
        this._satelliteAddQueue = [];

        // Worker state
        this._worker = null;
        this._workerReady = false;
        this._lastWorkerTick = 0;

        // Time-sync
        this._lastTimeWarp = undefined;

        // Pre-computed factors & bodies
        this._kmToM = 1 / (Constants.metersToKm * Constants.scale);
        this._moonPos = new THREE.Vector3();
        this._sunPos = new THREE.Vector3();

        // Dummy body objects reused in orbit sampling
        this._earth = { position: new THREE.Vector3(), mass: Constants.earthMass };
        this._moon = { position: this._moonPos, mass: Constants.moonMass };
        this._sun = { position: this._sunPos, mass: Constants.sunMass };

        // Orbit-drawing throttle
        this._lastOrbitUpdate = 0;

        // micro-task flag for UI list updates
        this._needsListFlush = false;

        // Exposed tweakables
        this.sensitivityScale = 1;
        this._workerInterval = SatelliteManager.WORKER_THROTTLE_MS;
    }

    /* ───────────────────────────── Satellite CRUD ─────────────────────────── */

    /**
     * Add a new satellite and return it.
     * @param {Object} params – ctor params forwarded to {@link Satellite}
     * @returns {Satellite}
     */
    addSatellite(params) {
        const sat = new Satellite({ ...params, scene: this.app3d.scene, app3d: this.app3d });

        // inherit display & timeWarp state
        this._applyDisplaySettings(sat);
        sat.timeWarp = this.app3d.timeUtils?.timeWarp ?? 1;

        this._satellites.set(sat.id, sat);
        this._flushListSoon();

        // spin up worker if needed
        this._ensureWorker();

        if (this._workerReady) {
            this._pushSatelliteToWorker(sat);
        } else {
            this._satelliteAddQueue.push(sat);
        }
        return sat;
    }

    /**
     * Remove a satellite by id (string or number).
     * @param {string|number} id
     */
    removeSatellite(id) {
        const sat = this._satellites.get(id);
        if (!sat) return;

        sat.dispose();
        this._satellites.delete(id);
        // in case it was still queued for worker
        this._satelliteAddQueue = this._satelliteAddQueue.filter(s => s.id !== id);

        if (this._workerReady) this._post('removeSatellite', { id });
        this._flushListSoon();
        this._teardownWorkerIfIdle();
    }

    /** @returns {Object<string, Satellite>} a shallow copy for external code */
    getSatellites() {
        return Object.fromEntries(this._satellites);
    }

    /* ───────────────────────────── Render Loop ────────────────────────────── */

    /**
     * Called from the main animation loop.
     * @param {number} currentTime
     * @param {number} realDelta
     * @param {number} warpedDelta
     */
    updateAll(currentTime, realDelta, warpedDelta) {
        const now = performance.now();
        const { timeWarp } = this.app3d.timeUtils;

        /* sync time-warp with worker */
        if (this._workerReady && timeWarp !== this._lastTimeWarp) {
            this.setTimeWarp(timeWarp);
            this._lastTimeWarp = timeWarp;
        }

        /* periodic update of third-body positions sent to worker */
        if (this._workerReady && now - this._lastWorkerTick >= this._workerInterval) {
            this._syncBodiesToWorker();
            this._lastWorkerTick = now;
        }

        /* update satellites, orbits, ground-tracks */
        this._updateSatellites(currentTime, realDelta, warpedDelta, now, timeWarp);
    }

    /* ───────────────────────────── Worker control ─────────────────────────── */

    _ensureWorker() {
        if (this._worker || this._satellites.size === 0) return;

        this._worker = new Worker(new URL('../workers/physicsWorker.js', import.meta.url), { type: 'module' });
        this._workerReady = false;

        this._worker.onmessage = ({ data: { type, data } }) => {
            switch (type) {
                case 'initialized': this._handleWorkerInit(); break;
                case 'satellitesUpdate': this._applyWorkerUpdates(data); break;
                default: console.warn('[SatelliteManager] unknown msg:', type);
            }
        };

        this._post('init', {
            earthMass: Constants.earthMass,
            moonMass: Constants.moonMass,
            G: Constants.G,
            scale: Constants.scale,
            timeStep: this.app3d.getDisplaySetting('physicsTimeStep'),
            perturbationScale: this.app3d.getDisplaySetting('perturbationScale'),
            sensitivityScale: this.sensitivityScale,
        });
    }

    _handleWorkerInit() {
        this._workerReady = true;
        /* flush queued sats */
        this._satelliteAddQueue.forEach(sat => this._pushSatelliteToWorker(sat));
        this._satelliteAddQueue.length = 0;
        // send initial bodies list so dynamicBodies is populated for the first tick
        this._syncBodiesToWorker();
    }

    _teardownWorkerIfIdle() {
        if (this._worker && this._satellites.size === 0) {
            this._worker.terminate();
            this._worker = null;
            this._workerReady = false;
        }
    }

    _post(type, data = {}) {
        this._worker?.postMessage({ type, data });
    }

    _pushSatelliteToWorker(sat) {
        if (!this._workerReady) return;
        const f = this._kmToM;
        this._post('addSatellite', {
            id: sat.id,
            mass: sat.mass,
            size: sat.size,
            position: { x: sat.position.x * f, y: sat.position.y * f, z: sat.position.z * f },
            velocity: { x: sat.velocity.x * f, y: sat.velocity.y * f, z: sat.velocity.z * f },
        });
    }

    _applyWorkerUpdates(payload) {
        for (const u of payload) {
            const sat = this._satellites.get(u.id);
            if (!sat) continue;
            /* avoid tmp allocations by reusing shared Vector3s */
            sat._tmpPos ??= new THREE.Vector3();
            sat._tmpVel ??= new THREE.Vector3();
            sat._tmpPos.set(u.position[0], u.position[1], u.position[2]);
            sat._tmpVel.set(u.velocity[0], u.velocity[1], u.velocity[2]);
            sat.updatePosition(sat._tmpPos, sat._tmpVel, u.debug);
        }
    }

    /* ─────────────────── Public worker-tuning helpers ────────────────────── */

    setTimeWarp(v) { this._post('setTimeWarp', { value: v }); }
    setPhysicsTimeStep(v) { this._post('setTimeStep', { value: v }); }
    setPerturbationScale(v) { this._post('setPerturbationScale', { value: v }); }
    setSensitivityScale(v) { this.sensitivityScale = v; this._post('setSensitivityScale', { value: v }); }

    /* ───────────────────────────── Internals ─────────────────────────────── */

    /** Push bodies list (planets + sun) to worker */
    _syncBodiesToWorker() {
        const bodies = [];
        // collect all celestial bodies
        const all = this.app3d.celestialBodies ?? [];
        for (const body of all.filter(b => b)) {
            // find the mesh or light to sample position
            const mesh = body.getMesh?.() ?? body.mesh ?? body.sun ?? body.sunLight;
            if (!mesh) continue;
            mesh.getWorldPosition(this._moonPos).multiplyScalar(this._kmToM);
            const massKey = `${body.name}Mass`;
            const mass = Constants[massKey] ?? 0;
            bodies.push({ name: body.name, position: { x: this._moonPos.x, y: this._moonPos.y, z: this._moonPos.z }, mass });
        }
        this._post('updateBodies', { bodies });
    }

    /**
     * Core per-frame loop over satellites.
     * Splits simple RT updates from heavier orbit/ground-track sampling, the latter
     * being throttled by display settings to limit CPU load.
     */
    _updateSatellites(nowSim, dtReal, dtWarped, nowPerf, timeWarp) {
        const showOrbits = this.app3d.getDisplaySetting('showOrbits');
        const orbitRateHz = this.app3d.getDisplaySetting('orbitUpdateInterval');
        const orbitMs = 1000 / orbitRateHz;
        // Throttle heavy orbit and ground-track sampling by interval only, not conditioned on orbit display
        const shouldPaths = nowPerf - this._lastOrbitUpdate >= orbitMs;

        // Precompute dynamic bodies only once when updating paths
        let dynamicBodies = [];
        if (shouldPaths) {
            const tmpPos = new THREE.Vector3();
            (this.app3d.celestialBodies ?? []).forEach(body => {
                const mesh = body.getMesh?.() ?? body.mesh ?? body.sun ?? body.sunLight;
                if (!mesh) return;
                mesh.getWorldPosition(tmpPos).multiplyScalar(this._kmToM);
                const massKey = `${body.name}Mass`;
                dynamicBodies.push({ name: body.name, position: tmpPos.clone(), mass: Constants[massKey] ?? 0 });
            });
        }
        const predPeriods = this.app3d.getDisplaySetting('orbitPredictionInterval');
        const pointsPerPeriod = this.app3d.getDisplaySetting('orbitPointsPerPeriod');
        const nonKeplFallbackDay = this.app3d.getDisplaySetting('nonKeplerianFallbackDays') ?? 30;
        const epochMs = this.app3d.timeUtils.getSimulatedTime().getTime?.() ?? nowSim;

        let pathsUpdated = false;

        for (const sat of this._satellites.values()) {
            try {
                sat.timeWarp = timeWarp;
                sat.updateSatellite?.(nowSim, dtReal, dtWarped);

                if (sat.orbitPath) sat.orbitPath.visible = showOrbits;
                if (!shouldPaths) continue;

                const els = sat.getOrbitalElements?.();
                if (!els) continue;

                const ecc = els.eccentricity ?? 0;
                const apol = ecc >= 1;
                const nearP = !apol && ecc >= 0.99;
                const effP = (predPeriods > 0) ? predPeriods : 1;

                let periodS, pts;
                const r = sat.position.length();

                if (apol || nearP) {
                    const fbDays = this.app3d.getDisplaySetting('nonKeplerianFallbackDays') ?? 1;
                    periodS = fbDays * Constants.secondsInDay;
                    let raw = pointsPerPeriod * fbDays;
                    if (r <= Constants.earthSOI)
                        raw *= this.app3d.getDisplaySetting('hyperbolicPointsMultiplier') ?? 1;
                    pts = Math.ceil(raw);
                } else {
                    const base = (els.period > 0 && Number.isFinite(els.period))
                        ? els.period
                        : nonKeplFallbackDay * Constants.secondsInDay;
                    periodS = base * effP;
                    pts = pointsPerPeriod > 0
                        ? Math.ceil(pointsPerPeriod * effP)
                        : sat.orbitPath?._maxOrbitPoints ?? 180;
                }

                /* down-sample outside SOI */
                if (r > Constants.earthSOI) pts = Math.max(10, Math.ceil(pts * 0.2));

                // ensure we never exceed OrbitPath capacity
                pts = Math.min(pts, OrbitPath.CAPACITY - 1);

                // Update orbit & ground-track using precomputed dynamicBodies
                sat.orbitPath?.update(sat.position, sat.velocity, sat.id, dynamicBodies, periodS, pts, true);
                sat.groundTrackPath?.update(epochMs, sat.position, sat.velocity, sat.id, dynamicBodies, periodS, pts);

                pathsUpdated = true;
            } catch (err) {
                console.error(`Satellite ${sat.id} update failed:`, err);
            }
        }

        if (pathsUpdated && shouldPaths) this._lastOrbitUpdate = nowPerf;
    }

    /* ─────────────────────── UI / Display Settings helpers ────────────────── */

    _applyDisplaySettings(sat) {
        const dsm = this.app3d.displaySettingsManager;
        if (!dsm) return;
        const showOrbits = dsm.getSetting('showOrbits');
        sat.orbitLine && (sat.orbitLine.visible = showOrbits);
        sat.apsisVisualizer?.setVisible?.(showOrbits);
    }

    /** Batch satellite-list dispatch into a micro-task frame */
    _flushListSoon() {
        if (this._needsListFlush) return;
        this._needsListFlush = true;
        queueMicrotask(() => {
            const data = Object.fromEntries(
                [...this._satellites.values()].map(s => [s.id, { id: s.id, name: s.name || `Satellite ${s.id}` }])
            );
            document.dispatchEvent(new CustomEvent('satelliteListUpdated', { detail: { satellites: data } }));
            this._needsListFlush = false;
        });
    }

    /* ───────────────────────────── Destructors ────────────────────────────── */

    /** Dispose manager, worker and all satellites. */
    dispose() {
        for (const s of this._satellites.values()) s.dispose();
        this._satellites.clear();
        this._satelliteAddQueue.length = 0;
        this._worker?.terminate?.();
        this._worker = null;
        this._workerReady = false;
    }

    /**
     * Force an immediate orbit path update on next frame by resetting throttle.
     */
    refreshOrbitPaths() {
        this._lastOrbitUpdate = 0;
    }
}
