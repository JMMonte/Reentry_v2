// GroundTrackWindow.jsx
import React, {
    useEffect,
    useState,
    useMemo,
} from 'react';
import PropTypes from 'prop-types';
import { DraggableModal } from '../modal/DraggableModal';
import { usePlanetList } from '../../../hooks/useGroundTrack';
import GroundTrackCanvas from './GroundTrackCanvas.jsx';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import { Button } from '../button';
import { Switch } from '../switch';
import { usePhysicsBodies } from '../../../hooks/usePhysicsBodies.js';
import { useGroundTrackPaths } from '../../../hooks/useGroundTrackPaths.js';
import { POIVisibilityPanel } from './POIVisibilityPanel.jsx';

// ---------------------------------------------------------------------------
// Main component
export function GroundTrackWindow({
    isOpen,
    onClose,
    satellites,
    planets,
    simulationTime,
}) {
    // Get physics bodies data through proper hook
    const { bodies: physicsBodies } = usePhysicsBodies();
    // Note: tracks state removed - now using trackPoints from GroundtrackPath system
    const [selectedPlanetNaifId, setSelectedPlanetNaifId] = useState(
        planets?.[0]?.naifId || 399
    );
    const [activeLayers, setActiveLayers] = React.useState({
        grid: true,
        countryBorders: false,
        states: false,
        cities: false,
        airports: false,
        spaceports: false,
        groundStations: false,
        observatories: false,
        missions: false,
        pois: true,
    });
    const [showCoverage, setShowCoverage] = useState(false);

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
        if (!activeLayers.pois || !planet?.surface?.points) {
            return {};
        }
        
        const processedData = {};
        
        // Handle different possible data structures
        Object.entries(planet.surface.points).forEach(([key, data]) => {
            if (Array.isArray(data)) {
                // Direct array of features/meshes
                processedData[key] = data.map(item => {
                    if (item.userData?.feature) {
                        // Three.js mesh with userData
                        const feat = item.userData.feature;
                        const [lon, lat] = feat.geometry.coordinates;
                        return { 
                            lon, 
                            lat,
                            name: feat.properties?.name || feat.properties?.NAME || feat.properties?.scalerank
                        };
                    } else if (item.geometry?.coordinates) {
                        // Direct GeoJSON feature
                        const [lon, lat] = item.geometry.coordinates;
                        return { 
                            lon, 
                            lat,
                            name: item.properties?.name || item.properties?.NAME || item.properties?.scalerank
                        };
                    } else if (item.lon !== undefined && item.lat !== undefined) {
                        // Direct coordinate object
                        return { 
                            lon: item.lon, 
                            lat: item.lat,
                            name: item.name || item.properties?.name
                        };
                    }
                    return null;
                }).filter(Boolean);
            } else if (data?.features) {
                // GeoJSON FeatureCollection
                processedData[key] = data.features.map(feat => {
                    const [lon, lat] = feat.geometry.coordinates;
                    return { 
                        lon, 
                        lat,
                        name: feat.properties?.name || feat.properties?.NAME || feat.properties?.scalerank
                    };
                });
            }
        });
        
        return processedData;
    }, [planet, activeLayers.pois]);

    // Use custom hook for ground track management
    const { trackPoints, currentPositions: getPositions } = useGroundTrackPaths({
        filteredSatellites,
        planet,
        simulationTime,
        physicsBodies
    });
    
    const [currentPositions, setCurrentPositions] = React.useState([]);
    
    // Update current positions when data changes
    React.useEffect(() => {
        const updatePositions = async () => {
            const positions = await getPositions();
            setCurrentPositions(positions);
        };
        updatePositions();
    }, [getPositions]);
    
    // Note: Periodic updates removed - now using direct callbacks in path.update()

    // Note: Old event-based groundtrack system removed - now using GroundtrackPath directly

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
            grid: true,
            cities: !!cfg.addCities,
            airports: !!cfg.addAirports,
            spaceports: !!cfg.addSpaceports,
            groundStations: !!cfg.addGroundStations,
            observatories: !!cfg.addObservatories,
            missions: !!cfg.addMissions,
            countryBorders: !!cfg.addCountryBorders,
            states: !!cfg.addStates,
            pois: !!planet?.surface?.points,
        };
        setActiveLayers(payload);
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

    // UI: layer toggles for available features
    const availableLayers = {
        grid: true,
        countryBorders: !!(planet?.surface?.countryGeo?.features?.length),
        states: !!(planet?.surface?.stateGeo?.features?.length),
        cities: !!(planet?.surface?.points?.cities?.length),
        airports: !!(planet?.surface?.points?.airports?.length),
        spaceports: !!(planet?.surface?.points?.spaceports?.length),
        groundStations: !!(planet?.surface?.points?.groundStations?.length),
        observatories: !!(planet?.surface?.points?.observatories?.length),
        missions: !!(planet?.surface?.points?.missions?.length),
        pois: !!planet?.surface?.points,
    };
    const layerToggles = (
        <div className="flex flex-wrap gap-2 mb-2">
            {Object.entries(availableLayers).map(([key, available]) =>
                available ? (
                    <label key={key} className="flex items-center gap-1 text-xs">
                        <Switch
                            checked={!!activeLayers[key]}
                            onCheckedChange={v => setActiveLayers(l => ({ ...l, [key]: v }))}
                            id={`layer-toggle-${key}`}
                        />
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                    </label>
                ) : null
            )}
            {/* Coverage toggle - only show if there are satellites */}
            {Object.keys(filteredSatellites).length > 0 && (
                <label className="flex items-center gap-1 text-xs">
                    <Switch
                        checked={showCoverage}
                        onCheckedChange={setShowCoverage}
                        id="coverage-toggle"
                    />
                    Coverage
                </label>
            )}
        </div>
    );

    return (
        <DraggableModal
            title={`Ground-track: ${planet?.name || ''}`}
            isOpen={isOpen}
            onClose={onClose}
            rightElement={planetSelector}
            defaultWidth={500}
            defaultHeight={450}
            resizable
            minWidth={300}
            minHeight={300}
        >
            {layerToggles}
            <GroundTrackCanvas
                map={planet?.getSurfaceTexture?.()}
                planetNaifId={planet?.naifId || 399} 
                width={1024}
                height={512}
                satellites={filteredSatellites}
                tracks={trackPoints}
                layers={activeLayers}
                showCoverage={showCoverage}
                poiData={poiData}
                groundtracks={currentPositions}
                planet={planet}
                physicsBodies={physicsBodies}
                currentTime={simulationTime || Date.now()}
            />
            <POIVisibilityPanel
                poiData={poiData}
                satellites={filteredSatellites}
                currentPositions={currentPositions}
                showCoverage={showCoverage}
                planetData={planet}
                tracks={trackPoints}
            />
        </DraggableModal>
    );
}

GroundTrackWindow.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    satellites: PropTypes.object.isRequired,
    planets: PropTypes.array,
    simulationTime: PropTypes.number,
};
