// Satellite.js
import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';
import { PhysicsUtils } from '../../utils/PhysicsUtils.js';
import { ApsisVisualizer } from '../ApsisVisualizer.js';
import { OrbitPath } from './OrbitPath.js';
import { SatelliteVisualizer } from './SatelliteVisualizer.js';
import { ManeuverNode } from './ManeuverNode.js';
import { GroundtrackPath } from './GroundtrackPath.js';

/**
 * Represents one spacecraft and all of its visual helpers.
 *
 *  • All expensive allocations happen in the constructor.  
 *  • Per-frame updates re-use scratch Vector3s to avoid GC churn.  
 *  • Simulation-data events are throttled to ~10 Hz.
 */
export class Satellite {
    /**
     * @param {Object} opts
     * @param {THREE.Scene}   opts.scene
     * @param {THREE.Vector3} opts.position  – ECI metres
     * @param {THREE.Vector3} opts.velocity  – ECI m/s
     * @param {string|number} opts.id
     * @param {string|number|THREE.Color} opts.color
     * @param {number}  [opts.mass=100]  – kg
     * @param {number}  [opts.size=1]    – purely visual scale
     * @param {App3D}   opts.app3d
     * @param {string}  [opts.name]
     * @param {'earth'|'moon'|'sun'} [opts.referenceBody='earth']
     */
    constructor({
        scene, position, velocity, id,
        color, mass = 100, size = 1,
        app3d, name,
        referenceBody = 'earth',
    }) {
        /* ── meta ── */
        this.app3d = app3d;
        this.scene = scene;
        this.id = id;
        this.name = name ?? `Satellite ${id}`;
        this.mass = mass;
        this.size = size;
        this.color = color;
        this.referenceBody = referenceBody;
        this.timeWarp = 1;                    // synced externally

        /* ── state vectors ── */
        this.position = position.clone();     // metres
        this.velocity = velocity.clone();     // m/s
        this.orientation = new THREE.Quaternion();
        this.acceleration = new THREE.Vector3(); // add acceleration vector for debug window

        /* ── scratch & caches ── */
        this._scaledKm = new THREE.Vector3();     // km·scale
        this._smoothedKm = this._scaledKm.clone();  // for viz smoothing
        this._tmpPos = new THREE.Vector3();     // helper
        this._alpha = 0.7;                     // smoothing factor
        this._k = Constants.metersToKm * Constants.scale;

        /* ── throttling ── */
        this._lastSimEvt = 0;
        this._evtInterval = 100;   // ms (≈10 Hz)

        /* ── worker buffer ── */
        this._updateBuffer = [];

        /* ── visuals ── */
        this._initVisuals();

        /* debug window on demand */
        app3d.createDebugWindow?.(this);

        /* maneuvers container */
        this.maneuverNodes = [];
        this.maneuverGroup = new THREE.Group();
        scene.add(this.maneuverGroup);
    }

    /* ────────────────────────── Visual helpers ─────────────────────────── */

    _initVisuals() {
        /* body mesh & axes */
        this.visualizer = new SatelliteVisualizer(this.color, this.orientation, this.app3d);
        this.visualizer.addToScene(this.scene);

        /* orbit line */
        this.orbitPath = new OrbitPath(this.color);
        this.scene.add(this.orbitPath.orbitLine);
        this.orbitPath.orbitLine.visible = this.app3d.getDisplaySetting('showOrbits');

        /* apsis markers */
        this.apsisVisualizer = new ApsisVisualizer(this.scene, this.color);
        this.apsisVisualizer.setVisible(this.app3d.getDisplaySetting('showOrbits'));

        /* ground track curve */
        this.groundTrackPath = new GroundtrackPath();
    }

    /* ───────────────────── Physics state ingestion ─────────────────────── */

    /**
     * Update authoritative physics state (invoked by worker handler).
     * @param {THREE.Vector3} pos – metres
     * @param {THREE.Vector3} vel – m/s
     * @param {Object} [debug]
     */
    updatePosition(pos, vel, debug) {
        if (debug) {
            this.debug = debug;
            // compute net acceleration from gravitational and drag components
            const totalAcc = debug.perturbation?.acc?.total;
            const dragAcc = debug.dragData?.dragAcceleration;
            if (totalAcc && dragAcc) {
                this.acceleration.set(
                    totalAcc.x + dragAcc.x,
                    totalAcc.y + dragAcc.y,
                    totalAcc.z + dragAcc.z
                );
            } else if (totalAcc) {
                this.acceleration.set(totalAcc.x, totalAcc.y, totalAcc.z);
            } else {
                this.acceleration.set(0, 0, 0);
            }
            // notify debug window of updated debug data
            this.debugWindow?.onPositionUpdate?.();
        }

        /* copy into internal vectors (no new allocations) */
        this.position.copy(pos);
        this.velocity.copy(vel);

        /* convert to scaled-km for rendering */
        this._scaledKm.set(pos.x * this._k, pos.y * this._k, pos.z * this._k);

        /* smooth to reduce visual jitter */
        this._smoothedKm.lerpVectors(this._smoothedKm, this._scaledKm, this._alpha);

        /* push to visual actors */
        this.visualizer.updatePosition(this._smoothedKm);
        this.visualizer.updateOrientation(this.orientation);
        this.apsisVisualizer.update(pos, vel, this.debug?.apsisData);

        /* maneuver nodes */
        for (const node of this.maneuverNodes) node.update?.();

        /* throttle CustomEvent to browser */
        const now = Date.now();
        if (now - this._lastSimEvt >= this._evtInterval) {
            this._dispatchSimData();
            this._lastSimEvt = now;
        }
    }

    /**
     * Process any pending worker frames queued by SatelliteManager.
     * Only the newest buffered frame is applied.
     */
    updateSatellite() {
        if (!this._updateBuffer.length) return;
        const u = this._updateBuffer.pop();
        this._updateBuffer.length = 0;

        this._tmpPos.set(u.position[0], u.position[1], u.position[2]);
        const vel = new THREE.Vector3(u.velocity[0], u.velocity[1], u.velocity[2]);
        this.updatePosition(this._tmpPos, vel);
    }

    /* ─────────────────────────── Accessors ─────────────────────────────── */

    getSpeed() { return this.velocity.length(); }
    getRadialAltitude() { return this.position.length() * Constants.metersToKm; }
    getSurfaceAltitude() { return (this.position.length() - Constants.earthRadius) * Constants.metersToKm; }
    getOrbitalElements() { return this.debug?.apsisData ?? null; }
    getMesh() { return this.visualizer?.mesh ?? null; }

    /* ─────────────────────────── Visibility ────────────────────────────── */

    setVisible(v) {
        const showOrbit = v && this.app3d.getDisplaySetting('showOrbits');
        this.visualizer.setVisible(v);
        this.orbitPath.setVisible(showOrbit);
        this.apsisVisualizer.setVisible(showOrbit);
    }

    /* ─────────────────── Maneuver-node helpers ─────────────────────────── */

    addManeuverNode(time, deltaV) {
        const node = new ManeuverNode({ satellite: this, time, deltaV });
        this.maneuverNodes.push(node);
        return node;
    }
    removeManeuverNode(node) {
        node.dispose();
        this.maneuverNodes = this.maneuverNodes.filter(n => n !== node);
    }

    /* ───────────────────────── Event dispatch ──────────────────────────── */

    _dispatchSimData() {
        try {
            const dbg = this.debug ?? {};
            const drag = dbg.dragData ?? {};
            const pert = dbg.perturbation ?? null;
            const elems = this.getOrbitalElements();
            const alt = this.getSurfaceAltitude();
            const speed = this.getSpeed();

            /* lat/lon */
            const simTime = this.app3d.timeUtils.getSimulatedTime();
            const epochMs = simTime.getTime?.() ?? new Date(simTime).getTime();
            const gmst = PhysicsUtils.calculateGMST(epochMs);
            const { lat, lon } = PhysicsUtils.eciTiltToLatLon(this.position, gmst);

            document.dispatchEvent(new CustomEvent('simulationDataUpdate', {
                detail: {
                    id: this.id,
                    simulatedTime: new Date(epochMs).toISOString(),
                    altitude: alt,
                    velocity: speed,
                    lat, lon,
                    elements: elems,
                    dragData: drag,
                    perturbation: pert,
                },
            }));
        } catch (err) {
            console.error('[Satellite] simulationDataUpdate failed:', err);
        }
    }

    /* ─────────────────────── Misc mutators ─────────────────────────────── */

    setColor(c) {
        this.color = c;
        this.visualizer.setColor(c);
        this.orbitPath.orbitLine.material.color.set(c);
    }

    delete() {
        if (this.app3d?.satellites?.removeSatellite) {
            this.app3d.satellites.removeSatellite(this.id);
        } else {
            this.dispose();
        }
    }

    /* ───────────────────────── Destructor ──────────────────────────────── */

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
}
