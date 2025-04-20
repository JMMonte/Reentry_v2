// TraceManager.js

class TraceManager {
    constructor(maxPoints = 1000) {
        this.maxPoints = maxPoints;
        this.queue = {};
        this.handlers = {};
        this.worker = new Worker(new URL('../workers/traceWorker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => {
            if (e.data.type === 'TRACE_UPDATE_BATCH') {
                e.data.updates.forEach(({ id, tracePoints }) => {
                    const handler = this.handlers[id];
                    if (handler) handler(tracePoints);
                });
            }
        };
    }

    register(id, handler) {
        this.handlers[id] = handler;
    }

    unregister(id) {
        delete this.handlers[id];
    }

    queueUpdate(id, point) {
        this.queue[id] = point;
    }

    flush() {
        const updates = [];
        for (const id in this.queue) {
            updates.push({ id, point: this.queue[id] });
        }
        this.queue = {};
        if (updates.length > 0) {
            this.worker.postMessage({ type: 'UPDATE_TRACE_BATCH', updates });
        }
    }
}

export default new TraceManager(); 