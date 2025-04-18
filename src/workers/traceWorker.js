// Worker for managing trace (actual path) for satellites

console.log('[traceWorker] Worker loaded');

// Map of satellite id -> trace points array
let traceMap = {};
const maxTracePoints = 1000;

self.onmessage = function (e) {
    if (e.data.type === 'UPDATE_TRACE') {
        const { id, position } = e.data;
        if (id === undefined || id === null) return;
        if (!traceMap[id]) traceMap[id] = [];
        if (traceMap[id].length >= maxTracePoints) {
            traceMap[id].shift();
        }
        traceMap[id].push({ ...position });
        self.postMessage({
            type: 'TRACE_UPDATE',
            id,
            tracePoints: traceMap[id].slice()
        });
    } else if (e.data.type === 'RESET') {
        if (e.data.id) {
            delete traceMap[e.data.id];
        } else {
            traceMap = {};
        }
        console.log('[traceWorker] Reset trace map');
    }
}; 