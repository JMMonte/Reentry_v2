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
// import { OrbitPath } from '../components/Satellite/OrbitPath.js'; // Removed - using SatelliteOrbitManager
import { Constants } from '../physics/PhysicsAPI.js';
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
    }

    /* ───── Satellite CRUD ───── */

    /**
     * Create UI satellite directly from physics satellite ID
     * Simple, direct approach - no events, no duplication
     */
    async createUISatellite(physicsId, uiParams = {}) {
        const id = String(physicsId);
        
        // Don't create if already exists
        if (this._satellites.has(id)) {
            return this._satellites.get(id);
        }
        
        // Get physics data
        const physicsEngine = this.app3d?.physicsIntegration?.physicsEngine;
        if (!physicsEngine) {
            throw new Error('Physics engine not available');
        }
        
        const physicsSat = physicsEngine.satellites.get(id);
        if (!physicsSat) {
            throw new Error(`Physics satellite ${id} not found`);
        }
        
        // Create UI satellite
        const sat = new Satellite({
            id,
            scene: this.app3d.scene,
            app3d: this.app3d,
            planetConfig: uiParams.planetConfig || this.app3d.bodiesByNaifId?.[physicsSat.centralBodyNaifId],
            centralBodyNaifId: physicsSat.centralBodyNaifId,
            color: uiParams.color || 0xffff00,
            name: uiParams.name || physicsSat.name || `Satellite ${id}`
        });
        
        this._satellites.set(id, sat);
        this._flushListSoon();
        
        return sat;
    }

    /**
     * Legacy method for backwards compatibility
     * Delegates to physics engine then creates UI
     */
    async addSatellite(params) {
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
        
        // Create physics satellite
        const physicsEngine = this.app3d?.physicsIntegration?.physicsEngine;
        if (!physicsEngine) {
            console.warn('[SatelliteManager] Physics engine not available');
            return null;
        }
        
        const physicsId = physicsEngine.addSatellite(satData);
        
        // Create UI satellite
        return this.createUISatellite(physicsId, {
            planetConfig: params.planetConfig,
            color: params.color,
            name: params.name
        });
    }

    /** Integrate backend-provided state (pos [m], vel [m s-1]). */
    updateSatelliteFromBackend(id, pos, vel, debug) {
        const sat = this._satellites.get(String(id));
        if (sat) {
            sat.updateVisualsFromState({ position: pos, velocity: vel, ...debug });
        }
    }

    /** Remove satellite from both UI and physics */
    removeSatellite(id) {
        const strId = String(id);
        
        // Remove from UI
        const sat = this._satellites.get(strId);
        if (sat) {
            sat.dispose();
            this._satellites.delete(strId);
            this._flushListSoon();
        }
        
        // Remove from physics
        const physicsEngine = this.app3d?.physicsIntegration?.physicsEngine;
        if (physicsEngine) {
            physicsEngine.removeSatellite(strId);
        }
    }

    /** Update satellite color in both UI and physics */
    updateSatelliteColor(id, color) {
        const strId = String(id);
        
        // Update UI
        const sat = this._satellites.get(strId);
        if (sat) {
            sat.setColor(color, true); // fromPhysicsUpdate=true to prevent loop
        }
        
        // Update physics
        const physicsEngine = this.app3d?.physicsIntegration?.physicsEngine;
        if (physicsEngine) {
            physicsEngine.updateSatelliteProperty(strId, 'color', color);
        }
    }

    /** Cleanup all satellites */
    dispose() {
        for (const sat of this._satellites.values()) {
            sat.dispose();
        }
        this._satellites.clear();
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
        // Use physics engine bodies instead of visual bodies for proper orbit propagation
        if (this.app3d.physicsIntegration?.physicsEngine) {
            const physicsState = this.app3d.physicsIntegration.physicsEngine.getSimulationState();
            return Object.values(physicsState.bodies || {})
                .filter(body => body.mass > 0 || body.GM > 0) // Only bodies with gravitational influence
                .map(body => ({
                    name: body.name,
                    position: Array.isArray(body.position) ? body.position : 
                             (body.position.toArray ? body.position.toArray() : [0, 0, 0]),
                    mass: body.mass || 0,
                    GM: body.GM || 0,
                    naifId: body.naif || body.naifId,
                    type: body.type,
                    // Include rotation data needed for coordinate transformations
                    quaternion: body.quaternion,
                    poleRA: body.poleRA,
                    poleDec: body.poleDec,
                    spin: body.spin,
                    spinRate: body.spinRate,
                    rotationPeriod: body.rotationPeriod,
                    radius: body.radius,
                    equatorialRadius: body.equatorialRadius || body.radius,
                    polarRadius: body.polarRadius || body.radius
                }));
        }
        
        // Fallback to visual bodies if physics engine not available
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
        // Skip old orbit system if new orbit manager is available
        if (this.app3d.satelliteOrbitManager) {
            return;
        }
        
        const dsm = this.app3d.displaySettingsManager;
        const showOrbits = dsm.getSetting('showOrbits');
        const orbitMs = 1000 / dsm.getSetting('orbitUpdateInterval');
        const shouldUpdatePaths = perfNow - this._lastOrbitUpdate >= orbitMs;
        const predPeriods = dsm.getSetting('orbitPredictionInterval');
        const ptsPerPeriod = dsm.getSetting('orbitPointsPerPeriod');
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
                // For escape trajectories, propagate to SOI
                const radialVel = sat.velocity.dot(sat.position) / r;
                if (radialVel > 0 && satSOI > r) {
                    periodS = (satSOI - r) / radialVel * 1.5; // Time to reach SOI with margin
                } else {
                    periodS = Constants.TIME.SECONDS_IN_DAY; // 1 day fallback
                }
                pts = Math.ceil(ptsPerPeriod * effP);
            } else {
                const baseP = Number.isFinite(els.period) && els.period > 0
                    ? els.period
                    : Constants.TIME.SECONDS_IN_DAY;
                periodS = baseP * effP;
                pts = ptsPerPeriod > 0
                    ? Math.ceil(ptsPerPeriod * effP)
                    : 180; // Default orbit points
            }

            // No artificial limits - let the user control via settings

            try {
                const posKm = sat.position.clone();

                // Orbit path updates now handled by SatelliteOrbitManager
                sat.groundTrackPath?.update(epochMs, posKm, sat.velocity, sat.id, thirds, periodS, pts, sat.centralBodyNaifId, null, null, 1024, 512);

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
