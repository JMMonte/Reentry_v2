import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { DraggableModal } from '../modal/DraggableModal';
import { earthTexture } from '../../../config/textures';
import { Button } from '../button';
import { Download, Eye, EyeOff, MapPin } from 'lucide-react';
import { Constants } from '../../../utils/Constants';
import citiesData from '../../../config/streamlined_cities.json';
import airportsData from '../../../config/ne_10m_airports.json';
import spaceportsData from '../../../config/spaceports.json';
import groundStationsData from '../../../config/ground_stations.json';
import observatoriesData from '../../../config/observatories.json';
import countryBordersData from '../../../config/ne_50m_admin_0_sovereignty.json';
import statesData from '../../../config/ne_110m_admin_1_states_provinces.json';

export function GroundtrackWindow({ isOpen, onClose, satellites }) {
    const canvasRef = useRef(null);
    const offscreenRef = useRef(null);
    const [tracks, setTracks] = useState({});
    const [currentPos, setCurrentPos] = useState({});
    const [showCoverage, setShowCoverage] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showCities, setShowCities] = useState(true);
    const [showAirports, setShowAirports] = useState(true);
    const [showSpaceports, setShowSpaceports] = useState(true);
    const [showGroundStations, setShowGroundStations] = useState(true);
    const [showObservatories, setShowObservatories] = useState(true);
    const [showCountryBorders, setShowCountryBorders] = useState(true);
    const [showStates, setShowStates] = useState(true);

    // Subscribe to groundTrackUpdated events when open
    useEffect(() => {
        if (!isOpen) {
            setTracks({}); // Clear tracks when closed
            return;
        }
        const handleUpdate = (e) => {
            const { id, points } = e.detail;
            setTracks(prev => ({ ...prev, [id]: points }));
        };
        document.addEventListener('groundTrackUpdated', handleUpdate);
        return () => document.removeEventListener('groundTrackUpdated', handleUpdate);
    }, [isOpen]);

    // Subscribe to simulationDataUpdate for live position dots
    useEffect(() => {
        const handleCurrent = (e) => {
            const { id, lat, lon, altitude } = e.detail;
            setCurrentPos(prev => ({ ...prev, [id]: { lat, lon, altitude } }));
        };
        document.addEventListener('simulationDataUpdate', handleCurrent);
        return () => document.removeEventListener('simulationDataUpdate', handleCurrent);
    }, []);

    // Prepare offscreen canvas with map once
    useEffect(() => {
        const offscreen = document.createElement('canvas');
        const img = new Image();
        img.src = earthTexture;
        img.onload = () => {
            offscreen.width = img.width;
            offscreen.height = img.height;
            const offCtx = offscreen.getContext('2d');
            offCtx.drawImage(img, 0, 0);
            offscreenRef.current = offscreen;
        };
    }, []);

    // Draw map and tracks from offscreen canvas
    useEffect(() => {
        if (!isOpen) return;
        const canvas = canvasRef.current;
        const offscreen = offscreenRef.current;
        if (!canvas || !offscreen) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        // draw cached map
        ctx.drawImage(offscreen, 0, 0, w, h);

        // draw latitude/longitude grid
        ctx.save();
        // longitude lines
        for (let lon = -180; lon <= 180; lon += 5) {
            const x = ((lon + 180) / 360) * w;
            if (lon === 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
            } else if (lon % 10 === 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.5;
            }
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        // latitude lines
        for (let lat = -90; lat <= 90; lat += 5) {
            const y = ((90 - lat) / 180) * h;
            if (lat === 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
            } else if (lat % 10 === 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.5;
            }
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        ctx.restore();

        // draw coverage areas via raytracing if toggled
        if (showCoverage) {
            const degToRad = d => d * Math.PI / 180;
            // create an offscreen canvas for coverage overlay
            const covCanvas = document.createElement('canvas');
            covCanvas.width = w;
            covCanvas.height = h;
            const covCtx = covCanvas.getContext('2d');
            Object.entries(currentPos).forEach(([id, pos]) => {
                // pos.altitude is already altitude above surface (km)
                const altitudeAboveKm = pos.altitude;
                const altitudeM = altitudeAboveKm * Constants.kmToMeters;
                const Re = Constants.earthRadius;
                const theta = Math.acos(Re / (Re + altitudeM));
                const cosThresh = Math.cos(theta);
                const lat1Rad = degToRad(pos.lat);
                const lon1Rad = degToRad(pos.lon);
                const sinLat1 = Math.sin(lat1Rad);
                const cosLat1 = Math.cos(lat1Rad);
                // prepare pixel buffer on offscreen
                const imageData = covCtx.createImageData(w, h);
                const data = imageData.data;
                // satellite color
                const rawColor = satellites[id]?.color ?? 0xFFFFFF;
                const sr = (rawColor >> 16) & 0xFF;
                const sg = (rawColor >> 8) & 0xFF;
                const sb = rawColor & 0xFF;
                // rasterize coverage onto imageData
                for (let py = 0; py < h; py++) {
                    const lat2Rad = degToRad(90 - (py * 180) / h);
                    const sinLat2 = Math.sin(lat2Rad);
                    const cosLat2 = Math.cos(lat2Rad);
                    for (let px = 0; px < w; px++) {
                        const lon2Rad = degToRad(180 - (px * 360) / w);
                        let dLon = Math.abs(lon2Rad - lon1Rad);
                        if (dLon > Math.PI) dLon = 2 * Math.PI - dLon;
                        const cosC = sinLat1 * sinLat2 + cosLat1 * cosLat2 * Math.cos(dLon);
                        if (cosC >= cosThresh) {
                            const idx = (py * w + px) * 4;
                            data[idx] = sr;
                            data[idx + 1] = sg;
                            data[idx + 2] = sb;
                            data[idx + 3] = 68;
                        }
                    }
                }
                // draw fuzzily blended coverage on top of map
                covCtx.putImageData(imageData, 0, 0);
                ctx.drawImage(covCanvas, 0, 0);
                covCtx.clearRect(0, 0, w, h);
            });
        }

        // draw each satellite track using its color
        Object.entries(tracks).forEach(([id, pts]) => {
            const satellite = satellites[id];
            const rawColor = satellite ? satellite.color : 0xFFFFFF;
            const colorHex = `#${(rawColor & 0xffffff).toString(16).padStart(6, '0')}`;
            if (pts.length < 2) return;
            ctx.beginPath();
            // Draw segments, breaking at dateline crossings
            for (let i = 0; i < pts.length; i++) {
                const pt = pts[i];
                const lon = pt.lon;
                const lat = pt.lat;
                // Invert x calculation to correct horizontal mirroring
                const x = ((-lon + 180) / 360) * w;
                const y = ((90 - lat) / 180) * h;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    const prevLon = pts[i - 1].lon;
                    const deltaLon = lon - prevLon;
                    if (Math.abs(deltaLon) > 180) {
                        // Crosses map edge: break path
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
            }
            ctx.strokeStyle = colorHex;
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        // Draw current position as a dot
        Object.entries(currentPos).forEach(([id, pos]) => {
            const satellite = satellites[id];
            const rawColor = satellite ? satellite.color : 0xFFFFFF;
            const colorHex = `#${(rawColor & 0xffffff).toString(16).padStart(6, '0')}`;
            const lon = pos.lon;
            const lat = pos.lat;
            const x = ((-lon + 180) / 360) * w;
            const y = ((90 - lat) / 180) * h;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = colorHex;
            ctx.fill();
        });

        // Draw points of interest based on toggles
        ctx.save();
        const drawPoi = (data, color, radius, toggle) => {
            if (!toggle) return;
            ctx.fillStyle = color;
            // handle GeoJSON FeatureCollections or simple arrays of {lat, lon}
            if (data && Array.isArray(data)) {
                data.forEach(item => {
                    const lon = item.lon;
                    const lat = item.lat;
                    // Map POI with standard equirectangular projection (no inversion)
                    const x = ((lon + 180) / 360) * w;
                    const y = ((90 - lat) / 180) * h;
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, 2 * Math.PI);
                    ctx.fill();
                });
            } else if (data && data.features) {
                data.features.forEach(feature => {
                    const coords = feature.geometry && feature.geometry.coordinates;
                    if (!coords) return;
                    const lon = coords[0];
                    const lat = coords[1];
                    // Map POI with standard equirectangular projection (no inversion)
                    const x = ((lon + 180) / 360) * w;
                    const y = ((90 - lat) / 180) * h;
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, 2 * Math.PI);
                    ctx.fill();
                });
            }
        };
        drawPoi(citiesData, '#00A5FF', 2, showCities);
        drawPoi(airportsData, '#FF0000', 2, showAirports);
        drawPoi(spaceportsData, '#FFD700', 2, showSpaceports);
        drawPoi(groundStationsData, '#00FF00', 2, showGroundStations);
        drawPoi(observatoriesData, '#FF00FF', 2, showObservatories);
        ctx.restore();

        // draw country borders if toggled
        if (showCountryBorders) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.5;
            countryBordersData.features.forEach(feature => {
                const coordsArr = feature.geometry.type === 'Polygon'
                    ? [feature.geometry.coordinates]
                    : feature.geometry.coordinates;
                coordsArr.forEach(polygon => {
                    polygon.forEach(ring => {
                        if (ring.length < 2) return;
                        ctx.beginPath();
                        ring.forEach(([lon, lat], idx) => {
                            const x = ((lon + 180) / 360) * w;
                            const y = ((90 - lat) / 180) * h;
                            idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                        });
                        ctx.stroke();
                    });
                });
            });
            ctx.restore();
        }
        // draw state borders if toggled
        if (showStates) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.5;
            statesData.features.forEach(feature => {
                const coordsArr = feature.geometry.type === 'Polygon'
                    ? [feature.geometry.coordinates]
                    : feature.geometry.coordinates;
                coordsArr.forEach(polygon => {
                    polygon.forEach(ring => {
                        if (ring.length < 2) return;
                        ctx.beginPath();
                        ring.forEach(([lon, lat], idx) => {
                            const x = ((lon + 180) / 360) * w;
                            const y = ((90 - lat) / 180) * h;
                            idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                        });
                        ctx.stroke();
                    });
                });
            });
            ctx.restore();
        }
    }, [tracks, isOpen, satellites, currentPos, showCoverage, showCities, showAirports, showSpaceports, showGroundStations, showObservatories, showCountryBorders, showStates]);

    // Handler to download current ground tracks (with timestamp) as CSV
    const handleDownloadCsv = () => {
        // Include time field for each groundtrack point
        let csv = 'satelliteId,time,lat,lon\n';
        Object.entries(tracks).forEach(([id, pts]) => {
            pts.forEach(pt => {
                // pt.time is the absolute timestamp (ms) from worker
                csv += `${id},${pt.time},${pt.lat},${pt.lon}\n`;
            });
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'groundtracks.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <DraggableModal
            title="Groundtrack"
            isOpen={isOpen}
            onClose={onClose}
            rightElement={
                <>
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleDownloadCsv}>
                        <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setShowCoverage(prev => !prev)}>
                        {showCoverage ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <div className="relative">
                        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setMenuOpen(prev => !prev)}>
                            <MapPin className="h-4 w-4" />
                        </Button>
                        {menuOpen && (
                            <div className="absolute right-0 mt-2 w-40 bg-background border rounded shadow-md p-2 space-y-1 z-10">
                                <label className="flex items-center gap-1 text-xs">
                                    <input type="checkbox" checked={showCities} onChange={() => setShowCities(prev => !prev)} /> Cities
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                    <input type="checkbox" checked={showAirports} onChange={() => setShowAirports(prev => !prev)} /> Airports
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                    <input type="checkbox" checked={showSpaceports} onChange={() => setShowSpaceports(prev => !prev)} /> Spaceports
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                    <input type="checkbox" checked={showGroundStations} onChange={() => setShowGroundStations(prev => !prev)} /> Ground Stations
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                    <input type="checkbox" checked={showObservatories} onChange={() => setShowObservatories(prev => !prev)} /> Observatories
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                    <input type="checkbox" checked={showCountryBorders} onChange={() => setShowCountryBorders(prev => !prev)} /> Country Borders
                                </label>
                                <label className="flex items-center gap-1 text-xs">
                                    <input type="checkbox" checked={showStates} onChange={() => setShowStates(prev => !prev)} /> States
                                </label>
                            </div>
                        )}
                    </div>
                </>
            }
            defaultWidth={500}
            defaultHeight={300}
            resizable={true}
            minWidth={300}
            minHeight={200}
        >
            <canvas
                ref={canvasRef}
                width={1024}
                height={512}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
        </DraggableModal>
    );
}

GroundtrackWindow.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    satellites: PropTypes.object.isRequired // Pass the satellites object for color lookup
}; 