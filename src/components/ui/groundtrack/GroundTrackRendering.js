import { GroundTrackService } from '@/services/GroundTrackService.js';

// Create a singleton instance
const groundTrackService = new GroundTrackService();
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
    let pathStarted = false;
    
    for (let i = 0; i < coordinates.length; i++) {
        const [lon, lat] = coordinates[i];
        const { x, y } = groundTrackService.projectToCanvas(lat, lon, w, h);
        
        // Calculate last point to finish line properly
        if (i > 0) {
            ctx.lineTo(x, y);
        } else {
            // First point
            ctx.moveTo(x, y);
            pathStarted = true;
        }
    }
    
    if (pathStarted) {
        ctx.stroke();
    }
}

/** 
 * Efficient scanline-based coverage rendering with dateline handling
 * Much faster than pixel-by-pixel approach - only processes affected scanlines
 * @param {Object} options - Additional rendering options
 * @param {boolean} options.gradient - Enable gradient falloff
 * @param {Array<number>} options.elevationAngles - Array of elevation angles for rings
 */
export function renderCoverageEfficient(ctx, w, h, { lat, lon, altitude }, color, opacity = 0.3, planetNaifId = 399, options = {}) {
    const { gradient = true, elevationAngles = null, planetData = null } = options;
    
    // Get coverage radius in degrees - synchronous calculation
    if (!planetData || !planetData.radius) {
        console.warn('renderCoverageEfficient: Planet data not provided');
        return;
    }
    
    const planetRadius = planetData.radius;
    const centralAngle = Math.acos(planetRadius / (planetRadius + altitude));
    const coverageRadiusDeg = centralAngle * (180 / Math.PI);
    
    // Project satellite position to canvas
    const satPos = groundTrackService.projectToCanvas(lat, lon, w, h);
    
    // Calculate pixel radius (approximate - accurate enough for visualization)
    // At equator: 360 degrees = w pixels, so radiusPixels = (coverageRadiusDeg / 360) * w
    const radiusPixelsX = (coverageRadiusDeg / 360) * w;
    const radiusPixelsY = (coverageRadiusDeg / 180) * h;
    
    ctx.save();
    
    // Always use gradient rendering which now handles edge wrapping
    if (elevationAngles) {
        renderElevationRings(ctx, satPos.x, satPos.y, radiusPixelsX, radiusPixelsY, color, elevationAngles, altitude, planetNaifId);
    } else if (gradient) {
        renderCoverageGradient(ctx, satPos.x, satPos.y, radiusPixelsX, radiusPixelsY, color, opacity, w);
    } else {
        // Fallback to pixel-based for complex cases (poles, etc)
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        if (Math.abs(lat) + coverageRadiusDeg > 90) {
            // Polar coverage
            renderCoverageWithWrapping(ctx, w, h, lat, lon, coverageRadiusDeg);
        } else {
            // Use gradient without gradient effect
            renderCoverageGradient(ctx, satPos.x, satPos.y, radiusPixelsX, radiusPixelsY, color, opacity, w);
        }
    }
    
    ctx.restore();
}

/** Handle coverage that wraps around map edges */
function renderCoverageWithWrapping(ctx, w, h, lat, lon, coverageRadiusDeg) {
    // Create off-screen canvas for wrapped coverage
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Use existing pixel-by-pixel for edge cases (more accurate for wrapping)
    // But limit to affected region for performance
    const minLat = Math.max(-90, lat - coverageRadiusDeg);
    const maxLat = Math.min(90, lat + coverageRadiusDeg);
    
    const minY = Math.floor(((90 - maxLat) / 180) * h);
    const maxY = Math.ceil(((90 - minLat) / 180) * h);
    
    // Only process affected scanlines
    const imageData = tempCtx.createImageData(w, maxY - minY);
    const data = imageData.data;
    
    const cosThresh = Math.cos(deg2rad(coverageRadiusDeg));
    const lat1 = deg2rad(lat);
    const lon1 = deg2rad(lon);
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    
    for (let y = 0; y < (maxY - minY); y++) {
        const actualY = y + minY;
        const lat2 = deg2rad(90 - (actualY * 180) / h);
        const sinLat2 = Math.sin(lat2);
        const cosLat2 = Math.cos(lat2);
        
        for (let x = 0; x < w; x++) {
            const lon2 = deg2rad(-180 + (x * 360) / w);
            let dLon = Math.abs(lon2 - lon1);
            if (dLon > Math.PI) dLon = 2 * Math.PI - dLon;
            
            const cosC = sinLat1 * sinLat2 + cosLat1 * cosLat2 * Math.cos(dLon);
            
            if (cosC >= cosThresh) {
                const idx = (y * w + x) * 4;
                // Use semi-transparent white, will be tinted by fillStyle
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
                data[idx + 3] = 255;
            }
        }
    }
    
    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, minY, w, maxY - minY, 0, minY, w, maxY - minY);
}

/** Render coverage with gradient falloff for signal strength visualization */
function renderCoverageGradient(ctx, centerX, centerY, radiusX, radiusY, color, maxOpacity, w) {
    // Check if coverage crosses the map edge
    const leftEdge = centerX - radiusX;
    const rightEdge = centerX + radiusX;
    
    // Parse color for gradient
    const colorMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    const [r, g, b] = colorMatch ? colorMatch.slice(1) : [255, 255, 255];
    
    // Helper function to draw a single coverage circle with gradient
    const drawCoverageCircle = (x, y) => {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(radiusX, radiusY));
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${maxOpacity})`);
        gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${maxOpacity * 0.7})`);
        gradient.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, ${maxOpacity * 0.3})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(x, y, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.fill();
    };
    
    // Draw main coverage circle
    drawCoverageCircle(centerX, centerY);
    
    // Handle edge wrapping
    if (leftEdge < 0) {
        // Coverage extends past left edge, draw wrapped portion on right
        drawCoverageCircle(centerX + w, centerY);
    }
    if (rightEdge > w) {
        // Coverage extends past right edge, draw wrapped portion on left
        drawCoverageCircle(centerX - w, centerY);
    }
}

/** Render multiple elevation angle rings */
async function renderElevationRings(ctx, centerX, centerY, maxRadiusX, maxRadiusY, color, elevationAngles, altitude, planetNaifId) { // eslint-disable-line no-unused-vars
    // Note: altitude and planetNaifId parameters kept for API compatibility but not currently used
    // Sort elevation angles from largest to smallest
    const angles = [...elevationAngles].sort((a, b) => b - a);
    
    // Calculate radius for each elevation angle
    for (let i = 0; i < angles.length; i++) {
        const elevAngle = angles[i];
        
        // Calculate coverage radius for this elevation angle
        // This is a simplified calculation - you may want to use more accurate formula
        const factor = Math.cos(deg2rad(elevAngle));
        const radiusX = maxRadiusX * factor;
        const radiusY = maxRadiusY * factor;
        
        // Render with decreasing opacity
        const opacity = 0.2 - (i * 0.05);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add ring outline
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

/** Legacy pixel-by-pixel coverage for compatibility */
export function rasteriseCoverage(ctx, w, h, { lat, lon, altitude }, colorRGB, planetNaifId = 399, planetData = null) {
    // Convert RGB array to hex color
    const color = `rgb(${colorRGB[0]}, ${colorRGB[1]}, ${colorRGB[2]})`;
    
    // Use new efficient renderer with gradient by default
    renderCoverageEfficient(ctx, w, h, { lat, lon, altitude }, color, 0.267, planetNaifId, { gradient: true, planetData });
} 