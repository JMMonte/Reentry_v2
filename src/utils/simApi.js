// No axios import needed

/**
 * Set the simulation date on the backend.
 * @param {string} sessionId
 * @param {string} utcString - ISO string
 */
export async function setSimulationDate(sessionId, utcString) {
    const url = `http://localhost:8000/session/${sessionId}/date?utc=${encodeURIComponent(utcString)}`;
    console.log('[simApi] setSimulationDate', { sessionId, utcString, url });
    await fetch(url, { method: 'POST' });
}

/**
 * Set the simulation timewarp on the backend.
 * @param {string} sessionId
 * @param {number} factor
 * @param {WebSocket} ws
 */
export function setTimewarp(sessionId, factor, ws) {
    console.log('[simApi] setTimewarp', { sessionId, factor, wsReadyState: ws?.readyState, ws });
    if (!ws || ws.readyState !== 1) {
        console.warn('[simApi] WebSocket not ready for timewarp', ws);
        return;
    }
    // Send binary message as per backend spec
    const buf = new ArrayBuffer(5);
    const dv = new DataView(buf);
    dv.setUint8(0, 1); // msgType = 1
    dv.setFloat32(1, factor, true); // little-endian float
    ws.send(buf);
} 