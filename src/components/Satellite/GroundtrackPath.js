/**
 * Manages ground track calculation for a single satellite using a shared worker.
 */
export class GroundtrackPath {
    constructor() {
        this.points = []; // Array of {lat, lon}
        this._seq = 0;
        this._lastSeq = -Infinity;
        this._currentId = null;

        // Use a shared worker across all GroundtrackPath instances
        if (!GroundtrackPath.sharedWorker) {
            GroundtrackPath.sharedWorker = new Worker(
                new URL('../../workers/groundtrackWorker.js', import.meta.url),
                { type: 'module' }
            );
            GroundtrackPath.sharedWorker.onmessage = GroundtrackPath._dispatchMessage;
            GroundtrackPath.handlers = {}; // Static map { id: handler }
        }
        this.worker = GroundtrackPath.sharedWorker;
    }

    /**
     * Request an update for the ground track.
     * @param {Date|number} startTime - Current simulation time (Date object or timestamp ms).
     * @param {THREE.Vector3} position - Current ECI position (meters).
     * @param {THREE.Vector3} velocity - Current ECI velocity (m/s).
     * @param {string|number} id - Satellite ID.
     * @param {Array<{position: THREE.Vector3, mass: number}>} bodies - Perturbing bodies.
     * @param {number} period - Orbital period (seconds) for propagation duration.
     * @param {number} numPoints - Number of points to calculate.
     */
    update(startTime, position, velocity, id, bodies, period, numPoints) {
        this._currentId = id;
        // Ensure the handler for this ID is registered
        if (!GroundtrackPath.handlers[id]) {
            GroundtrackPath.handlers[id] = this._handleMessage;
        }

        const seq = ++this._seq;
        const serialBodies = bodies.map(body => ({
            // Ensure positions are plain objects for worker message
            position: { x: body.position.x, y: body.position.y, z: body.position.z },
            mass: body.mass
        }));
        
        // Pass timestamp (ms) for startTime
        const startTimestamp = typeof startTime === 'number' ? startTime : startTime.getTime();

        this.worker.postMessage({
            type: 'UPDATE_GROUNDTRACK',
            id,
            startTime: startTimestamp,
            position: { x: position.x, y: position.y, z: position.z }, // Pass plain object
            velocity: { x: velocity.x, y: velocity.y, z: velocity.z }, // Pass plain object
            bodies: serialBodies,
            period,
            numPoints,
            seq
        });
    }

    getPoints() {
        return this.points;
    }

    dispose() {
        // Tell worker to clear cache for this satellite
        if (this.worker && this._currentId !== null) {
            this.worker.postMessage({ type: 'RESET', id: this._currentId });
        }
        // Unregister handler
        if (this._currentId !== null) {
            delete GroundtrackPath.handlers[this._currentId];
        }
    }

    // Static dispatcher for shared worker messages
    static _dispatchMessage(e) {
        if (e.data.type === 'GROUNDTRACK_UPDATE') {
            const handler = GroundtrackPath.handlers && GroundtrackPath.handlers[e.data.id];
            if (handler) {
                handler(e.data); // Pass the data part of the message
            }
        } else if (e.data.type === 'GROUNDTRACK_PROGRESS') {
            // Optional: Could dispatch a progress event here if needed
            // console.log(`Groundtrack progress for ${e.data.id}: ${e.data.progress}`);
        }
    }

    // Instance method to handle messages for this specific satellite
    _handleMessage = (data) => {
        // Only handle updates for this satellite
        if (data.id === this._currentId) {
            // Drop stale updates based on sequence number
            this._lastSeq = data.seq;
            this.points = data.points; // Update the points array
            
            
            // Dispatch an event to notify UI components (like GroundtrackWindow)
            document.dispatchEvent(new CustomEvent('groundTrackUpdated', {
                detail: { id: this._currentId, points: this.points }
            }));
        }
    };
} 