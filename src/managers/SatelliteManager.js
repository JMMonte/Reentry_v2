// SatelliteManager.js

import * as THREE from 'three';
import { Satellite } from '../components/Satellite/Satellite.js';
import { OrbitPath } from '../components/Satellite/OrbitPath.js';
import { Constants } from '../utils/Constants.js';
// Import providers (assuming they are in a 'providers' subdirectory)
// import { LocalPhysicsProvider } from '../providers/LocalPhysicsProvider.js';
// import { RemotePhysicsProvider } from '../providers/RemotePhysicsProvider.js';
// Import the actual satellite creation functions
import {
    createSatelliteFromLatLon as createSatFromLatLonInternal,
    createSatelliteFromOrbitalElements as createSatFromOEInternal,
    createSatelliteFromLatLonCircular as createSatFromLatLonCircularInternal
} from '../components/Satellite/createSatellite.js';

/**
 * Manages satellites, their state updates via a physics provider, and related scene updates.
 * – Uses Map<> for O(1) ops and cleaner iteration
 * – Centralises physics delegation to a provider
 * – Minimises Vector3 allocations & loops (for orbit drawing)
 * – Batches UI updates with queueMicrotask()
 */
export class SatelliteManager {
    /**
     * @param {App3D} app3d – Main App3D instance
     * @param {object} options - Configuration options
     * @param {'local' | 'remote'} options.physicsSource - Specifies the physics provider to use.
     * @param {LocalPhysicsProvider | RemotePhysicsProvider} options.physicsProviderInstance - Pre-instantiated provider.
     */
    constructor(app3d, { physicsProviderInstance } = {}) {
        /** @readonly */ this.app3d = app3d;

        /** @type {Map<string|number, Satellite>} */
        this._satellites = new Map();
        // this._satelliteAddQueue = []; // Queue was for worker, provider handles its own init logic

        /** @type {LocalPhysicsProvider | RemotePhysicsProvider} */
        this.physicsProvider = physicsProviderInstance;
        if (!this.physicsProvider) {
            throw new Error("[SatelliteManager] A physicsProviderInstance must be provided.");
        }

        // Time-sync related properties might still be relevant for orbit drawing logic
        // this._lastTimeWarp = undefined; // Provider will handle its own timeWarp sync if needed

        // Pre-computed factors & bodies (for orbit drawing)
        this._kmToM = 1 / Constants.metersToKm; // Used by local provider, but also if SM does any conversions

        // micro-task flag for UI list updates
        this._needsListFlush = false;

        // Exposed tweakables - these might now be passed to the provider if they are physics-related
        // this.sensitivityScale = 1; // Example: If LocalPhysicsProvider needs it

        // Initialize the provider with the current (empty) set of satellites
        this.physicsProvider.initialize?.(this._satellites);
    }

    /**
     * Initialize the local physics worker if not already running.
     */
    _initPhysicsWorker() {
        if (
            this.physicsProvider &&
            typeof this.physicsProvider.initialize === 'function' &&
            !this.physicsProvider._worker
        ) {
            this.physicsProvider.initialize(this._satellites);
        }
    }

    /* ───────────────────────────── Satellite CRUD ─────────────────────────── */

    /**
     * Add a new satellite and return it.
     * @param {Object} params – ctor params forwarded to {@link Satellite}
     * @returns {Satellite}
     */
    addSatellite(params) {
        const sat = new Satellite({ ...params, scene: this.app3d.scene, app3d: this.app3d });
        this._applyDisplaySettings(sat); // Apply visual settings
        sat.timeWarp = this.app3d.timeUtils?.timeWarp ?? 1; // Satellites still need to know timeWarp for local animations/effects
        this._satellites.set(sat.id, sat);

        this.physicsProvider?.addSatellite?.(sat); // Inform the physics provider

        this._flushListSoon();
        return sat;
    }

    /**
     * Update a satellite from backend data.
     * This method is now primarily intended to be called by the RemotePhysicsProvider.
     * @param {number|string} satId
     * @param {Array} pos - [x, y, z] in meters (as per original implementation)
     * @param {Array} vel - [vx, vy, vz] in m/s
     * @param {Object} debug - optional debug data
     */
    updateSatelliteFromBackend(satId, pos, vel, debug) {
        const sat = this._satellites.get(satId);
        if (!sat) return;
        // Use the new internal method
        sat._updateFromBackend(pos, vel, debug);
    }


    /**
     * Remove a satellite by id (string or number).
     * @param {string|number} id
     */
    removeSatellite(id) {
        const sat = this._satellites.get(id);
        if (!sat) return;

        sat.dispose(); // Visual disposal
        this._satellites.delete(id);

        this.physicsProvider?.removeSatellite?.(id); // Inform the physics provider

        this._flushListSoon();
        // this._teardownWorkerIfIdle(); // Provider handles its own lifecycle
    }

    /** @returns {Map<string|number, Satellite>} the internal map of satellites */
    getSatellitesMap() {
        return this._satellites;
    }

    /** @returns {Object<string, Satellite>} a shallow copy for external code */
    getSatellites() {
        return Object.fromEntries(this._satellites);
    }

    /* ───────────────────────────── Render Loop ────────────────────────────── */

    /**
     * Called from the main animation loop.
     * @param {number} currentTime - Current simulation time (epoch ms or similar)
     * @param {number} realDelta - Real time elapsed since last frame (seconds)
     * @param {number} warpedDelta - Warped simulation time elapsed (seconds)
     */
    updateAll(currentTime, realDelta, warpedDelta) {
        const nowPerf = performance.now(); // For throttling UI updates like orbit drawing
        const { timeWarp } = this.app3d.timeUtils;

        // Collect third body positions for the provider and orbit drawing
        const thirdBodyPositions = this._collectThirdBodyPositions();


        // Delegate satellite state updates to the physics provider
        this.physicsProvider?.update?.(
            this._satellites,
            currentTime,
            realDelta,
            warpedDelta,
            thirdBodyPositions
        );

        // Update local visual aspects of satellites (animations, non-physics effects)
        // And update orbit paths, ground tracks etc. which are visual representations
        // derived from the (now updated by provider) satellite states.
        this._updateSatelliteVisualsAndPaths(currentTime, realDelta, warpedDelta, nowPerf, timeWarp, thirdBodyPositions);
    }

    _collectThirdBodyPositions() {
        const bodies = [];
        const allPlanetaryBodies = this.app3d.celestialBodies ?? [];
        for (const body of allPlanetaryBodies.filter(b => b)) {
            const mesh = body.getMesh?.() ?? body.mesh ?? body.sun ?? body.sunLight;
            if (!mesh) continue;
            const tempWorldPos = new THREE.Vector3();
            mesh.getWorldPosition(tempWorldPos); // Positions are in km (simulation units)
            // Use mass from body config directly
            const mass = body.mass ?? 0;
            bodies.push({ name: body.name, position: tempWorldPos.clone(), mass });
        }
        return bodies;
    }


    /* ───────────────────────────── Worker control (REMOVED) ───────────────── */
    // _ensureWorker() - MOVED to LocalPhysicsProvider
    // _handleWorkerInit() - MOVED to LocalPhysicsProvider
    // _teardownWorkerIfIdle() - MOVED/Handled by LocalPhysicsProvider or general logic
    // _post() - MOVED to LocalPhysicsProvider (_postToWorker)
    // _pushSatelliteToWorker() - MOVED to LocalPhysicsProvider
    // _applyWorkerUpdates() - MOVED to LocalPhysicsProvider

    /* ─────────────────── Public physics tuning helpers ─────────────────── */
    // These now delegate to the provider

    setTimeWarp(v) {
        // SatelliteManager might still inform its satellites for visual effects,
        // but the physics source also needs to know.
        for (const sat of this._satellites.values()) {
            sat.timeWarp = v;
        }
        this.physicsProvider?.setTimeWarp?.(v);
        // this._lastTimeWarp = v; // Provider manages its own state if needed
    }

    setPhysicsTimeStep(v) {
        this.physicsProvider?.setPhysicsTimeStep?.(v);
    }

    // Example: if perturbation scale was a general setting
    // setPerturbationScale(v) {
    //     this.physicsProvider?.setPerturbationScale?.(v);
    // }

    // Example: if sensitivity scale was a general setting
    // setSensitivityScale(v) {
    //     this.sensitivityScale = v; // If it's a direct SM property
    //     this.physicsProvider?.setSensitivityScale?.(v);
    // }


    /* ───────────────────────────── Internals (mostly orbit drawing)────────── */

    // _syncBodiesToWorker() - MOVED to LocalPhysicsProvider
    // This method is now _collectThirdBodyPositions and its results are passed to provider and local visual updates.

    /**
     * Core per-frame loop over satellites for visual updates, orbit and ground-track drawing.
     * This runs *after* the physicsProvider has updated the satellite states (position, velocity).
     */
    _updateSatelliteVisualsAndPaths(nowSim, dtReal, dtWarped, nowPerf, timeWarp, thirdBodyPositionsForOrbits) {
        const showOrbits = this.app3d.getDisplaySetting('showOrbits');
        const orbitRateHz = this.app3d.getDisplaySetting('orbitUpdateInterval');
        const orbitMs = 1000 / orbitRateHz;
        const shouldUpdatePaths = nowPerf - this._lastOrbitUpdate >= orbitMs;
        const predPeriods = this.app3d.getDisplaySetting('orbitPredictionInterval');
        const pointsPerPeriod = this.app3d.getDisplaySetting('orbitPointsPerPeriod');
        const nonKeplFallbackDay = this.app3d.getDisplaySetting('nonKeplerianFallbackDays') ?? 30;
        const epochMs = this.app3d.timeUtils.getSimulatedTime().getTime?.() ?? nowSim;
        let pathsUpdated = false;
        for (const sat of this._satellites.values()) {
            try {
                if (sat.orbitPath) sat.orbitPath.visible = showOrbits;
                if (!shouldUpdatePaths) continue;
                const els = sat.getOrbitalElements?.();
                if (!els) continue;
                const ecc = els.eccentricity ?? 0;
                const apol = ecc >= 1;
                const nearP = !apol && ecc >= 0.99;
                const effP = (predPeriods > 0) ? predPeriods : 1;
                let periodS, pts;
                const r = sat.position.length() * Constants.metersToKm; // sat.position is in meters, convert to km for logic here
                // Use the satellite's planet config for SOI if available
                const soi = sat.planetConfig?.soiRadius ?? 1e12; // fallback to huge if not set
                if (apol || nearP) {
                    const fbDays = this.app3d.getDisplaySetting('nonKeplerianFallbackDays') ?? 1;
                    periodS = fbDays * Constants.secondsInDay;
                    let rawPts = pointsPerPeriod * fbDays;
                    if (r <= soi) {
                        rawPts *= this.app3d.getDisplaySetting('hyperbolicPointsMultiplier') ?? 1;
                    }
                    pts = Math.ceil(rawPts);
                } else {
                    const basePeriodS = (els.period > 0 && Number.isFinite(els.period))
                        ? els.period
                        : nonKeplFallbackDay * Constants.secondsInDay;
                    periodS = basePeriodS * effP;
                    pts = pointsPerPeriod > 0
                        ? Math.ceil(pointsPerPeriod * effP)
                        : sat.orbitPath?._maxOrbitPoints ?? 180;
                }
                if (r > soi) pts = Math.max(10, Math.ceil(pts * 0.2));
                pts = Math.min(pts, OrbitPath.CAPACITY - 1);
                const satPosKm = sat.position.clone().multiplyScalar(Constants.metersToKm);
                sat.orbitPath?.update(satPosKm, sat.velocity, sat.id, thirdBodyPositionsForOrbits, periodS, pts, true);
                sat.groundTrackPath?.update(epochMs, satPosKm, sat.velocity, sat.id, thirdBodyPositionsForOrbits, periodS, pts);
                pathsUpdated = true;
            } catch (err) {
                console.error(`Satellite ${sat.id} visual/path update failed:`, err);
            }
        }
        if (pathsUpdated && shouldUpdatePaths) this._lastOrbitUpdate = nowPerf;
    }

    /* ─────────────────────── UI / Display Settings helpers ────────────────── */

    _applyDisplaySettings(sat) {
        const dsm = this.app3d.displaySettingsManager;
        if (!dsm) return;
        const showOrbits = dsm.getSetting('showOrbits');
        // These are direct visual properties of the satellite's THREE objects
        if (sat.orbitLine) sat.orbitLine.visible = showOrbits; // If Satellite directly holds orbitLine
        if (sat.orbitPath && sat.orbitPath.setTraceVisible) sat.orbitPath.setTraceVisible(showOrbits); // If OrbitPath handles its own main line visibility
        else if (sat.orbitPath) sat.orbitPath.visible = showOrbits; // Fallback

        sat.apsisVisualizer?.setVisible?.(showOrbits);
        // Add more display settings applications here if needed
    }

    /** Batch satellite-list dispatch into a micro-task frame */
    _flushListSoon() {
        if (this._needsListFlush) return;
        this._needsListFlush = true;
        queueMicrotask(() => {
            const data = Object.fromEntries(
                [...this._satellites.values()].map(s => [s.id, { id: s.id, name: s.name || `Satellite ${s.id}` }])
            );
            // Dispatch a global event that App.jsx listens for
            document.dispatchEvent(new CustomEvent('satelliteListUpdated', { detail: { satellites: data } }));
            this._needsListFlush = false;
        });
    }

    /* ───────────────────────────── Destructors ────────────────────────────── */

    /** Dispose manager, provider and all satellites. */
    dispose() {
        this.physicsProvider?.dispose?.();
        this.physicsProvider = null;

        for (const s of this._satellites.values()) s.dispose(); // Visual disposal
        this._satellites.clear();
        // this._satelliteAddQueue.length = 0; // No longer used

        console.log("[SatelliteManager] Disposed.");
    }

    /**
     * Force an immediate orbit path update on next frame by resetting throttle.
     */
    refreshOrbitPaths() {
        this._lastOrbitUpdate = 0;
    }

    // --- SATELLITE CREATION HELPERS (moved from App3D) ---
    /**
     * @param {App3D} app3dInstance - Usually this.app3d passed from the calling context (e.g., App3D itself)
     * @param {object} p - Parameters for satellite creation
     * @param {object} selectedBody - The selected celestial body for context (e.g., { naifId: 399 } for Earth)
     */
    createSatelliteFromLatLon(app3dInstance, p, selectedBody) {
        if (!selectedBody) throw new Error('Planet/moon config must be provided');
        return createSatFromLatLonInternal(app3dInstance, p, selectedBody);
    }

    /**
     * @param {App3D} app3dInstance
     * @param {object} p
     */
    createSatelliteFromOrbitalElements(app3dInstance, p) {
        if (!p.planet) throw new Error('Planet/moon config must be provided in params');
        return createSatFromOEInternal(app3dInstance, p);
    }

    /**
     * @param {App3D} app3dInstance
     * @param {object} p
     * @param {object} selectedBody
     */
    createSatelliteFromLatLonCircular(app3dInstance, p, selectedBody) {
        if (!selectedBody) throw new Error('Planet/moon config must be provided');
        return createSatFromLatLonCircularInternal(app3dInstance, p, selectedBody);
    }

    // --- END SATELLITE CREATION HELPERS ---
}
