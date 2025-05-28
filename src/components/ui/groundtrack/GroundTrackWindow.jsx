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
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import { Button } from '../button';

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
    const [tracks, setTracks] = useState({});
    // refs to batch updates
    const pendingTracksRef = useRef({});
    const flushTracksScheduledRef = useRef(false);
    const [selectedPlanetNaifId, setSelectedPlanetNaifId] = useState(
        planets?.[0]?.naifId || 399
    );
    const [layers, dispatchLayers] = useReducer(layersReducer, initialLayers);
    const [showCoverage] = useState(false);

    const planetList = usePlanetList(planets).filter(
        p => p.type !== 'barycenter' &&
            !(typeof p.name === 'string' && (
                p.name.endsWith('_barycenter') ||
                p.name === 'ss_barycenter' ||
                p.name === 'emb'
            ))
    );
    const planet = planetList.find(p => p.naifId === selectedPlanetNaifId) || planetList[0];

    // Filter satellites to only those orbiting the selected planet
    const filteredSatellites = useMemo(() => {
        if (!satellites || !planet) return {};
        return Object.fromEntries(
            Object.entries(satellites).filter(
                ([, sat]) => sat.centralBodyNaifId === planet.naifId
            )
        );
    }, [satellites, planet]);

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
        // getSurfaceTexture returns the raw image (HTMLImageElement or Canvas)
        const img = planet.getSurfaceTexture?.();

        function draw(source) {
            const off = document.createElement('canvas');
            off.width = source.width;
            off.height = source.height;
            off.getContext('2d').drawImage(source, 0, 0);
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

    // UI: planet selector (DropdownMenu)
    const planetSelector = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="justify-start w-full">
                    {planet?.name || 'Select Planet'}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[10rem] w-48 max-h-80 overflow-y-auto z-[11000]">
                {planetList.map(p => (
                    <DropdownMenuItem
                        key={p.naifId}
                        onSelect={() => setSelectedPlanetNaifId(p.naifId)}
                        className={p.naifId === selectedPlanetNaifId ? 'font-semibold bg-accent' : ''}
                    >
                        {p.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <DraggableModal
            title={`Ground-track: ${planet?.name || ''}`}
            isOpen={isOpen}
            onClose={onClose}
            rightElement={planetSelector}
            defaultWidth={500}
            defaultHeight={300}
            resizable
            minWidth={300}
            minHeight={200}
        >
            <GroundTrackCanvas
                map={planet?.getSurfaceTexture?.()}
                planet={planet}
                width={1024}
                height={512}
                satellites={filteredSatellites}
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
