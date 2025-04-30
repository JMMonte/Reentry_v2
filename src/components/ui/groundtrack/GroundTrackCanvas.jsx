import React, { useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { drawPOI, rasteriseCoverage } from './utils';
import { projectWorldPosToCanvas, latLonToCanvas } from '../../../utils/MapProjection';
import { Constants } from '../../../utils/Constants';
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
        // Get current simulation time once per frame (fallback to real time)
        const currentEpochMillis = planet && planet.timeManager
            ? planet.timeManager.getSimulatedTime().getTime()
            : Date.now();
        // scale factor (meters → sim units)
        const k = Constants.metersToKm * Constants.scale;

        ctx.clearRect(0, 0, w, h);
        // draw equirectangular texture: prefer planet surface image, else offscreen map
        const imgSource = planet?.getSurfaceTexture?.() || map;
        if (imgSource instanceof HTMLImageElement || imgSource instanceof HTMLCanvasElement) {
            ctx.drawImage(imgSource, 0, 0, w, h);
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

        // Draw current satellite positions by projecting ECI→canvas
        Object.entries(tracksRef.current).forEach(([id, pts]) => {
            if (!pts?.length) return;
            const last = pts[pts.length - 1];
            if (!last.position || last.time === undefined) return;

            // Project last position to canvas (scale from meters to sim units)
            const simPos = new THREE.Vector3(
                last.position.x * k,
                last.position.y * k,
                last.position.z * k
            );
            const { x, y } = projectWorldPosToCanvas(
                simPos,
                planet,
                w,
                h,
                currentEpochMillis
            );
            const color = satsRef.current[id]?.color ?? 0xffffff;
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

                // Project position to canvas at point time (scale from meters to sim units)
                const simPosPt = new THREE.Vector3(
                    position.x * k,
                    position.y * k,
                    position.z * k
                );
                const { x: xpt, y: ypt, longitude: lon } = projectWorldPosToCanvas(
                    simPosPt,
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
                        ctx.beginPath();
                        ring.forEach(([lon, lat], i) => {
                            const { x, y } = latLonToCanvas(lat, lon, w, h);
                            if (i) ctx.lineTo(x, y);
                            else ctx.moveTo(x, y);
                        });
                        ctx.stroke();
                    });
                });
            });
            ctx.restore();
        };
        if (layers.countryBorders && planet?.surface?.countryGeo) drawBorders(planet.surface.countryGeo, 'rgba(255,255,255,0.3)');
        if (layers.states && planet?.surface?.stateGeo) drawBorders(planet.surface.stateGeo, 'rgba(255,255,255,0.5)');
    }, [map, width, height, layers, showCoverage, planet, poiData]);

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
        cities: PropTypes.bool.isRequired,
        airports: PropTypes.bool.isRequired,
        spaceports: PropTypes.bool.isRequired,
        groundStations: PropTypes.bool.isRequired,
        observatories: PropTypes.bool.isRequired,
        missions: PropTypes.bool.isRequired,
        countryBorders: PropTypes.bool.isRequired,
        states: PropTypes.bool.isRequired,
    }).isRequired,
    showCoverage: PropTypes.bool.isRequired,
    poiData: PropTypes.object,
}; 