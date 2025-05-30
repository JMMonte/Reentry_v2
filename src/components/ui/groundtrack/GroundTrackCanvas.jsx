import React, { useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { drawGrid, drawPOI, rasteriseCoverage } from './utils';
import { projectWorldPosToCanvas, latLonToCanvas } from '../../../utils/MapProjection';
import * as THREE from 'three';

const SAT_DOT_RADIUS = 4;

export default function GroundTrackCanvas({
    map,
    planet,
    width,
    height,
    satellites,
    tracks,
    layers,
    showCoverage,
    poiData,
    groundtracks = [],
}) {
    const canvasRef = useRef(null);
    const tracksRef = useRef(tracks);
    useEffect(() => { tracksRef.current = tracks; }, [tracks]);
    const satsRef = useRef(satellites);
    useEffect(() => { satsRef.current = satellites; }, [satellites]);

    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = width;
        const h = height;

        ctx.clearRect(0, 0, w, h);
        // draw equirectangular texture: prefer planet surface image, else offscreen map
        const imgSource = planet?.getSurfaceTexture?.() || map;
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

        if (showCoverage) {
            Object.values(satsRef.current).forEach(sat => {
                if (!planet || !sat.position) return;
                const color = sat.color ?? 0xffffff;
                rasteriseCoverage(
                    ctx,
                    w,
                    h,
                    { lat: sat.position.latitude, lon: sat.position.longitude, altitude: sat.position.altitude },
                    [
                        (color >> 16) & 0xff,
                        (color >> 8) & 0xff,
                        color & 0xff,
                    ],
                );
            });
        }

        // Draw current satellite positions using groundtracks (lat/lon)
        groundtracks.forEach(({ id, lat, lon }) => {
            const { x, y } = latLonToCanvas(lat, lon, width, height);
            const color = satellites?.[id]?.color ?? 0xffffff;
            ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
            ctx.beginPath();
            ctx.arc(x, y, SAT_DOT_RADIUS, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Draw ground-track polylines by projecting each ECI position to canvas
        Object.entries(tracksRef.current).forEach(([id, pts]) => {
            if (!pts?.length || !planet) return;
            const satColor = satsRef.current[id]?.color ?? 0xffffff;
            ctx.strokeStyle = `#${satColor.toString(16).padStart(6, '0')}`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            let prevLon;
            pts.forEach((pt, idx) => {
                if (!pt.position || pt.time === undefined) return; // Skip points without position or time

                // Parse time
                const { position, time } = pt;
                const epochMillis = typeof time === 'string' ? parseFloat(time) : time;
                if (isNaN(epochMillis) || !position) return;

                // Project position to canvas at point time (data from local physics engine, ECI in kilometers)
                const { x: xpt, y: ypt, longitude: lon } = projectWorldPosToCanvas(
                    new THREE.Vector3(
                        position.x,
                        position.y,
                        position.z
                    ),
                    planet,
                    w,
                    h,
                    epochMillis
                );

                if (idx === 0) {
                    ctx.moveTo(xpt, ypt);
                } else {
                    // Handle longitude wrap-around (-180 to 180)
                    const lonDiff = lon - prevLon;
                    if (Math.abs(lonDiff) > 180) {
                        // Determine wrap direction (e.g., 170 to -170 is > 180 positive difference)
                        // If crossing dateline eastwards (lon decreases drastically), move without line
                        // If crossing dateline westwards (lon increases drastically), move without line
                        ctx.moveTo(xpt, ypt);
                    } else {
                        ctx.lineTo(xpt, ypt);
                    }
                }
                prevLon = lon;
            });
            ctx.stroke();
        });

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

        // Borders
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
                            const { x, y } = latLonToCanvas(lat, lon, w, h);
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
        if (layers.countryBorders && planet?.surface?.countryGeo) drawBorders(planet.surface.countryGeo, 'rgba(255,255,255,0.3)');
        if (layers.states && planet?.surface?.stateGeo) drawBorders(planet.surface.stateGeo, 'rgba(255,255,255,0.5)');
    }, [map, width, height, layers, showCoverage, planet, poiData, groundtracks, satellites]);

    useEffect(() => {
        let raf;
        const loop = () => {
            drawFrame();
            raf = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(raf);
    }, [drawFrame]);

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
    planet: PropTypes.object,
    width: PropTypes.number.isRequired,
    height: PropTypes.number.isRequired,
    satellites: PropTypes.objectOf(
        PropTypes.shape({ color: PropTypes.number }).isRequired,
    ),
    tracks: PropTypes.objectOf(
        PropTypes.arrayOf(
            PropTypes.shape({
                time: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
                lat: PropTypes.number,
                lon: PropTypes.number,
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
        })
    ),
};

// Helper to normalize longitude to [-180, 180]
function normalizeLon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
} 