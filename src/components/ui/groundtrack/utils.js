// Earth radius fallback - should be retrieved from PhysicsAPI in the future
const R_EARTH = 6371; // km - Earth mean radius
const GRID_MAJOR = 10;
const GRID_MINOR = 5;

/** Convert degrees to radians */
export const deg2rad = d => (d * Math.PI) / 180;

/** Draw a world-size lat/lon grid */
export function drawGrid(ctx, w, h) {
    ctx.save();
    for (let lon = -180; lon <= 180; lon += GRID_MINOR) {
        const x = ((lon + 180) / 360) * w;
        ctx.strokeStyle =
            lon === 0
                ? 'rgba(255,255,255,0.5)'
                : lon % GRID_MAJOR === 0
                    ? 'rgba(255,255,255,0.3)'
                    : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = lon % GRID_MAJOR === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let lat = -90; lat <= 90; lat += GRID_MINOR) {
        const y = ((90 - lat) / 180) * h;
        ctx.strokeStyle =
            lat === 0
                ? 'rgba(255,255,255,0.5)'
                : lat % GRID_MAJOR === 0
                    ? 'rgba(255,255,255,0.3)'
                    : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = lat % GRID_MAJOR === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    ctx.restore();
}

/** Draw an array or GeoJSON of point features */
export function drawPOI(ctx, data, w, h, color, r) {
    ctx.fillStyle = color;
    const drawPoint = ([lon, lat]) => {
        const x = ((lon + 180) / 360) * w;
        const y = ((90 - lat) / 180) * h;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fill();
    };

    if (Array.isArray(data)) {
        data.forEach(({ lon, lat }) => drawPoint([lon, lat]));
    } else if (data?.features) {
        data.features.forEach(f => {
            if (f.geometry?.coordinates) drawPoint(f.geometry.coordinates);
        });
    }
}

/** Produce semi-transparent coverage bitmap for one satellite */
export function rasteriseCoverage(ctx, w, h, { lat, lon, altitude }, colorRGB) {
    const cov = ctx.createImageData(w, h);
    const [sr, sg, sb] = colorRGB;
    const altM = altitude;
    const cosThresh = Math.cos(
        Math.acos(R_EARTH / (R_EARTH + altM))
    );
    const lat1 = deg2rad(lat);
    const lon1 = deg2rad(lon);
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);

    for (let y = 0; y < h; y++) {
        const lat2 = deg2rad(90 - (y * 180) / h);
        const sinLat2 = Math.sin(lat2);
        const cosLat2 = Math.cos(lat2);
        for (let x = 0; x < w; x++) {
            let dLon = Math.abs(
                deg2rad(180 - (x * 360) / w) - lon1
            );
            if (dLon > Math.PI) dLon = 2 * Math.PI - dLon;
            const cosC =
                sinLat1 * sinLat2 +
                cosLat1 * cosLat2 * Math.cos(dLon);
            if (cosC >= cosThresh) {
                const idx = (y * w + x) * 4;
                cov.data[idx] = sr;
                cov.data[idx + 1] = sg;
                cov.data[idx + 2] = sb;
                cov.data[idx + 3] = 68;
            }
        }
    }
    ctx.putImageData(cov, 0, 0);
} 