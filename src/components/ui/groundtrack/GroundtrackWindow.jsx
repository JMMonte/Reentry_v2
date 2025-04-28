// GroundTrackWindow.jsx
import React, {
    useEffect,
    useRef,
    useReducer,
    useState,
} from 'react';
import PropTypes from 'prop-types';
import { DraggableModal } from '../modal/DraggableModal';
import { usePlanetList } from './hooks';
import GroundTrackCanvas from './GroundTrackCanvas.jsx';
import GroundTrackControls from './GroundTrackControls.jsx';

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
    const offscreenRef = useRef(null);
    // Track latest simulation lat/lon per satellite from simulationDataUpdate
    const [currentPos, setCurrentPos] = useState({});
    useEffect(() => {
        const handleSim = e => {
            setCurrentPos(prev => ({
                ...prev,
                [e.detail.id]: { lat: e.detail.lat, lon: e.detail.lon }
            }));
        };
        document.addEventListener('simulationDataUpdate', handleSim);
        return () => document.removeEventListener('simulationDataUpdate', handleSim);
    }, []);
    const [tracks, setTracks] = useState({});
    const [selectedPlanet, setSelectedPlanet] = useState(0);
    const [layers, dispatchLayers] = useReducer(layersReducer, initialLayers);
    const [showCoverage, setShowCoverage] = useState(false);

    const planetList = usePlanetList(planets);
    const planet = planetList[selectedPlanet];

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
        const handler = e => {
            const { id, points } = e.detail;
            setTracks(prev => ({ ...prev, [id]: points }));
        };
        document.addEventListener(
            'groundTrackUpdated',
            handler
        );
        return () =>
            document.removeEventListener(
                'groundTrackUpdated',
                handler
            );
    }, [isOpen]);

    // Hook: cache planet surface to offscreen canvas
    useEffect(() => {
        if (!planet) return;
        const texture = planet.getSurfaceTexture?.();
        const src = texture?.image;

        function draw(img) {
            const off = document.createElement('canvas');
            off.width = img.width;
            off.height = img.height;
            off
                .getContext('2d')
                .drawImage(img, 0, 0);
            offscreenRef.current = off;
        }

        if (src instanceof HTMLImageElement) {
            src.complete ? draw(src) : (src.onload = () => draw(src));
        } else if (src instanceof HTMLCanvasElement) {
            draw(src);
        } else if (src?.src) {
            const i = new Image();
            i.src = src.src;
            i.onload = () => draw(i);
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

    // CSV download
    const downloadCsv = () => {
        const rows = [['satelliteId', 'time', 'lat', 'lon']];
        for (const [id, pts] of Object.entries(tracks))
            pts.forEach(({ time, lat, lon }) =>
                rows.push([id, time, lat, lon]),
            );
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
                map={offscreenRef.current}
                planet={planet}
                width={1024}
                height={512}
                satellites={satellites}
                tracks={tracks}
                currentPos={currentPos}
                layers={layers}
                showCoverage={showCoverage}
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
