// Worker for managing ground track history for a satellite

console.log('[groundTrackWorker] Worker loaded');

// Map of satellite id -> ground trace points array
let groundTraceMap = {};
const maxTracePoints = 1000;

self.onmessage = function (e) {
    // e.data: { type, id, groundPoint }
    if (e.data.type === 'UPDATE_GROUND_POINT') {
        const { id, groundPoint, seq } = e.data;
        if (id === undefined || id === null) return;
        if (!groundTraceMap[id]) groundTraceMap[id] = [];
        if (groundTraceMap[id].length >= maxTracePoints) {
            groundTraceMap[id].shift();
        }
        groundTraceMap[id].push({ ...groundPoint });
        self.postMessage({
            type: 'GROUND_TRACK_UPDATE',
            id,
            groundTracePoints: groundTraceMap[id].slice(),
            seq
        });
    } else if (e.data.type === 'RESET') {
        if (e.data.id) {
            delete groundTraceMap[e.data.id];
        } else {
            groundTraceMap = {};
        }
    }
};