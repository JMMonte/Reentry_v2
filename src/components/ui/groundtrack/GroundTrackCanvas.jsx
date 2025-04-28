import React, { useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { drawGrid, drawPOI, rasteriseCoverage } from './utils';
import { projectWorldPosToCanvas, latLonToCanvas } from '../../../utils/MapProjection';
import { Constants } from '../../../utils/Constants';
import * as THREE from 'three';
import { PhysicsUtils } from '../../../utils/PhysicsUtils';

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
    const scratch = new THREE.Vector3();

    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = width;
        const h = height;

        // DEBUG: Inspect map/texture and poiData
        console.log('[GroundTrackCanvas] drawFrame start, planet:', planet?.name);
        console.log('[GroundTrackCanvas] map(offscreen):', map, 'texture image:', planet?.getMesh?.()?.material?.map?.image);
        console.log('[GroundTrackCanvas] poiData prop:', poiData);

        ctx.clearRect(0, 0, w, h);
        // draw equirectangular texture: offscreen map or live mesh material
        const imgSource = map || planet?.getMesh?.()?.material?.map?.image;
        if (imgSource instanceof HTMLImageElement || imgSource instanceof HTMLCanvasElement) {
            ctx.drawImage(imgSource, 0, 0, w, h);
        }
        drawGrid(ctx, w, h);

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

        // Draw current satellite positions, using Earth-specific ECI→ECEF for Earth
        const k = Constants.metersToKm * Constants.scale;
        Object.entries(tracksRef.current).forEach(([id, pts]) => {
            if (!pts?.length) return;
            const last = pts[pts.length - 1];
            const p = last.position;
            // from raw ECI meters to world units
            scratch.set(p.x * k, p.y * k, p.z * k);
            let x, y;
            if (planet.name === 'earth') {
                // rotate ECI into ECEF using -GMST for correct direction
                const gmst = PhysicsUtils.calculateGMST(last.time);
                const ecef = PhysicsUtils.eciToEcef(scratch, gmst);
                const { latitude, longitude } = PhysicsUtils.cartesianToGeodetic(ecef.x, ecef.y, ecef.z);
                ({ x, y } = latLonToCanvas(latitude, longitude, w, h));
            } else {
                // other bodies: use world->canvas conversion
                ({ x, y } = projectWorldPosToCanvas(scratch, planet, w, h));
            }
            const color = satsRef.current[id]?.color ?? 0xffffff;
            ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
            ctx.beginPath();
            ctx.arc(x, y, SAT_DOT_RADIUS, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Draw ground-track polylines by projecting each ECI point
        Object.entries(tracksRef.current).forEach(([id, pts]) => {
            if (!pts?.length) return;
            const satColor = satsRef.current[id]?.color ?? 0xffffff;
            ctx.strokeStyle = `#${satColor.toString(16).padStart(6, '0')}`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            let prevLon;
            pts.forEach((pt, idx) => {
                const p = pt.position;
                scratch.set(p.x * k, p.y * k, p.z * k);
                let lon, xpt, ypt;
                if (planet.name === 'earth') {
                    // rotate ECI into ECEF using -GMST for correct direction
                    const gmst = PhysicsUtils.calculateGMST(pt.time);
                    const ecef = PhysicsUtils.eciToEcef(scratch, gmst);
                    const geo = PhysicsUtils.cartesianToGeodetic(ecef.x, ecef.y, ecef.z);
                    lon = geo.longitude;
                    ({ x: xpt, y: ypt } = latLonToCanvas(geo.latitude, geo.longitude, w, h));
                } else {
                    const res = projectWorldPosToCanvas(scratch, planet, w, h);
                    lon = res.longitude;
                    xpt = res.x;
                    ypt = res.y;
                }
                if (idx === 0) ctx.moveTo(xpt, ypt);
                else if (Math.abs(lon - prevLon) > 180) ctx.moveTo(xpt, ypt);
                else ctx.lineTo(xpt, ypt);
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
                        ring.forEach((coord, i) => {
                            const lon = coord[0];
                            const lat = coord[1];
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