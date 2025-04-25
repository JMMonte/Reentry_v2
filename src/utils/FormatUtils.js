export /**
 * Format a millisecond time delta into "HH:MM:SS" string with optional sign.
 * @param {number} deltaMs
 * @returns {string}
 */ function formatTimeDelta(deltaMs) {
    const sign = deltaMs < 0 ? '-' : '';
    const absMs = Math.abs(deltaMs);
    const totalSeconds = Math.floor(absMs / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default formatTimeDelta; 