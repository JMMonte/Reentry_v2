import * as THREE from 'three';

export class OrbitPath {
    constructor(color) {
        this.orbitPoints = [];
        // Sequence numbering to drop stale updates
        this._seq = 0;
        this._lastSeq = -Infinity;
        // Preallocate buffer for orbit points (max 180 points)
        this._maxOrbitPoints = 180;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this._maxOrbitPoints * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);
        this.orbitLine = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({
                color,
                linewidth: 2,
                transparent: true,
                opacity: 0.7
            })
        );
        this.orbitLine.frustumCulled = false;
        this.orbitLine.visible = false;
        // Use a shared worker across all OrbitPath instances
        if (!OrbitPath.sharedWorker) {
            OrbitPath.sharedWorker = new Worker(
                new URL('../../workers/orbitPathWorker.js', import.meta.url),
                { type: 'module' }
            );
            OrbitPath.sharedWorker.onmessage = OrbitPath._dispatchMessage;
            OrbitPath.handlers = {};
        }
        this.worker = OrbitPath.sharedWorker;
        // Register handler for each satellite ID
        OrbitPath.handlers = OrbitPath.handlers || {};
        // Note: handlers are keyed by satellite ID after first update call
    }

    update(position, velocity, id, bodies = [], period, numPoints = this._maxOrbitPoints) {
        this._currentId = id;
        OrbitPath.handlers[id] = this._handleMessage;
        const seq = ++this._seq;
        const serialBodies = bodies.map(body => ({
            position: { x: body.position.x, y: body.position.y, z: body.position.z },
            mass: body.mass
        }));
        this.worker.postMessage({
            type: 'UPDATE_ORBIT',
            id,
            position: { x: position.x, y: position.y, z: position.z },
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
            bodies: serialBodies,
            period,
            numPoints,
            seq
        });
    }

    setVisible(visible) {
        this.orbitLine.visible = visible;
        if (!visible) {
            const geom = this.orbitLine.geometry;
            geom.setDrawRange(0, 0);
            geom.attributes.position.needsUpdate = true;
        }
    }

    setColor(color) {
        if (this.orbitLine.material) {
            this.orbitLine.material.color.set(color);
        }
    }

    dispose() {
        if (this.orbitLine.geometry) this.orbitLine.geometry.dispose();
        if (this.orbitLine.material) this.orbitLine.material.dispose();
        // Tell worker to clear this satellite's orbitCache
        if (this.worker) {
            this.worker.postMessage({ type: 'RESET', id: this._currentId });
        }
        // Unregister handler and terminate shared worker if none remain
        delete OrbitPath.handlers[this._currentId];
        if (Object.keys(OrbitPath.handlers).length === 0 && OrbitPath.sharedWorker) {
            OrbitPath.sharedWorker.terminate();
            OrbitPath.sharedWorker = null;
            OrbitPath.handlers = {};
        }
    }

    // Static dispatcher for shared worker messages
    static _dispatchMessage(e) {
        const handler = OrbitPath.handlers && OrbitPath.handlers[e.data.id];
        if (handler) handler(e);
    }

    // Register handler for this satellite ID
    _handleMessage = (e) => {
        // Only handle updates for this satellite
        if (e.data.type === 'ORBIT_PATH_UPDATE' && e.data.id === this._currentId) {
            // Drop stale updates
            const seq = e.data.seq;
            if (seq <= this._lastSeq) return;
            this._lastSeq = seq;
            // Don't update geometry when hidden
            if (!this.orbitLine.visible) return;
            const pts = e.data.orbitPoints;
            const geom = this.orbitLine.geometry;
            const attr = geom.attributes.position;
            const arr = attr.array;
            const count = Math.min(pts.length, this._maxOrbitPoints);
            // Update positions
            for (let i = 0; i < count; i++) {
                const pt = pts[i];
                const idx = i * 3;
                arr[idx]     = pt.x;
                arr[idx + 1] = pt.y;
                arr[idx + 2] = pt.z;
            }
            geom.setDrawRange(0, count);
            attr.needsUpdate = true;
        }
    };
} 