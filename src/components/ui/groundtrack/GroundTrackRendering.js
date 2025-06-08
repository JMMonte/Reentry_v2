import { groundTrackService } from '../../../services/GroundTrackService.js';
const GRID_MAJOR = 10;
const GRID_MINOR = 5;

/** Convert degrees to radians */
export const deg2rad = d => (d * Math.PI) / 180;

/** Draw a world-size lat/lon grid */
export function drawGrid(ctx, w, h) {
    ctx.save();
    for (let lon = -180; lon <= 180; lon += GRID_MINOR) {
        // Use existing GroundTrackService for consistent coordinate projection
        const { x } = groundTrackService.projectToCanvas(0, lon, w, h);
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
        // Use existing GroundTrackService for consistent coordinate projection
        const { y } = groundTrackService.projectToCanvas(lat, 0, w, h);
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
        // Use existing GroundTrackService for consistent coordinate projection
        const { x, y } = groundTrackService.projectToCanvas(lat, lon, w, h);
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

/** Draw GeoJSON features as lines (for country borders, state boundaries, etc.) */
export function drawGeoJSONLines(ctx, geoJsonData, w, h, color, lineWidth = 1) {
    if (!geoJsonData || !geoJsonData.features) return;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = 0.6;
    
    geoJsonData.features.forEach(feature => {
        if (!feature.geometry) return;
        
        const { type, coordinates } = feature.geometry;
        
        if (type === 'LineString') {
            drawLineString(ctx, coordinates, w, h);
        } else if (type === 'MultiLineString') {
            coordinates.forEach(lineString => {
                drawLineString(ctx, lineString, w, h);
            });
        } else if (type === 'Polygon') {
            coordinates.forEach(ring => {
                drawLineString(ctx, ring, w, h);
            });
        } else if (type === 'MultiPolygon') {
            coordinates.forEach(polygon => {
                polygon.forEach(ring => {
                    drawLineString(ctx, ring, w, h);
                });
            });
        }
    });
    
    ctx.globalAlpha = 1.0;
}

/** Helper function to draw a single line string */
function drawLineString(ctx, coordinates, w, h) {
    if (!coordinates || coordinates.length < 2) return;
    
    ctx.beginPath();
    let lastX = null;
    let lastY = null;
    let pathStarted = false;
    
    for (let i = 0; i < coordinates.length; i++) {
        const [lon, lat] = coordinates[i];
        const { x, y } = groundTrackService.projectToCanvas(lat, lon, w, h);
        
        // Check if we should break the path
        if (lastX !== null) {
            const xDiff = Math.abs(x - lastX);
            // If x coordinate jumps more than half the map width, it's a date line crossing
            if (xDiff > w / 2) {
                // Don't draw this segment - start a new path
                ctx.stroke(); // Finish current path
                ctx.beginPath(); // Start new path
                ctx.moveTo(x, y);
                pathStarted = true;
            } else {
                // Normal segment
                ctx.lineTo(x, y);
            }
        } else {
            // First point
            ctx.moveTo(x, y);
            pathStarted = true;
        }
        
        lastX = x;
        lastY = y;
    }
    
    if (pathStarted) {
        ctx.stroke();
    }
}



/** Produce semi-transparent coverage bitmap for one satellite */
export async function rasteriseCoverage(ctx, w, h, { lat, lon, altitude }, colorRGB, planetNaifId = 399) {
    const cov = ctx.createImageData(w, h);
    const [sr, sg, sb] = colorRGB;
    
    // Use existing GroundTrackService for coverage radius calculation
    const coverageRadiusDeg = await groundTrackService.calculateCoverageRadius(
        { lat, lon, alt: altitude }, 
        planetNaifId
    );
    
    // Convert coverage radius to threshold for great circle distance calculation
    const cosThresh = Math.cos(deg2rad(coverageRadiusDeg));
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