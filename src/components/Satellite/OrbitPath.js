import * as THREE from 'three';
import { Constants } from '../../utils/Constants.js';

export class OrbitPath {
    constructor(color) {
        this.orbitPoints = [];
        // Sequence numbering to drop stale updates
        this._seq = 0;
        this._lastSeq = -Infinity;
        // Preallocate a fixed-size buffer to avoid resizing and GL errors
        this._capacity = 20000; // max number of orbit points
        this._maxOrbitPoints = 0;
        const geometry = new THREE.BufferGeometry();
        // Allocate full capacity upfront
        const positions = new Float32Array(this._capacity * 3);
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

        // Create spinner-based orbit-loading indicator
        if (typeof document !== 'undefined' && !document.getElementById('orbit-path-loader')) {
            // Add spinner keyframes
            if (!document.getElementById('orbit-path-spinner-style')) {
                const style = document.createElement('style');
                style.id = 'orbit-path-spinner-style';
                style.textContent = `@keyframes orbitPathSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
                document.head.appendChild(style);
            }
            // Loader container
            const loader = document.createElement('div');
            loader.id = 'orbit-path-loader';
            Object.assign(loader.style, {
                position: 'absolute', bottom: '10px', left: '10px',
                display: 'none', alignItems: 'center',
                padding: '4px 8px', background: 'rgba(0,0,0,0.6)',
                color: '#fff', fontSize: '12px', borderRadius: '4px',
                zIndex: '1000'
            });
            // Spinner element
            const spinner = document.createElement('div');
            spinner.id = 'orbit-path-spinner';
            Object.assign(spinner.style, {
                width: '16px', height: '16px',
                border: '2px solid #fff', borderTop: '2px solid transparent',
                borderRadius: '50%', marginRight: '8px',
                animation: 'orbitPathSpin 1s linear infinite'
            });
            loader.appendChild(spinner);
            document.body.appendChild(loader);
        }

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

    update(position, velocity, id, bodies = [], period, numPoints = this._maxOrbitPoints, allowFullEllipse = false) {
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
            seq,
            allowFullEllipse
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
        // Unregister handler but keep shared worker alive
        delete OrbitPath.handlers[this._currentId];
    }

    // Static dispatcher for shared worker messages
    static _dispatchMessage(e) {
        // Hide loader once data arrives
        if (e.data.type === 'ORBIT_PATH_UPDATE') {
            const loader = document.getElementById('orbit-path-loader');
            if (loader) loader.style.display = 'none';
        }
        if (e.data.type === 'ORBIT_PATH_PROGRESS') {
            const loader = document.getElementById('orbit-path-loader');
            if (loader) loader.style.display = 'flex';
            return;
        }
        const handler = OrbitPath.handlers && OrbitPath.handlers[e.data.id];
        if (handler) handler(e);
    }

    // Register handler for this satellite ID
    _handleMessage = (e) => {
        if (e.data.type === 'ORBIT_PATH_UPDATE' && e.data.id === this._currentId) {
            const seq = e.data.seq;
            if (seq <= this._lastSeq) return;
            this._lastSeq = seq;
            if (!this.orbitLine.visible) return;
            // Directly use the transferred Float32Array for geometry positions
            const rawBuf = e.data.orbitPoints;
            const ptsArr = rawBuf instanceof ArrayBuffer
                ? new Float32Array(rawBuf)
                : ArrayBuffer.isView(rawBuf)
                    ? rawBuf
                    : new Float32Array(rawBuf);
            const numPts = Math.floor(ptsArr.length / 3);
            this.orbitPoints = ptsArr;
            // Emit orbit data update event for external handlers
            document.dispatchEvent(new CustomEvent('orbitDataUpdate', {
                detail: {
                    id: this._currentId,
                    orbitPoints: this.orbitPoints,
                    period: this._period,
                    numPoints: this._numPoints
                }
            }));
            // Update geometry buffer
            const k = Constants.metersToKm * Constants.scale;
            const origin = this._currentPosition.clone().multiplyScalar(k);
            const geometry = this.orbitLine.geometry;
            const positionAttr = geometry.attributes.position;
            const array = positionAttr.array;
            const drawCount = Math.min(numPts + 1, this._capacity);
            geometry.setDrawRange(0, drawCount);
            // Set starting point as the current position
            array[0] = origin.x;
            array[1] = origin.y;
            array[2] = origin.z;
            // Copy predicted orbit points in bulk for performance
            const pointCount = Math.min(numPts, this._capacity - 1);
            array.set(
                ptsArr.subarray(0, pointCount * 3),
                3
            );
            positionAttr.needsUpdate = true;
        }
    };
} 