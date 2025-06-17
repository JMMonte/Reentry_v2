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
        try {
            // Create inline worker code
            const workerCode = `
                // Inline groundtrack worker
                self.onmessage = function (e) {
                    if (e.data.type === 'UPDATE_GROUNDTRACK') {
                        const { 
                            id, 
                            seq, 
                            startTime, 
                            position, 
                            velocity, 
                            bodies, 
                            period, 
                            numPoints, 
                            centralBodyNaifId,
                            canvasWidth,
                            canvasHeight
                        } = e.data;
                        
                        try {
                            // For now, send back raw ECI coordinates and let main thread do the conversion
                            // This ensures we use the exact same coordinate transformation as the satellite position
                            const points = [];
                            const dt = period / numPoints; // time step in seconds
                            
                            // Current position and velocity
                            let pos = { ...position };
                            let vel = { ...velocity };
                            
                            for (let i = 0; i < numPoints; i++) {
                                const time = startTime + i * dt * 1000; // Convert to milliseconds
                                
                                // Simple two-body propagation (Euler integration)
                                // Find central body
                                const centralBody = bodies.find(b => b.naifId === centralBodyNaifId) || 
                                                  bodies.find(b => b.naifId === 399); // Default to Earth
                                
                                if (centralBody) {
                                    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
                                    const GM = centralBody.GM || 398600.4418; // Earth's GM in km³/s²
                                    
                                    // Gravitational acceleration
                                    const acc = GM / (r * r * r);
                                    const ax = -acc * pos.x;
                                    const ay = -acc * pos.y;
                                    const az = -acc * pos.z;
                                    
                                    // Update velocity and position (Euler method)
                                    vel.x += ax * dt;
                                    vel.y += ay * dt;
                                    vel.z += az * dt;
                                    
                                    pos.x += vel.x * dt;
                                    pos.y += vel.y * dt;
                                    pos.z += vel.z * dt;
                                }
                                
                                // Send raw ECI coordinates - main thread will do coordinate transformation
                                points.push({
                                    time,
                                    position: { x: pos.x, y: pos.y, z: pos.z }
                                });
                            }
                            
                            // Send response with raw ECI data
                            self.postMessage({
                                type: 'GROUNDTRACK_UPDATE',
                                id,
                                points,
                                seq,
                                isProcessed: false // Mark as not processed - needs coordinate conversion
                            });
                            
                        } catch (error) {
                            self.postMessage({
                                type: 'GROUNDTRACK_ERROR',
                                id,
                                error: error.message,
                                seq
                            });
                        }
                    }
                };
            `;
            
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            GroundtrackPath._worker = new Worker(workerUrl);
            
            // Set up message handlers immediately
            GroundtrackPath._setupWorkerHandlers();
        } catch (error) {
            console.error('[GroundtrackPath] Failed to create worker:', error);
            throw error;
        }
    }
    
    static _setupWorkerHandlers() {
        if (!GroundtrackPath._worker) return;

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
            // Handle errors
            if (type === 'GROUNDTRACK_ERROR') {
                console.error(`[GroundtrackPath] Worker error for satellite ${id}:`, e.data.error);
                GroundtrackPath._handlers.get(id)?._onWorkerError(e.data);
            }
        };
        
        GroundtrackPath._worker.onerror = (error) => {
            console.error('[GroundtrackPath] Worker error:', error);
        };
    }

    /**
     * Terminate the shared worker when no more handlers exist
     * Called automatically when the last handler is removed
     */
    static _cleanupSharedWorker() {
        if (GroundtrackPath._handlers.size === 0 && GroundtrackPath._worker) {
            GroundtrackPath._worker.terminate();
            GroundtrackPath._worker = null;
        }
    }
    
    /**
     * Force cleanup of the shared worker - call this on app shutdown
     */
    static forceCleanup() {
        if (GroundtrackPath._worker) {
            GroundtrackPath._worker.terminate();
            GroundtrackPath._worker = null;
        }
        GroundtrackPath._handlers.clear();
    }

    /* ───────────── constructor / fields ─────────── */
    constructor() {
        if (!GroundtrackPath._worker) {
            GroundtrackPath._initSharedWorker();
        }

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
     * @param {{x: number, y: number, z: number}} position – ECI kilometres
     * @param {{x: number, y: number, z: number}} velocity – ECI km/s
     * @param {string|number} id – satellite id
     * @param {{position: Array<number>, mass: number, naifId: number}[]} bodies
     * @param {number} period – seconds to propagate
     * @param {number} numPoints – target segment count
     * @param {number} centralBodyNaifId – NAIF ID of central body for orbit propagation
     * @param {Function} onUpdate – Optional callback for updates
     * @param {Function} onChunk – Optional callback for chunk updates
     */
    update(startTime, position, velocity, id, bodies = [],
        period, numPoints, centralBodyNaifId = null, onUpdate = null, onChunk = null, canvasWidth = null, canvasHeight = null) {

        this._currentId = id;
        this._onUpdateCallback = onUpdate;
        this._onChunkCallback = onChunk;
        GroundtrackPath._handlers.set(id, this);

        const seq = ++this._seq;
        
        // Check if worker is ready
        if (!this.worker) {
            if (onUpdate) {
                onUpdate({ id, points: [], error: 'Worker not initialized' });
            }
            return;
        }

        const bodiesMsg = bodies.map(b => {
            // Handle undefined or invalid position data
            let position;
            if (Array.isArray(b.position) && b.position.length >= 3) {
                position = { x: b.position[0], y: b.position[1], z: b.position[2] };
            } else if (b.position && typeof b.position === 'object' && 
                       b.position.x !== undefined && b.position.y !== undefined && b.position.z !== undefined) {
                position = { x: b.position.x, y: b.position.y, z: b.position.z };
            } else {
                // Fallback for invalid position data
                console.warn(`[GroundtrackPath] Invalid position data for body ${b.naifId || b.id}:`, b.position);
                position = { x: 0, y: 0, z: 0 };
            }

            return {
                position,
            mass: b.mass || 0,
            GM: b.GM,
            naifId: b.id || b.naifId,
            type: b.type
            };
        });

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
            centralBodyNaifId,
            canvasWidth,
            canvasHeight
        });
    }

    /** Return cached polyline */
    getPoints() { return this.points; }

    /** Release worker cache & detach handler */
    dispose() {
        if (this._currentId != null) {
            this.worker.postMessage({ type: 'RESET', id: this._currentId });
            GroundtrackPath._handlers.delete(this._currentId);
            this._currentId = null;
        }
        this.points.length = 0;
        
        // Check if we should terminate the shared worker
        GroundtrackPath._cleanupSharedWorker();
    }

    /* ───────────── instance handler ───────────── */

    /** called by static dispatcher */
    _onWorkerUpdate({ seq, points, isProcessed }) {
        if (seq <= this._lastSeq) return;   // stale frame
        this._lastSeq = seq;

        // Points are now pre-processed with lat/lon/alt from worker
        this.points = points;
        this.isProcessed = isProcessed || false;

        // Use callback if provided, otherwise fallback to DOM event
        if (this._onUpdateCallback) {
            this._onUpdateCallback({
                id: this._currentId,
                points: this.points,
                isProcessed: this.isProcessed
            });
        } else {
            document.dispatchEvent(new CustomEvent('groundTrackUpdated', {
                detail: { 
                    id: this._currentId, 
                    points: this.points,
                    isProcessed: this.isProcessed 
                },
            }));
        }
    }

    /** called on partial chunk updates */
    _onWorkerChunk({ seq, points, isProcessed }) {
        // only accept chunks for current sequence
        if (seq !== this._seq) return;
        // append new points (now with lat/lon/alt pre-calculated)
        this.points.push(...points);
        this.isProcessed = isProcessed || false;
        
        // Use callback if provided, otherwise fallback to DOM event
        if (this._onChunkCallback) {
            this._onChunkCallback({
                id: this._currentId,
                points,
                isProcessed: this.isProcessed
            });
        } else {
            document.dispatchEvent(new CustomEvent('groundTrackChunk', {
                detail: { 
                    id: this._currentId, 
                    points,
                    isProcessed: this.isProcessed
                }
            }));
        }
    }
    
    /** called on worker error */
    _onWorkerError({ error }) {
        console.error(`[GroundtrackPath] Error for satellite ${this._currentId}:`, error);
        
        // Use callback if provided, otherwise fallback to DOM event
        if (this._onUpdateCallback) {
            this._onUpdateCallback({
                id: this._currentId,
                points: [],
                error: error
            });
        } else {
            document.dispatchEvent(new CustomEvent('groundTrackError', {
                detail: { 
                    id: this._currentId, 
                    error: error
                },
            }));
        }
    }
}
