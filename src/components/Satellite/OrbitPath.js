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

    /**
     * Resample orbit points by arc length, with optional subdivision for high-eccentricity orbits.
     * @param {Array<{x:number,y:number,z:number}>} pts raw orbit points
     * @param {number} [targetCount=pts.length] desired number of output points
     * @returns {Array<{x:number,y:number,z:number}>} uniformly spaced resampled points
     */
    _resampleArcLength(pts, targetCount = pts.length) {
        if (!pts || pts.length < 2 || targetCount < 2) return pts;
        // Convert to Vector3 array
        const vecs = pts.map(p => new THREE.Vector3(p.x, p.y, p.z));
        // Compute total arc length over raw points
        let total = 0;
        const segLengths = [];
        for (let i = 0; i < vecs.length - 1; i++) {
            const d = vecs[i].distanceTo(vecs[i + 1]);
            segLengths.push(d);
            total += d;
        }
        const threshold = total / (targetCount - 1);
        // Subdivide segments longer than threshold
        const subdiv = [vecs[0].clone()];
        for (let i = 0; i < vecs.length - 1; i++) {
            const p0 = vecs[i], p1 = vecs[i + 1];
            const d = segLengths[i];
            const n = threshold > 0 ? Math.ceil(d / threshold) : 1;
            for (let j = 1; j <= n; j++) {
                const t = j / n;
                subdiv.push(p0.clone().lerp(p1, t));
            }
        }
        // Build cumulative distances on subdivided points
        const cum = [0];
        for (let i = 0; i < subdiv.length - 1; i++) {
            cum.push(cum[i] + subdiv[i].distanceTo(subdiv[i + 1]));
        }
        // Sample targetCount points evenly along total arc
        const resampled = [];
        for (let k = 0; k < targetCount; k++) {
            const s = (k / (targetCount - 1)) * total;
            // find segment index where cum >= s
            let idx = cum.findIndex(c => c >= s);
            if (idx === -1) {
                resampled.push(subdiv[subdiv.length - 1].clone());
            } else if (idx === 0) {
                resampled.push(subdiv[0].clone());
            } else {
                const s0 = cum[idx - 1];
                const seg = cum[idx] - s0;
                const t = seg > 0 ? (s - s0) / seg : 0;
                resampled.push(subdiv[idx - 1].clone().lerp(subdiv[idx], t));
            }
        }
        return resampled.map(v => ({ x: v.x, y: v.y, z: v.z }));
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
            // Handle transferred Float32Array buffer from worker
            const rawPts = e.data.orbitPoints;
            let ptsArr;
            if (rawPts instanceof ArrayBuffer) {
                ptsArr = new Float32Array(rawPts);
            } else if (ArrayBuffer.isView(rawPts)) {
                ptsArr = rawPts;
            } else {
                // Fallback: convert object array to flat Float32Array
                ptsArr = new Float32Array(rawPts.length * 3);
                for (let j = 0; j < rawPts.length; j++) {
                    ptsArr[j * 3] = rawPts[j].x;
                    ptsArr[j * 3 + 1] = rawPts[j].y;
                    ptsArr[j * 3 + 2] = rawPts[j].z;
                }
            }
            const pointCount = Math.floor(ptsArr.length / 3);
            const objPts = new Array(pointCount);
            for (let i = 0; i < pointCount; i++) {
                objPts[i] = { x: ptsArr[i * 3], y: ptsArr[i * 3 + 1], z: ptsArr[i * 3 + 2] };
            }
            const multiplier = window.app3d?.getDisplaySetting('hyperbolicPointsMultiplier') ?? 1;
            const soiWorld = Constants.earthSOI * Constants.metersToKm * Constants.scale;
            const weightedPts = [];
            if (objPts.length > 0) {
                weightedPts.push(objPts[0]);
                for (let i = 0; i < objPts.length - 1; i++) {
                    const p0 = objPts[i];
                    const p1 = objPts[i + 1];
                    const midX = (p0.x + p1.x) / 2;
                    const midY = (p0.y + p1.y) / 2;
                    const midZ = (p0.z + p1.z) / 2;
                    const dMid = Math.sqrt(midX * midX + midY * midY + midZ * midZ);
                    const subdivCount = dMid <= soiWorld ? multiplier : 1;
                    for (let j = 1; j <= subdivCount; j++) {
                        const t = j / subdivCount;
                        weightedPts.push({
                            x: p0.x + (p1.x - p0.x) * t,
                            y: p0.y + (p1.y - p0.y) * t,
                            z: p0.z + (p1.z - p0.z) * t
                        });
                    }
                }
            }
            const resampled = this._resampleArcLength(weightedPts, this._numPoints);
            ptsArr = new Float32Array(resampled.length * 3);
            for (let i = 0; i < resampled.length; i++) {
                ptsArr[i * 3] = resampled[i].x;
                ptsArr[i * 3 + 1] = resampled[i].y;
                ptsArr[i * 3 + 2] = resampled[i].z;
            }

            const numPts = Math.floor(ptsArr.length / 3);
            // Store flat array of coordinates
            this.orbitPoints = ptsArr;
            // Emit orbit data update event for UI
            document.dispatchEvent(new CustomEvent('orbitDataUpdate', {
                detail: {
                    id: this._currentId,
                    orbitPoints: ptsArr,
                    period: this._period,
                    numPoints: this._numPoints
                }
            }));
            // Compute drawing parameters
            const k = Constants.metersToKm * Constants.scale;
            const origin = this._currentPosition.clone().multiplyScalar(k);
            const count = numPts + 1;
            this._maxOrbitPoints = numPts;
            // Use preallocated buffer: clamp draw range
            const geometry = this.orbitLine.geometry;
            const positionAttr = geometry.attributes.position;
            const drawCount = Math.min(count, this._capacity);
            geometry.setDrawRange(0, drawCount);
            const array = positionAttr.array;
            // Set current position as first point
            array[0] = origin.x;
            array[1] = origin.y;
            array[2] = origin.z;
            // Fill predicted points directly from flat buffer
            for (let j = 0; j < numPts; j++) {
                const inIdx = j * 3;
                const outIdx = (j + 1) * 3;
                array[outIdx] = ptsArr[inIdx];
                array[outIdx + 1] = ptsArr[inIdx + 1];
                array[outIdx + 2] = ptsArr[inIdx + 2];
            }
            positionAttr.needsUpdate = true;
        }
    };
} 