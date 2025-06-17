// SatelliteManager.js
//
// Responsibilities (UI-ONLY - Physics handled by SatelliteEngine)
// • CRUD for Satellite UI instances
// • Visual upkeep: ground tracks (orbit visualization centralized)
// • Syncing UI state with physics engine state (read-only)
// • Keeps all distances in kilometres and velocities in km s-1
//
// External deps: Satellite
// Public API: createUISatellite, updateAllFromPhysicsState,
//             removeSatellite, updateSatelliteColor, getSatellitesMap, getSatellites
//
// NOTE: Satellite creation now happens in physics layer via PhysicsEngine
//       SatelliteManager only creates UI representations of existing physics satellites

import { Satellite } from '../components/Satellite/Satellite.js';
import { objectPool } from '../utils/ObjectPool.js';
// All orbit visualization now handled by SimpleSatelliteOrbitVisualizer

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

        // Throttling for performance
        this._lastUpdateTime = 0;
        this._updateThreshold = 50; // 20Hz updates for UI
        this._lastPathUpdateTime = 0;
        this._pathUpdateThreshold = 1000; // 1Hz for path updates
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

        // Create UI satellite - use physics satellite color if no UI color provided
        const finalColor = uiParams.color !== undefined ? uiParams.color : (physicsSat.color !== undefined ? physicsSat.color : 0xffff00);
        const sat = new Satellite({
            id,
            scene: this.app3d.scene,
            app3d: this.app3d,
            planetConfig: uiParams.planetConfig || this.app3d.bodiesByNaifId?.[physicsSat.centralBodyNaifId],
            centralBodyNaifId: physicsSat.centralBodyNaifId,
            color: finalColor,
            name: uiParams.name || physicsSat.name || `Satellite ${id}`
        });

        this._satellites.set(id, sat);
        this._flushListSoon();

        return sat;
    }

    /* ───── addSatellite method removed ───── */
    /* Satellite creation now handled by physics engine via App3D.createSatelliteFrom*() methods */

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

        // Update UI - use fromPhysicsUpdate=true to prevent circular calls
        const sat = this._satellites.get(strId);
        if (sat) {
            sat.setColor(color, true); // fromPhysicsUpdate = true to prevent recursion
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
     * Clean up pooled resources during render loop
     */
    updateAll() {
        const thirdBodies = this._collectThirdBodyPositions();

        // Release pooled vectors back to the pool
        for (const body of thirdBodies) {
            if (body.position) {
                objectPool.releaseVector3(body.position);
            }
        }
    }

    /* ───── internals ───── */

    _collectThirdBodyPositions() {
        // Use physics engine bodies instead of visual bodies for proper orbit propagation
        if (this.app3d.physicsIntegration) {
            const physicsState = this.app3d.physicsIntegration.getSimulationState();
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
        const bodies = [];
        const celestialBodies = this.app3d.celestialBodies ?? [];

        for (const body of celestialBodies) {
            if (!body) continue;

            const mesh = body.getMesh?.() ?? body.mesh ?? body.sun ?? body.sunLight;
            if (!mesh) continue;

            // Use object pooling to avoid creating new Vector3 every frame
            const pos = objectPool.getVector3();
            mesh.getWorldPosition(pos);

            bodies.push({
                name: body.name,
                position: pos, // This will be released after use
                mass: body.mass ?? 0
            });
        }

        return bodies;
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

    /* ───── Legacy methods removed ───── */
    /* Physics methods moved to SimulationController/PhysicsEngine where they belong */
    /* refreshOrbitPaths method removed - all orbit visualization now centralized */

    /**
     * Update all Satellite UI objects from the latest physics state.
     * @param {Object} physicsState - { satellites: { id: { ... } } }
     */
    updateAllFromPhysicsState(physicsState) {
        const now = performance.now();

        // Throttle updates for performance
        if (now - this._lastUpdateTime < this._updateThreshold) {
            return;
        }
        this._lastUpdateTime = now;

        const satStates = physicsState.satellites || {};

        // CLEAN DELEGATION: Each satellite manages its own visual state
        // SatelliteManager focuses on coordination, not implementation details
        for (const [id, satState] of Object.entries(satStates)) {
            const sat = this._satellites.get(id);
            if (sat) {
                // Single responsibility: delegate to satellite
                // Satellite knows best how to update its own visuals
                sat.updateVisualsFromState(satState);
            }
        }

        // Path updates handled by centralized SimpleSatelliteOrbitVisualizer
    }

    /**
     * Cleanup all satellites
     */
    cleanup() {
        console.log(`[SatelliteManager] Cleaning up ${this._satellites.size} satellites`);

        // Remove all satellites
        for (const id of this._satellites.keys()) {
            this.removeSatellite(id);
        }
    }
}
