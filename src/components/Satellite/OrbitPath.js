// OrbitPath.js

import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

/**
 * Predictive orbit trail for a single satellite.
 *
 * Hot-path notes
 * • One shared Web-Worker for all instances (lower memory / thread count)
 * • Handler Map<satId, OrbitPath> instead of object literals
 * • Float32Array bulk-copy into a pre-allocated VBO (capacity 20 000 verts)
 * • Sequence numbers so late/out-of-order packets are ignored
 * • Simple loader overlay toggled via static helpers
 */
export class OrbitPath {
    /** Max vertices reserved for every orbit line */
    static get CAPACITY() { return 20000; }

    constructor(color) {
        /* sequence bookkeeping */
        this._seq = 0;
        this._lastSeq = -Infinity;

        /* typed-array capacity */
        const geom = new THREE.BufferGeometry();
        geom.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(OrbitPath.CAPACITY * 3), 3)
        );
        geom.setDrawRange(0, 0);

        this.orbitLine = new THREE.Line(
            geom,
            new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: 0.7 }),
        );
        this.orbitLine.frustumCulled = false;
        this.orbitLine.visible = false;

        /* scratch vars */
        this._originKm = new THREE.Vector3();
        this._k = Constants.metersToKm;

        /* once-only loader overlay */
        OrbitPath._ensureLoader();

        /* shared worker bootstrap */
        if (!OrbitPath._worker) OrbitPath._initSharedWorker();
        this.worker = OrbitPath._worker;

        // track last drawn count and current buffer capacity
        this._lastDrawCount = 0;
        this._capacity = OrbitPath.CAPACITY;
    }

    /* ───────────────────────── Public API ───────────────────────── */

    /**
     * Ask the worker to (re)compute the orbit path.
     * All vectors are ECI metres / m s⁻¹.
     */
    update(position, velocity, id, bodies, period, numPoints, allowFullEllipse) {
        // set default values for optional args
        bodies = (bodies !== undefined && bodies !== null) ? bodies : [];
        numPoints = (numPoints !== undefined && numPoints !== null) ? numPoints : (this._capacity - 1);
        allowFullEllipse = !!allowFullEllipse;

        // ensure geometry buffer can hold all points (origin + numPoints)
        const requiredPoints = numPoints + 1;
        if (requiredPoints > this._capacity) {
            this._capacity = requiredPoints;
            // reallocate position attribute
            const newAttr = new THREE.BufferAttribute(new Float32Array(this._capacity * 3), 3);
            this.orbitLine.geometry.setAttribute('position', newAttr);
        }
        this._currentId = id;
        this._period = period;
        this._numPoints = numPoints;
        this._originKm.copy(position).multiplyScalar(this._k);

        /* Structured-clone-ready bodies array */
        const bodiesMsg = bodies.map(b => ({
            position: { x: b.position.x, y: b.position.y, z: b.position.z },
            mass: b.mass,
        }));

        OrbitPath._handlers.set(id, this);          // subscribe

        this.worker.postMessage({
            type: 'UPDATE_ORBIT',
            id,
            position: { x: position.x, y: position.y, z: position.z },
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
            bodies: bodiesMsg,
            period,
            numPoints,
            perturbationScale: (window.app3d && window.app3d.getDisplaySetting('perturbationScale')) || 1,
            seq: ++this._seq,
            allowFullEllipse,
        });
    }

    setVisible(v) {
        this.orbitLine.visible = v;
        const geom = this.orbitLine.geometry;
        if (!v) {
            geom.setDrawRange(0, 0);
            geom.attributes.position.needsUpdate = true;
        } else if (this._lastDrawCount > 0) {
            // restore previous draw range immediately
            geom.setDrawRange(0, this._lastDrawCount);
            geom.attributes.position.needsUpdate = true;
        }
    }
    setColor(c) { this.orbitLine.material.color.set(c); }

    dispose() {
        this.orbitLine.geometry.dispose();
        this.orbitLine.material.dispose();
        this.worker.postMessage({ type: 'RESET', id: this._currentId });
        OrbitPath._handlers.delete(this._currentId);
    }

    /* ─────────────────────── Internal handlers ─────────────────────── */

    /** instance-specific message processor (routed via static map) */
    _onWorkerUpdate(e) {
        const { seq, orbitPoints } = e.data;
        if (seq <= this._lastSeq || !this.orbitLine.visible) return;
        this._lastSeq = seq;

        const pts = orbitPoints instanceof Float32Array ? orbitPoints : new Float32Array(orbitPoints);
        // Determine how many vertices we can draw based on the current buffer capacity
        const attr = this.orbitLine.geometry.attributes.position;
        const maxVerts = Math.floor(attr.array.length / 3);
        const sampleCount = Math.floor(pts.length / 3);
        const n = Math.min(sampleCount, maxVerts - 1);

        /* fire raw-data event for external consumers */
        document.dispatchEvent(new CustomEvent('orbitDataUpdate', {
            detail: { id: this._currentId, orbitPoints: pts, period: this._period, numPoints: this._numPoints },
        }));

        /* write into VBO – origin then prediction points */
        const buffer = attr.array;

        buffer[0] = this._originKm.x;
        buffer[1] = this._originKm.y;
        buffer[2] = this._originKm.z;
        buffer.set(pts.subarray(0, n * 3), 3);

        this.orbitLine.geometry.setDrawRange(0, n + 1);
        attr.needsUpdate = true;

        // capture last count for visibility toggling
        this._lastDrawCount = n + 1;
    }

    /* ─────────────────────────── Static infra ────────────────────────── */

    /** one shared worker + handler map across the whole app */
    static _initSharedWorker() {
        OrbitPath._worker = new Worker(
            new URL('../../workers/orbitPathWorker.js', import.meta.url),
            { type: 'module' },
        );
        OrbitPath._handlers = new Map();

        OrbitPath._worker.onmessage = (e) => {
            const { type, id } = e.data;
            if (type === 'ORBIT_PATH_PROGRESS') { OrbitPath._toggleLoader(true); return; }
            if (type === 'ORBIT_PATH_UPDATE') { OrbitPath._toggleLoader(false); }
            OrbitPath._handlers.get(id)?._onWorkerUpdate(e);
        };
    }

    /** lightweight loader overlay (created once) */
    static _ensureLoader() {
        // Loader overlay disabled for performance
    }

    static _toggleLoader() {
        // No-op to avoid DOM access
    }
}
