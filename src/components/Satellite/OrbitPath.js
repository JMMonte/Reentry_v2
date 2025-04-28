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
    static CAPACITY = 20_000;

    constructor(color) {
        /* sequence bookkeeping */
        this._seq = 0;
        this._lastSeq = -Infinity;

        /* typed-array capacity */
        const geom = new THREE.BufferGeometry();
        geom.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(OrbitPath.CAPACITY * 3), 3),
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
        this._k = Constants.metersToKm * Constants.scale;

        /* once-only loader overlay */
        OrbitPath._ensureLoader();

        /* shared worker bootstrap */
        if (!OrbitPath._worker) OrbitPath._initSharedWorker();
        this.worker = OrbitPath._worker;
    }

    /* ───────────────────────── Public API ───────────────────────── */

    /**
     * Ask the worker to (re)compute the orbit path.
     * All vectors are ECI metres / m s⁻¹.
     */
    update(position, velocity, id,
        bodies = [], period,
        numPoints = this._maxOrbitPoints,
        allowFullEllipse = false) {

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
            perturbationScale: window.app3d?.getDisplaySetting('perturbationScale') ?? 1,
            seq: ++this._seq,
            allowFullEllipse,
        });
    }

    setVisible(v) {
        this.orbitLine.visible = v;
        if (!v) {
            this.orbitLine.geometry.setDrawRange(0, 0);
            this.orbitLine.geometry.attributes.position.needsUpdate = true;
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
        const n = Math.min(Math.floor(pts.length / 3), OrbitPath.CAPACITY - 1);

        /* fire raw-data event for external consumers */
        document.dispatchEvent(new CustomEvent('orbitDataUpdate', {
            detail: { id: this._currentId, orbitPoints: pts, period: this._period, numPoints: this._numPoints },
        }));

        /* write into VBO – origin then prediction points */
        const attr = this.orbitLine.geometry.attributes.position;
        const buffer = attr.array;

        buffer[0] = this._originKm.x;
        buffer[1] = this._originKm.y;
        buffer[2] = this._originKm.z;
        buffer.set(pts.subarray(0, n * 3), 3);

        this.orbitLine.geometry.setDrawRange(0, n + 1);
        attr.needsUpdate = true;
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
        if (typeof document === 'undefined' || document.getElementById('orbit-path-loader')) return;

        /* keyframes */
        if (!document.getElementById('orbit-path-spinner-style')) {
            const sty = document.createElement('style');
            sty.id = 'orbit-path-spinner-style';
            sty.textContent = '@keyframes orbitPathSpin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}';
            document.head.appendChild(sty);
        }

        const box = document.createElement('div');
        box.id = 'orbit-path-loader';
        Object.assign(box.style, {
            position: 'absolute', bottom: '10px', left: '10px',
            display: 'none', alignItems: 'center',
            padding: '4px 8px', background: 'rgba(0,0,0,.6)',
            color: '#fff', fontSize: '12px', borderRadius: '4px', zIndex: 1000,
        });

        const spin = document.createElement('div');
        Object.assign(spin.style, {
            width: '16px', height: '16px',
            border: '2px solid #fff', borderTop: '2px solid transparent',
            borderRadius: '50%', marginRight: '8px',
            animation: 'orbitPathSpin 1s linear infinite',
        });

        box.appendChild(spin);
        box.appendChild(document.createTextNode('Computing orbit…'));
        document.body.appendChild(box);
    }

    static _toggleLoader(show) {
        const el = typeof document !== 'undefined' && document.getElementById('orbit-path-loader');
        if (el) el.style.display = show ? 'flex' : 'none';
    }
}
