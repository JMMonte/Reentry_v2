// SatelliteManager.js
//
// Responsibilities
// • CRUD for Satellite instances
// • Delegation of physics updates to a provider (stubbed for now)
// • Visual upkeep: orbits, ground tracks, etc.
// • Keeps all distances in kilometres and velocities in km s-1
//
// External deps: THREE, Satellite, OrbitPath, Constants
// Public API: addSatellite, removeSatellite, updateSatelliteFromBackend,
//             updateAll, getSatellitesMap, getSatellites, setTimeWarp,
//             refreshOrbitPaths, plus createSatelliteFrom* helpers.

import * as THREE from 'three';
import { Satellite } from '../components/Satellite/Satellite.js';
import { OrbitPath } from '../components/Satellite/OrbitPath.js';
import { Constants } from '../utils/Constants.js';
import {
    createSatelliteFromLatLon as createSatFromLatLonInternal,
    createSatelliteFromOrbitalElements as createSatFromOEInternal,
    createSatelliteFromLatLonCircular as createSatFromLatLonCircularInternal
} from '../components/Satellite/createSatellite.js';

/* ────────────── small helpers ────────────── */

/** Safe Hill-sphere / SOI accessor with huge fallback. */
const soi = body => body?.soiRadius ?? 1e12;

/* ────────────── class ────────────── */

export class SatelliteManager {
    /**
     * @param {App3D} app3d – shared context containing scene, time utils, bodies, settings…
     */
    constructor(app3d) {
        /** @readonly */ this.app3d = app3d;
        /** @type {Map<string|number, Satellite>} */
        this._satellites = new Map();
        this._needsListFlush = false;   // micro-task flag
        this._lastOrbitUpdate = 0;      // perf.now timestamp
        this._nextId = 0; // Unique satellite ID counter
        
        // Listen to physics events
        this._setupEventListeners();
    }

    _setupEventListeners() {
        // Bind event handlers
        this._boundOnSatelliteAdded = (e) => this._onSatelliteAdded(e.detail);
        this._boundOnSatelliteRemoved = (e) => this._onSatelliteRemoved(e.detail);
        this._boundOnSatellitePropertyUpdated = (e) => this._onSatellitePropertyUpdated(e.detail);
        
        // Listen for satellite events from physics engine
        window.addEventListener('satelliteAdded', this._boundOnSatelliteAdded);
        window.addEventListener('satelliteRemoved', this._boundOnSatelliteRemoved);
        window.addEventListener('satellitePropertyUpdated', this._boundOnSatellitePropertyUpdated);
    }

    _onSatelliteAdded(satData) {
        // Create UI object for physics satellite
        const id = String(satData.id);
        if (!this._satellites.has(id)) {
            const sat = new Satellite({
                ...satData,
                id,
                scene: this.app3d.scene,
                app3d: this.app3d,
                planetConfig: this.app3d.bodiesByNaifId?.[satData.centralBodyNaifId],
                centralBodyNaifId: satData.centralBodyNaifId
            });
            this._satellites.set(id, sat);
            this._flushListSoon();
        }
    }

    _onSatelliteRemoved(data) {
        const id = String(data.id);
        const sat = this._satellites.get(id);
        if (sat) {
            sat.dispose();
            this._satellites.delete(id);
            this._flushListSoon();
        }
    }

    _onSatellitePropertyUpdated(data) {
        const sat = this._satellites.get(String(data.id));
        if (sat && data.property === 'color') {
            sat.setColor(data.value);
        } else if (sat && data.property === 'name') {
            sat.name = data.value;
        }
    }

    /* ───── Satellite CRUD ───── */

    /**
     * @param {Object} params – forwarded to physics engine
     * @returns {Promise<Satellite>} satellite object after creation
     */
    async addSatellite(params) {
        // Prepare data for physics engine
        const centralBodyNaifId =
            params.centralBodyNaifId ??
            params.planetNaifId ??
            params.planetConfig?.naifId ??
            399; // Earth fallback
        
        const satData = {
            ...params,
            id: params.id ?? this._nextId++,
            centralBodyNaifId
        };
        
        // Delegate to physics engine (single source of truth)
        if (this.app3d?.physicsIntegration?.addSatellite) {
            const satId = this.app3d.physicsIntegration.addSatellite(satData);
            
            // Wait for the satellite to be created via event
            return new Promise((resolve) => {
                const checkSatellite = () => {
                    const sat = this._satellites.get(String(satId));
                    if (sat) {
                        resolve(sat);
                    } else {
                        setTimeout(checkSatellite, 10);
                    }
                };
                checkSatellite();
            });
        }
        
        console.warn('[SatelliteManager] PhysicsIntegration not available');
        return null;
    }

    /** Integrate backend-provided state (pos [m], vel [m s-1]). */
    updateSatelliteFromBackend(id, pos, vel, debug) {
        const sat = this._satellites.get(String(id));
        if (sat) {
            sat.updateVisualsFromState({ position: pos, velocity: vel, ...debug });
        }
    }

    /** Cleanup all satellites and event listeners */
    dispose() {
        // Remove all satellites
        for (const sat of this._satellites.values()) {
            sat.dispose();
        }
        this._satellites.clear();
        
        // Remove event listeners
        if (this._boundOnSatelliteAdded) {
            window.removeEventListener('satelliteAdded', this._boundOnSatelliteAdded);
            window.removeEventListener('satelliteRemoved', this._boundOnSatelliteRemoved);
            window.removeEventListener('satellitePropertyUpdated', this._boundOnSatellitePropertyUpdated);
        }
    }

    removeSatellite(id) {
        // Delegate to physics engine - it will dispatch event that we listen to
        if (this.app3d?.physicsIntegration?.removeSatellite) {
            this.app3d.physicsIntegration.removeSatellite(id);
        }
    }

    /* shorthand getters */
    getSatellitesMap() { return this._satellites; }
    getSatellites() { return Object.fromEntries(this._satellites); }
    get satellites() { return this._satellites; }

    /* ───── Render-loop hook ───── */

    /**
     * @param {number} simTimeMs  – simulation epoch (ms)
     * @param {number} realDtS    – real seconds since last frame
     * @param {number} warpDtS    – warped sim-seconds since last frame
     */
    updateAll(simTimeMs, realDtS, warpDtS) {
        const perfNow = performance.now();
        const { timeWarp } = this.app3d.timeUtils;
        const thirdBodies = this._collectThirdBodyPositions();

        // physicsProvider?.update(…)  ← stub

        this._updateVisualsAndPaths(
            simTimeMs, realDtS, warpDtS, perfNow, timeWarp, thirdBodies
        );
    }

    /* ───── internals ───── */

    _collectThirdBodyPositions() {
        return (this.app3d.celestialBodies ?? [])
            .filter(Boolean)
            .map(body => {
                const mesh =
                    body.getMesh?.() ?? body.mesh ?? body.sun ?? body.sunLight;
                if (!mesh) return null;
                const pos = new THREE.Vector3();
                mesh.getWorldPosition(pos);
                return { name: body.name, position: pos, mass: body.mass ?? 0 };
            })
            .filter(Boolean);
    }

    _updateVisualsAndPaths(simMs, dtReal, dtWarp, perfNow, timeWarp, thirds) {
        const dsm = this.app3d.displaySettingsManager;
        const showOrbits = dsm.getSetting('showOrbits');
        const orbitMs = 1000 / dsm.getSetting('orbitUpdateInterval');
        const shouldUpdatePaths = perfNow - this._lastOrbitUpdate >= orbitMs;
        const predPeriods = dsm.getSetting('orbitPredictionInterval');
        const ptsPerPeriod = dsm.getSetting('orbitPointsPerPeriod');
        const fallbackDay = dsm.getSetting('nonKeplerianFallbackDays') ?? 30;
        const hyperMult = dsm.getSetting('hyperbolicPointsMultiplier') ?? 1;
        const epochMs = this.app3d.timeUtils.getSimulatedTime()?.getTime?.() ?? simMs;

        let updated = false;

        for (const sat of this._satellites.values()) {
            sat.orbitPath && (sat.orbitPath.visible = showOrbits);
                if (!shouldUpdatePaths) continue;

                const els = sat.getOrbitalElements?.();
                if (!els) continue;

                const ecc = els.eccentricity ?? 0;
            const hyper = ecc >= 1;
            const nearParab = !hyper && ecc >= 0.99;
            const effP = predPeriods > 0 ? predPeriods : 1;
            const r = sat.position.length();
            const satSOI = soi(sat.planetConfig);

                let periodS, pts;

            if (hyper || nearParab) {
                const fbDays = dsm.getSetting('nonKeplerianFallbackDays') ?? 1;
                    periodS = fbDays * Constants.secondsInDay;
                pts = Math.ceil(ptsPerPeriod * fbDays * (r <= satSOI ? hyperMult : 1));
                } else {
                const baseP = Number.isFinite(els.period) && els.period > 0
                        ? els.period
                    : fallbackDay * Constants.secondsInDay;
                periodS = baseP * effP;
                pts = ptsPerPeriod > 0
                    ? Math.ceil(ptsPerPeriod * effP)
                        : sat.orbitPath?._maxOrbitPoints ?? 180;
                }

            if (r > satSOI) pts = Math.max(10, Math.ceil(pts * 0.2));
                pts = Math.min(pts, OrbitPath.CAPACITY - 1);

            try {
                const posKm = sat.position.clone();

                sat.orbitPath?.update(posKm, sat.velocity, sat.id, thirds, periodS, pts, true);
                sat.groundTrackPath?.update(epochMs, posKm, sat.velocity, sat.id, thirds, periodS, pts);

                updated = true;
            } catch (err) {
                console.error(`[SatelliteManager] path update failed for ${sat.id}:`, err);
            }
        }

        if (updated && shouldUpdatePaths) this._lastOrbitUpdate = perfNow;
    }

    _applyDisplaySettings(sat) {
        const show = this.app3d.displaySettingsManager?.getSetting('showOrbits');
        sat.orbitPath?.setTraceVisible?.(show);
        if (sat.orbitPath) sat.orbitPath.visible = show;
        if (sat.orbitLine) sat.orbitLine.visible = show;
        sat.apsisVisualizer?.setVisible?.(show);
    }

    _flushListSoon() {
        if (this._needsListFlush) return;
        this._needsListFlush = true;

        queueMicrotask(() => {
            const payload = Object.fromEntries(
                [...this._satellites.values()].map(s => [
                    s.id,
                    { id: s.id, name: s.name ?? `Satellite ${s.id}` }
                ])
            );
            document.dispatchEvent(
                new CustomEvent('satelliteListUpdated', { detail: { satellites: payload } })
            );
            this._needsListFlush = false;
        });
    }

    /* ───── public helpers ───── */

    setTimeWarp(v) {
        for (const sat of this._satellites.values()) sat.timeWarp = v;
        // physicsProvider?.setTimeWarp(v)  ← stub
    }

    refreshOrbitPaths() { this._lastOrbitUpdate = 0; }

    /* ───── factory wrappers ───── */

    createSatelliteFromLatLon(app3d, p, selectedBody) {
        const naifId = selectedBody?.naifId ?? p.planetNaifId ?? 10;
        return createSatFromLatLonInternal(app3d, { ...p, planetNaifId: naifId });
    }

    createSatelliteFromOrbitalElements(app3d, p) {
        const naifId = p.planet?.naifId ?? p.selectedBody?.naifId ?? 399;
        return createSatFromOEInternal(app3d, { ...p, planetNaifId: naifId });
    }

    createSatelliteFromLatLonCircular(app3d, p, selectedBody) {
        const naifId = selectedBody?.naifId ?? 399;
        return createSatFromLatLonCircularInternal(app3d, { ...p, planetNaifId: naifId });
    }

    /**
     * Update all Satellite UI objects from the latest physics state.
     * @param {Object} physicsState - { satellites: { id: { ... } } }
     */
    updateAllFromPhysicsState(physicsState) {
        const satStates = physicsState.satellites || {};
        // Only update visuals for existing satellites
        // Creation/deletion is handled by events
        for (const [id, satState] of Object.entries(satStates)) {
            const sat = this._satellites.get(id);
            if (sat) {
                sat.updateVisualsFromState(satState);
            }
        }
    }
}
