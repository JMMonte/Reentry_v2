import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

export class OrbitPath {
    constructor(color) {
        this.orbitPoints = [];
        // Sequence numbering to drop stale updates
        this._seq = 0;
        this._lastSeq = -Infinity;
        // Start with zero-length buffer; will rebuild per update
        this._maxOrbitPoints = 0;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(0);
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
        // Store period and number of points for simulation data window
        this._period = period;
        this._numPoints = numPoints;
        this._currentId = id;
        // Save current position for geometry origin
        this._currentPosition = position.clone();
        // Store Earth position for distance calculations
        if (bodies.length > 0) {
            const bp = bodies[0].position;
            this._earthPosition = new THREE.Vector3(bp.x, bp.y, bp.z);
        } else {
            this._earthPosition = new THREE.Vector3(0, 0, 0);
        }
        OrbitPath.handlers[id] = this._handleMessage;
        const seq = ++this._seq;
        const serialBodies = bodies.map(body => ({
            position: { x: body.position.x, y: body.position.y, z: body.position.z },
            mass: body.mass
        }));
        // Read current perturbation scale from UI settings
        const perturbationScale = window.app3d?.getDisplaySetting('perturbationScale') ?? 1.0;
        this.worker.postMessage({
            type: 'UPDATE_ORBIT',
            id,
            position: { x: position.x, y: position.y, z: position.z },
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
            bodies: serialBodies,
            period,
            numPoints,
            perturbationScale,
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
            // Store orbit points for simulation data window (predicted points only)
            this.orbitPoints = pts;
            // Emit orbit data update event for UI
            document.dispatchEvent(new CustomEvent('orbitDataUpdate', {
                detail: {
                    id: this._currentId,
                    orbitPoints: pts,
                    period: this._period,
                    numPoints: this._numPoints
                }
            }));
            // Include current position as first point and then predicted points
            const k = Constants.metersToKm * Constants.scale;
            const origin = this._currentPosition.clone().multiplyScalar(k);
            const count = pts.length + 1;
            // Update max orbit points (predicted only, for future updates)
            this._maxOrbitPoints = pts.length;
            // Rebuild geometry to match incoming points plus current position
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(count * 3);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setDrawRange(0, count);
            this.orbitLine.geometry.dispose();
            this.orbitLine.geometry = geometry;
            // Fill positions: first current position, then predicted orbit
            const array = geometry.attributes.position.array;
            // current position
            array[0] = origin.x;
            array[1] = origin.y;
            array[2] = origin.z;
            // predicted points
            for (let i = 0; i < pts.length; i++) {
                const pt = pts[i];
                const idx = (i + 1) * 3;
                array[idx] = pt.x;
                array[idx + 1] = pt.y;
                array[idx + 2] = pt.z;
            }
            geometry.attributes.position.needsUpdate = true;
        }
    };
} 