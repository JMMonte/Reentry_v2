import React, { useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { drawGrid, drawPOI, rasteriseCoverage } from './utils';
import { latLonToCanvas } from '../../../utils/MapProjection';
import cities from '../../../config/streamlined_cities.json';
import airports from '../../../config/ne_10m_airports.json';
import spaceports from '../../../config/spaceports.json';
import groundStations from '../../../config/ground_stations.json';
import observatories from '../../../config/observatories.json';
import missions from '../../../config/lunar_missions.json';
import countryBorders from '../../../config/ne_50m_admin_0_sovereignty.json';
import states from '../../../config/ne_110m_admin_1_states_provinces.json';
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
}) {
    const canvasRef = useRef(null);

    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !map) return;
        const ctx = canvas.getContext('2d');
        const w = width;
        const h = height;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(map, 0, 0, w, h);
        drawGrid(ctx, w, h);

        if (showCoverage) {
            // Recompute geodetic per satellite to account for tilt
            Object.values(satellites).forEach(sat => {
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

        // Draw tracks
        Object.entries(tracks).forEach(([id, pts]) => {
            if (!pts?.length) return;
            const satColor = satellites[id]?.color ?? 0xffffff;
            const hex = `#${satColor.toString(16).padStart(6, '0')}`;
            ctx.strokeStyle = hex;
            ctx.lineWidth = 1;
            ctx.beginPath();
            let prevLon = pts[0].lon;
            pts.forEach(({ lat, lon }, idx) => {
                const x = ((lon + 180) / 360) * w;
                const y = ((90 - lat) / 180) * h;
                if (idx && Math.abs(lon - prevLon) > 180) {
                    ctx.moveTo(x, y);
                } else if (idx) {
                    ctx.lineTo(x, y);
                } else {
                    ctx.moveTo(x, y);
                }
                prevLon = lon;
            });
            ctx.stroke();
        });

        // Draw current satellite positions via ECI->equatorial->ECEF->geodetic
        const nowMs = Date.now();
        const gmst = PhysicsUtils.calculateGMST(nowMs);
        Object.values(satellites).forEach(sat => {
            const eci = sat.position.clone();
            if (!eci) return;
            // Ecliptic ECI -> Equatorial ECI
            const eq = PhysicsUtils.eciEclipticToEquatorial(eci);
            // Equatorial ECI -> Earth-fixed ECEF
            const ecef = PhysicsUtils.eciToEcef(eq, gmst);
            // ECEF -> Geodetic lat/lon
            const { latitude, longitude } = PhysicsUtils.ecefToGeodetic(
                ecef.x, ecef.y, ecef.z
            );
            // Project to canvas pixels
            const { x, y } = latLonToCanvas(latitude, longitude, w, h);
            const color = sat.color ?? 0xffffff;
            ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
            ctx.beginPath();
            ctx.arc(x, y, SAT_DOT_RADIUS, 0, 2 * Math.PI);
            ctx.fill();
        });

        // POI layers
        if (layers.cities) drawPOI(ctx, cities, w, h, '#00A5FF', 2);
        if (layers.airports) drawPOI(ctx, airports, w, h, '#FF0000', 2);
        if (layers.spaceports) drawPOI(ctx, spaceports, w, h, '#FFD700', 2);
        if (layers.groundStations) drawPOI(ctx, groundStations, w, h, '#00FF00', 2);
        if (layers.observatories) drawPOI(ctx, observatories, w, h, '#FF00FF', 2);
        if (layers.missions) drawPOI(ctx, missions, w, h, '#FFFF00', 2);

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
                polys.forEach(poly =>
                    poly.forEach(ring => {
                        ctx.beginPath();
                        ring.forEach(([lon, lat], i) => {
                            const x = ((lon + 180) / 360) * w;
                            const y = ((90 - lat) / 180) * h;
                            if (i) ctx.lineTo(x, y);
                            else ctx.moveTo(x, y);
                        });
                        ctx.stroke();
                    }),
                );
            });
            ctx.restore();
        };
        if (layers.countryBorders) drawBorders(countryBorders, 'rgba(255,255,255,0.3)');
        if (layers.states) drawBorders(states, 'rgba(255,255,255,0.5)');
    }, [map, width, height, satellites, tracks, layers, showCoverage, planet]);

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
}; 