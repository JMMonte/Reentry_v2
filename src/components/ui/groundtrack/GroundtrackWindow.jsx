// GroundTrackWindow.jsx
import React, {
    useEffect,
    useRef,
    useReducer,
    useState,
    useMemo,
} from 'react';
import PropTypes from 'prop-types';
import { DraggableModal } from '../modal/DraggableModal';
import { usePlanetList } from './hooks';
import GroundTrackCanvas from './GroundTrackCanvas.jsx';
import GroundTrackControls from './GroundTrackControls.jsx';
import { projectToGeodetic } from '../../../utils/MapProjection';
import { Constants } from '../../../utils/Constants';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Layers state machine
const initialLayers = {
    grid: true, // toggle latitude/longitude grid
    cities: true,
    airports: true,
    spaceports: true,
    groundStations: true,
    observatories: true,
    missions: true,
    countryBorders: true,
    states: true,
};

function layersReducer(state, action) {
    switch (action.type) {
        case 'TOGGLE':
            return { ...state, [action.key]: !state[action.key] };
        case 'SET':
            return { ...state, ...action.payload };
        default:
            return state;
    }
}

// ---------------------------------------------------------------------------
// Main component
export function GroundTrackWindow({
    isOpen,
    onClose,
    satellites,
    planets,
}) {
    const [offscreenCanvas, setOffscreenCanvas] = useState(null);
    const [tracks, setTracks] = useState({});
    // refs to batch updates
    const pendingTracksRef = useRef({});
    const flushTracksScheduledRef = useRef(false);
    const [selectedPlanet, setSelectedPlanet] = useState(0);
    const [layers, dispatchLayers] = useReducer(layersReducer, initialLayers);
    const [showCoverage, setShowCoverage] = useState(false);

    const planetList = usePlanetList(planets);
    const planet = planetList[selectedPlanet];

    // Prepare POI data from the planet's surface for canvas rendering
    const poiData = useMemo(() => {
        if (!planet?.surface) return {};
        return Object.entries(planet.surface.points).reduce((acc, [key, meshes]) => {
            acc[key] = meshes.map(mesh => {
                const feat = mesh.userData.feature;
                const [lon, lat] = feat.geometry.coordinates;
                return { lon, lat };
            });
            return acc;
        }, {});
    }, [planet]);

    // Clamp planet index if list changes
    useEffect(() => {
        if (
            selectedPlanet >= planetList.length &&
            planetList.length
        )
            setSelectedPlanet(0);
    }, [planetList.length, selectedPlanet]);

    // Hook: subscribe to groundTrackUpdated
    useEffect(() => {
        if (!isOpen) {
            setTracks({});
            return;
        }
        // reset batching state when opened
        pendingTracksRef.current = {};
        flushTracksScheduledRef.current = false;
        const handler = e => {
            const { id, points } = e.detail;
            pendingTracksRef.current[id] = points;
            if (!flushTracksScheduledRef.current) {
                flushTracksScheduledRef.current = true;
                requestAnimationFrame(() => {
                    setTracks(prev => {
                        const newTracks = { ...prev };
                        Object.entries(pendingTracksRef.current).forEach(([tid, pts]) => {
                            newTracks[tid] = pts;
                        });
                        return newTracks;
                    });
                    pendingTracksRef.current = {};
                    flushTracksScheduledRef.current = false;
                });
            }
        };
        document.addEventListener('groundTrackUpdated', handler);
        // also handle incremental chunk streaming
        const chunkHandler = e => {
            const { id, points } = e.detail;
            setTracks(prev => ({
                ...prev,
                [id]: prev[id] ? [...prev[id], ...points] : [...points]
            }));
        };
        document.addEventListener('groundTrackChunk', chunkHandler);
        return () => {
            document.removeEventListener('groundTrackUpdated', handler);
            document.removeEventListener('groundTrackChunk', chunkHandler);
        };
    }, [isOpen]);

    // Hook: cache planet surface to offscreen canvas
    useEffect(() => {
        if (!planet) return;
        // getSurfaceTexture now returns the raw image (HTMLImageElement or Canvas)
        const img = planet.getSurfaceTexture?.();

        function draw(source) {
            const off = document.createElement('canvas');
            off.width = source.width;
            off.height = source.height;
            off.getContext('2d').drawImage(source, 0, 0);
            setOffscreenCanvas(off);
        }

        if (img instanceof HTMLImageElement) {
            // image may still be loading
            img.complete ? draw(img) : (img.onload = () => draw(img));
        } else if (img instanceof HTMLCanvasElement) {
            draw(img);
        }
    }, [planet]);

    // Reset layer toggles when planet changes based on planet.config.surfaceOptions
    useEffect(() => {
        const cfg = planet?.config?.surfaceOptions || {};
        const payload = {
            cities: !!cfg.addCities,
            airports: !!cfg.addAirports,
            spaceports: !!cfg.addSpaceports,
            groundStations: !!cfg.addGroundStations,
            observatories: !!cfg.addObservatories,
            missions: !!cfg.addMissions,
            countryBorders: !!cfg.addCountryBorders,
            states: !!cfg.addStates,
        };
        dispatchLayers({ type: 'SET', payload });
    }, [planet]);

    // CSV download: convert raw ECI positions to lat/lon per selected planet
    const downloadCsv = () => {
        const rows = [['satelliteId', 'time', 'lat', 'lon']];
        const k = Constants.metersToKm * Constants.scale;
        for (const [id, pts] of Object.entries(tracks)) {
            pts.forEach(pt => {
                const { time, position } = pt;
                const scratch = new THREE.Vector3(
                    position.x * k,
                    position.y * k,
                    position.z * k
                );
                const { latitude, longitude } = projectToGeodetic(scratch, planet);
                rows.push([id, time, latitude, longitude]);
            });
        }
        const blob = new Blob(
            [rows.map(r => r.join(',')).join('\n')],
            { type: 'text/csv;charset=utf-8;' },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'groundtracks.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    // -----------------------------------------------------------------------
    // Render
    return (
        <DraggableModal
            title="Ground-track"
            isOpen={isOpen}
            onClose={onClose}
            rightElement={
                <GroundTrackControls
                    onDownloadCsv={downloadCsv}
                    planetList={planetList}
                    selectedPlanet={selectedPlanet}
                    setSelectedPlanet={setSelectedPlanet}
                    planet={planet}
                    showCoverage={showCoverage}
                    setShowCoverage={setShowCoverage}
                    layers={layers}
                    dispatchLayers={dispatchLayers}
                />
            }
            defaultWidth={500}
            defaultHeight={300}
            resizable
            minWidth={300}
            minHeight={200}
        >
            <GroundTrackCanvas
                map={offscreenCanvas}
                planet={planet}
                width={1024}
                height={512}
                satellites={satellites}
                tracks={tracks}
                layers={layers}
                showCoverage={showCoverage}
                poiData={poiData}
            />
        </DraggableModal>
    );
}

GroundTrackWindow.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    satellites: PropTypes.object.isRequired,
    planets: PropTypes.array,
};
