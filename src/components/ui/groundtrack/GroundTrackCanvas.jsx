import React, { useRef, useEffect, useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { drawGrid, drawPOI, rasteriseCoverage } from './GroundTrackRendering';
import { groundTrackService } from '../../../services/GroundTrackService';

const SAT_DOT_RADIUS = 4;

export default function GroundTrackCanvas({
    map,
    planetNaifId,
    width,
    height,
    satellites,
    tracks,
    layers,
    showCoverage,
    poiData,
    groundtracks = []
}) {
    const canvasRef = useRef(null);
    const tracksRef = useRef(tracks);
    const satsRef = useRef(satellites);
    const [processedTracks, setProcessedTracks] = useState({});
    const frameRef = useRef(null);
    const lastRenderRef = useRef({});
    const needsRedrawRef = useRef(true);
    
    // Check if render parameters have changed
    const checkNeedsRedraw = useCallback(() => {
        const current = {
            map,
            planetNaifId,
            layers: JSON.stringify(layers),
            showCoverage,
            groundtracks: JSON.stringify(groundtracks),
            processedTracks: JSON.stringify(Object.keys(processedTracks))
        };
        
        const hasChanged = Object.keys(current).some(key => 
            current[key] !== lastRenderRef.current[key]
        );
        
        if (hasChanged) {
            lastRenderRef.current = current;
            needsRedrawRef.current = true;
        }
        
        return hasChanged;
    }, [map, planetNaifId, layers, showCoverage, groundtracks, processedTracks]);
    
    useEffect(() => { tracksRef.current = tracks; }, [tracks]);
    useEffect(() => { satsRef.current = satellites; }, [satellites]);

    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = width;
        const h = height;

        ctx.clearRect(0, 0, w, h);
        
        // draw equirectangular texture from map source
        const imgSource = map;
        if (
            (imgSource instanceof HTMLImageElement && imgSource.complete && imgSource.naturalWidth > 0) ||
            imgSource instanceof HTMLCanvasElement
        ) {
            ctx.drawImage(imgSource, 0, 0, w, h);
            // Only draw grid if enabled
            if (layers.grid) drawGrid(ctx, w, h);
        }
        // If no texture, still draw grid if enabled
        if (!(imgSource instanceof HTMLImageElement || imgSource instanceof HTMLCanvasElement)) {
            if (layers.grid) drawGrid(ctx, w, h);
        }

        if (showCoverage && groundtracks.length && planetNaifId) {
            // Render coverage asynchronously to avoid blocking
            groundtracks.forEach(async ({ id, lat, lon, alt }) => {
                const sat = satsRef.current[id];
                if (!sat) return;
                const color = sat.color ?? 0xffffff;
                await rasteriseCoverage(
                    ctx,
                    w,
                    h,
                    { lat, lon, altitude: alt },
                    [
                        (color >> 16) & 0xff,
                        (color >> 8) & 0xff,
                        color & 0xff,
                    ],
                    planetNaifId
                );
            });
        }

        // Draw current satellite positions using groundtracks (lat/lon)
        groundtracks.forEach(({ id, lat, lon }) => {
            // Use existing GroundTrackService for consistent coordinate projection
            const { x, y } = groundTrackService.projectToCanvas(lat, lon, width, height);
            const color = satellites?.[id]?.color ?? 0xffffff;
            ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
            ctx.beginPath();
            ctx.arc(x, y, SAT_DOT_RADIUS, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Draw ground-track polylines with viewport culling and LOD
        Object.entries(processedTracks).forEach(([id, processedPts]) => {
            if (!processedPts?.length) return;
            const satColor = satsRef.current[id]?.color ?? 0xffffff;
            ctx.strokeStyle = `#${satColor.toString(16).padStart(6, '0')}`;
            ctx.lineWidth = 1;
            
            // Implement LOD based on number of points
            const lodStep = processedPts.length > 1000 ? Math.ceil(processedPts.length / 500) : 1;
            
            ctx.beginPath();
            let lastDrawnPt = null;
            let segmentStarted = false;
            
            for (let i = 0; i < processedPts.length; i += lodStep) {
                const pt = processedPts[i];
                
                // Viewport culling - check if point is visible
                const isVisible = pt.x >= -10 && pt.x <= width + 10 && 
                                pt.y >= -10 && pt.y <= height + 10;
                
                if (isVisible || (lastDrawnPt && isLineIntersectsViewport(lastDrawnPt, pt, width, height))) {
                    if (!segmentStarted || pt.isDatelineCrossing) {
                        ctx.moveTo(pt.x, pt.y);
                        segmentStarted = true;
                    } else {
                        ctx.lineTo(pt.x, pt.y);
                    }
                    lastDrawnPt = pt;
                } else if (segmentStarted) {
                    // End current segment when going out of viewport
                    segmentStarted = false;
                }
            }
            ctx.stroke();
        });
        
        // Helper function for viewport intersection
        function isLineIntersectsViewport(pt1, pt2, w, h) {
            // Simple bounding box check for line-viewport intersection
            const minX = Math.min(pt1.x, pt2.x);
            const maxX = Math.max(pt1.x, pt2.x);
            const minY = Math.min(pt1.y, pt2.y);
            const maxY = Math.max(pt1.y, pt2.y);
            
            return !(maxX < 0 || minX > w || maxY < 0 || minY > h);
        }

        // POI layers from dynamic data
        if (layers.pois) {
            const poiCategories = [
                { key: 'cities', color: '#00A5FF' },
                { key: 'airports', color: '#FF0000' },
                { key: 'spaceports', color: '#FFD700' },
                { key: 'groundStations', color: '#00FF00' },
                { key: 'observatories', color: '#FF00FF' },
                { key: 'missions', color: '#FFFF00' }
            ];
            poiCategories.forEach(({ key, color }) => {
                const data = poiData?.[key] || [];
                if (layers[key] && data.length) {
                    drawPOI(ctx, data, w, h, color, 2);
                }
            });
        }

        // Borders - now handled by parent component through map data
        /* eslint-disable-next-line no-unused-vars */
        const drawBorders = (data, style) => {
            ctx.save();
            ctx.strokeStyle = style;
            ctx.lineWidth = 0.5;
            data.features.forEach(f => {
                const polys =
                    f.geometry.type === 'Polygon'
                        ? [f.geometry.coordinates]
                        : f.geometry.coordinates;
                polys.forEach(poly => {
                    poly.forEach(ring => {
                        // Skip degenerate rings (all lat or all lon the same)
                        const lats = ring.map(([, lat]) => lat);
                        const lons = ring.map(([lon]) => lon);
                        const allSameLat = lats.every(lat => lat === lats[0]);
                        const allSameLon = lons.every(lon => lon === lons[0]);
                        if (allSameLat || allSameLon) return; // skip flat lines
                        ctx.beginPath();
                        let prevLon;
                        ring.forEach(([lon, lat], i) => {
                            lon = normalizeLon(lon);
                            // Use existing GroundTrackService for consistent coordinate projection
                            const { x, y } = groundTrackService.projectToCanvas(lat, lon, w, h);
                            if (i) {
                                if (prevLon !== undefined && Math.abs(lon - prevLon) > 180) {
                                    ctx.moveTo(x, y);
                                } else {
                                    ctx.lineTo(x, y);
                                }
                            } else {
                                ctx.moveTo(x, y);
                            }
                            prevLon = lon;
                        });
                        ctx.stroke();
                    });
                });
            });
            ctx.restore();
        };
        
        // Border rendering - placeholder for future implementation
        // if (layers.countryBorders && countryGeoData) drawBorders(countryGeoData, 'rgba(255,255,255,0.3)');
        // if (layers.states && stateGeoData) drawBorders(stateGeoData, 'rgba(255,255,255,0.5)');
    }, [map, width, height, layers, showCoverage, poiData, groundtracks, satellites, processedTracks, planetNaifId]);

    // Process tracks - now handling pre-processed data from worker
    useEffect(() => {
        if (!planetNaifId || !Object.keys(tracksRef.current).length) {
            setProcessedTracks({});
            return;
        }

        const processAllTracks = async () => {
            const processed = {};
            
            for (const [id, rawPoints] of Object.entries(tracksRef.current)) {
                if (rawPoints?.length) {
                    // Check if points are already processed (have lat/lon)
                    if (rawPoints[0].lat !== undefined && rawPoints[0].lon !== undefined) {
                        // Points are pre-processed from worker
                        processed[id] = rawPoints.map(pt => {
                            // Use pre-computed coordinates if available, otherwise use service
                            let x = pt.x, y = pt.y;
                            if (x === undefined || y === undefined) {
                                const canvas = groundTrackService.projectToCanvas(pt.lat, pt.lon, width, height);
                                x = canvas.x;
                                y = canvas.y;
                            }
                            return {
                                x,
                                y,
                                lat: pt.lat,
                                lon: pt.lon,
                                alt: pt.alt,
                                time: pt.time,
                                isDatelineCrossing: pt.isDatelineCrossing
                            };
                        });
                    } else {
                        // Fallback: process ECI coordinates (legacy support)
                        processed[id] = await groundTrackService.processGroundTrack(
                            rawPoints, planetNaifId, width, height
                        );
                    }
                }
            }
            
            setProcessedTracks(processed);
            needsRedrawRef.current = true;
        };

        processAllTracks();
    }, [tracks, planetNaifId, width, height]);

    // Optimized render loop with dirty checking
    useEffect(() => {
        const loop = () => {
            // Only redraw if something has changed
            if (needsRedrawRef.current || checkNeedsRedraw()) {
                drawFrame();
                needsRedrawRef.current = false;
            }
            frameRef.current = requestAnimationFrame(loop);
        };
        loop();
        return () => {
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [drawFrame, checkNeedsRedraw]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ width: '100%', height: '100%', display: 'block' }}
        />
    );
}

GroundTrackCanvas.propTypes = {
    map: PropTypes.object,
    planetNaifId: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    satellites: PropTypes.objectOf(
        PropTypes.shape({ color: PropTypes.number }).isRequired,
    ),
    tracks: PropTypes.objectOf(
        PropTypes.arrayOf(
            PropTypes.shape({
                time: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
                position: PropTypes.shape({
                    x: PropTypes.number,
                    y: PropTypes.number,
                    z: PropTypes.number,
                }),
            }),
        ),
    ).isRequired,
    layers: PropTypes.shape({
        grid: PropTypes.bool.isRequired,
        cities: PropTypes.bool.isRequired,
        airports: PropTypes.bool.isRequired,
        spaceports: PropTypes.bool.isRequired,
        groundStations: PropTypes.bool.isRequired,
        observatories: PropTypes.bool.isRequired,
        missions: PropTypes.bool.isRequired,
        countryBorders: PropTypes.bool.isRequired,
        states: PropTypes.bool.isRequired,
        pois: PropTypes.bool.isRequired,
    }).isRequired,
    showCoverage: PropTypes.bool.isRequired,
    poiData: PropTypes.object,
    groundtracks: PropTypes.arrayOf(
        PropTypes.shape({
            id: PropTypes.string.isRequired,
            lat: PropTypes.number.isRequired,
            lon: PropTypes.number.isRequired,
            alt: PropTypes.number,
        })
    ),
    currentTime: PropTypes.number,
};

// Helper to normalize longitude to [-180, 180]
function normalizeLon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
}