// GroundtrackPath.js

/**
 * Computes a satellite's ground-track in a Web-Worker and streams the
 * polyline back as {lat, lon} pairs.
 *
 * Design notes
 * • One shared worker for the whole app ↓ memory & thread count  
 * • Map-based handler lookup (O(1))  
 * • Sequence numbers drop late worker replies  
 * • No DOM churn; loader overlay omitted (keep UI free of duplicates)
 */
export class GroundtrackPath {
    /* ───────────── static shared infra ───────────── */
    static _worker = null;               // Web-Worker instance
    static _handlers = new Map();          // Map<satId, GroundtrackPath>

    static _initSharedWorker() {
        GroundtrackPath._worker = new Worker(
            new URL('../../physics/workers/groundtrackWorker.js', import.meta.url),
            { type: 'module' },
        );

        GroundtrackPath._worker.onmessage = (e) => {
            const { type, id } = e.data;
            // progress updates can be ignored or used for a loader
            if (type === 'GROUNDTRACK_PROGRESS') return;
            // chunk of points
            if (type === 'GROUNDTRACK_CHUNK') {
                GroundtrackPath._handlers.get(id)?._onWorkerChunk(e.data);
                return;
            }
            // final complete set
            if (type === 'GROUNDTRACK_UPDATE') {
                GroundtrackPath._handlers.get(id)?._onWorkerUpdate(e.data);
            }
        };
    }

    /* ───────────── constructor / fields ─────────── */
    constructor() {
        if (!GroundtrackPath._worker) GroundtrackPath._initSharedWorker();

        /** @type {{lat:number, lon:number}[]} */
        this.points = [];

        this._seq = 0;           // outbound
        this._lastSeq = -Infinity;   // inbound
        this._currentId = null;
        this.worker = GroundtrackPath._worker;
    }

    /* ───────────── public API ───────────── */

    /**
     * Ask the worker to (re)compute a ground-track polyline.
     * @param {Date|number} startTime – epoch ms or Date
     * @param {THREE.Vector3} position – ECI kilometres
     * @param {THREE.Vector3} velocity – ECI km/s
     * @param {string|number} id – satellite id
     * @param {{position:THREE.Vector3, mass:number}[]} bodies
     * @param {number} period – seconds to propagate
     * @param {number} numPoints – target segment count
     */
    update(startTime, position, velocity, id, bodies = [],
        period, numPoints) {

        this._currentId = id;
        GroundtrackPath._handlers.set(id, this);

        const seq = ++this._seq;

        const bodiesMsg = bodies.map(b => ({
            position: { x: b.position.x, y: b.position.y, z: b.position.z },
            mass: b.mass,
        }));

        const epochMs = typeof startTime === 'number'
            ? startTime
            : startTime.getTime();

        this.worker.postMessage({
            type: 'UPDATE_GROUNDTRACK',
            id,
            seq,
            startTime: epochMs,
            position: { x: position.x, y: position.y, z: position.z },
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
            bodies: bodiesMsg,
            period,
            numPoints,
        });
    }

    /** Return cached polyline */
    getPoints() { return this.points; }

    /** Release worker cache & detach handler */
    dispose() {
        if (this._currentId != null) {
            this.worker.postMessage({ type: 'RESET', id: this._currentId });
            GroundtrackPath._handlers.delete(this._currentId);
        }
        this.points.length = 0;
    }

    /* ───────────── instance handler ───────────── */

    /** called by static dispatcher */
    _onWorkerUpdate({ seq, points }) {
        if (seq <= this._lastSeq) return;   // stale frame
        this._lastSeq = seq;

        this.points = points;

        document.dispatchEvent(new CustomEvent('groundTrackUpdated', {
            detail: { id: this._currentId, points: this.points },
        }));
    }

    /** called on partial chunk updates */
    _onWorkerChunk({ seq, points }) {
        // only accept chunks for current sequence
        if (seq !== this._seq) return;
        // append new points
        this.points.push(...points);
        document.dispatchEvent(new CustomEvent('groundTrackChunk', {
            detail: { id: this._currentId, points }
        }));
    }
}
