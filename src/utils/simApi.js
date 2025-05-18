export const PHYSICS_SERVER_URL = import.meta.env.VITE_PHYSICS_SERVER_URL || 'http://localhost:8000';
// No axios import needed

/**
 * Set the simulation date on the backend.
 * @param {string} sessionId
 * @param {string} utcString - ISO string
 */
export async function setSimulationDate(sessionId, utcString) {
    const url = `http://localhost:8000/session/${sessionId}/date?utc=${encodeURIComponent(utcString)}`;
    
    await fetch(url, { method: 'POST' });
}

/**
 * Set the simulation timewarp on the backend via HTTP POST.
 * @param {string} sessionId
 * @param {number} factor
 * @returns {Promise<number|null>} The applied timewarp factor from the backend, or null on error.
 */
export async function setTimewarp(sessionId, factor) {
    const url = `${PHYSICS_SERVER_URL}/session/${sessionId}/timewarp?factor=${factor}`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) {
            const errorData = await response.text();
            console.error('[simApi] Failed to set timewarp. Status:', response.status, 'Response:', errorData);
            // alert(`Failed to set timewarp: ${errorData}`);
            return null;
        }
        const data = await response.json();
        if (data && typeof data.timewarp_factor === 'number') {
            
            return data.timewarp_factor;
        }
        console.warn('[simApi] Timewarp response did not contain a valid timewarp_factor:', data);
        return null;
    } catch (error) {
        console.error('[simApi] Error setting timewarp:', error);
        return null;
    }
} 