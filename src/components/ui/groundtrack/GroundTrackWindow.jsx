// GroundTrackWindow.jsx
import React, {
    useEffect,
    useState,
    useMemo,
    useRef,
    useCallback,
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
import { POIPassSchedule } from './POIPassSchedule.jsx';
import { ChevronLeft, GripHorizontal } from 'lucide-react';
import { groundTrackService } from '../../../services/GroundTrackService';

// ---------------------------------------------------------------------------
// Main component
export function GroundTrackWindow({
    isOpen,
    onClose,
    satellites,
    planets,
    simulationTime,
    onDataUpdate,
}) {
    // Get physics bodies data through proper hook
    const { bodies: physicsBodies } = usePhysicsBodies();
    // Note: tracks state removed - now using trackPoints from GroundtrackPath system
    const [selectedPlanetNaifId, setSelectedPlanetNaifId] = useState(
        planets?.[0]?.naifId || 399
    );
    const [selectedPOI, setSelectedPOI] = useState(null);
    const [selectedSatelliteForSchedule, setSelectedSatelliteForSchedule] = useState(null);
    const [processedTracksForSchedule, setProcessedTracksForSchedule] = useState({});
    const [activeLayers, setActiveLayers] = React.useState({
        grid: true,
        countryBorders: true,
        states: true,
        cities: true,
        airports: true,
        spaceports: true,
        groundStations: true,
        observatories: true,
        missions: true,
        pois: true,
    });
    const [showCoverage, setShowCoverage] = useState(false);
    const [mapHeight, setMapHeight] = useState(250);
    const isDraggingRef = useRef(false);
    const containerRef = useRef(null);

    const planetList = usePlanetList(planets).filter(
        p => p.type !== 'barycenter' &&
            !(typeof p.name === 'string' && (
                p.name.endsWith('_barycenter') ||
                p.name === 'ss_barycenter' ||
                p.name === 'emb'
            ))
    );
    const planet = planetList.find(p => p.naifId === selectedPlanetNaifId) || planetList[0];

    // Handle drag resize for map height
    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        isDraggingRef.current = true;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (!isDraggingRef.current || !containerRef.current) return;
        
        const containerRect = containerRef.current.getBoundingClientRect();
        const newHeight = e.clientY - containerRect.top;
        
        // Constrain height between min and max
        const constrainedHeight = Math.min(Math.max(100, newHeight), containerRect.height - 100);
        setMapHeight(constrainedHeight);
    }, []);

    const handleMouseUp = useCallback(() => {
        if (isDraggingRef.current) {
            isDraggingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }, []);

    // Add global mouse event listeners for dragging
    useEffect(() => {
        const onMouseMove = (e) => handleMouseMove(e);
        const onMouseUp = () => handleMouseUp();
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    // Filter satellites to only those orbiting the selected planet
    const filteredSatellites = useMemo(() => {
        if (!satellites || !planet) return {};
        return Object.fromEntries(
            Object.entries(satellites).filter(
                ([, sat]) => sat.centralBodyNaifId === planet.naifId
            )
        );
    }, [satellites, planet]);

    // Get POI data for canvas rendering (keeps 3D rendering separate from POI visibility calculations)
    const poiDataForCanvas = useMemo(() => {
        if (!planet?.surface?.points) {
            return {};
        }
        
        const processedData = {};
        
        // Simplified processing for canvas rendering only
        Object.entries(planet.surface.points).forEach(([key, data]) => {
            if (Array.isArray(data)) {
                processedData[key] = data.map(item => {
                    if (item.userData?.feature) {
                        const feat = item.userData.feature;
                        const [lon, lat] = feat.geometry.coordinates;
                        return { 
                            lon, 
                            lat,
                            name: feat.properties?.name || feat.properties?.NAME || feat.properties?.scalerank
                        };
                    }
                    return null;
                }).filter(Boolean);
            }
        });
        
        return processedData;
    }, [planet]);

    // Use custom hook for ground track management
    const { trackPoints, currentPositions: getPositions } = useGroundTrackPaths({
        filteredSatellites,
        planet,
        simulationTime,
        physicsBodies
    });
    
    // Process tracks when satellite is selected for schedule
    React.useEffect(() => {
        const processTracksForSchedule = async () => {
            if (selectedSatelliteForSchedule && trackPoints && trackPoints[selectedSatelliteForSchedule.id]) {
                const satTracks = trackPoints[selectedSatelliteForSchedule.id];
                
                // Check if tracks need processing (have position.x/y/z instead of lat/lon)
                if (satTracks.length > 0 && satTracks[0].position && !satTracks[0].lat) {
                    try {
                        const currentPlanetState = physicsBodies?.find(b => b.naifId === planet.naifId);
                        const processedPoints = await Promise.all(
                            satTracks.map(async (point) => {
                                const eciPos = [point.position.x, point.position.y, point.position.z];
                                
                                // Calculate altitude from position magnitude
                                const r = Math.sqrt(point.position.x * point.position.x + 
                                                  point.position.y * point.position.y + 
                                                  point.position.z * point.position.z);
                                const altitude = r - (planet?.radius || 6371);
                                
                                const geoPos = await groundTrackService.transformECIToSurface(
                                    eciPos,
                                    planet.naifId,
                                    point.time,
                                    currentPlanetState
                                );
                                return {
                                    time: point.time,
                                    lat: geoPos.lat,
                                    lon: geoPos.lon,
                                    alt: geoPos.alt !== undefined ? geoPos.alt : altitude
                                };
                            })
                        );
                        
                        setProcessedTracksForSchedule({
                            ...processedTracksForSchedule,
                            [selectedSatelliteForSchedule.id]: processedPoints
                        });
                    } catch (error) {
                        console.error('Error processing tracks for schedule:', error);
                    }
                } else if (satTracks[0].lat !== undefined) {
                    // Tracks already have lat/lon
                    setProcessedTracksForSchedule({
                        ...processedTracksForSchedule,
                        [selectedSatelliteForSchedule.id]: satTracks
                    });
                }
            }
        };
        
        processTracksForSchedule();
    }, [selectedSatelliteForSchedule, trackPoints, planet, physicsBodies]);
    
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
            cities: cfg.addCities !== false,
            airports: cfg.addAirports !== false,
            spaceports: cfg.addSpaceports !== false,
            groundStations: cfg.addGroundStations !== false,
            observatories: cfg.addObservatories !== false,
            missions: cfg.addMissions !== false,
            countryBorders: cfg.addCountryBorders !== false,
            states: cfg.addStates !== false,
            pois: true,
        };
        setActiveLayers(payload);
    }, [planet]);

    // Notify parent component when data changes
    useEffect(() => {
        if (onDataUpdate && poiDataForCanvas && trackPoints && planet) {
            onDataUpdate(poiDataForCanvas, trackPoints, planet, currentPositions);
        }
    }, [poiDataForCanvas, trackPoints, planet, currentPositions, onDataUpdate]);

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
    };
    
    const layerSelector = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                    Layers
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 z-[11000]">
                {Object.entries(availableLayers).map(([key, available]) =>
                    available ? (
                        <DropdownMenuItem
                            key={key}
                            className="flex items-center justify-between text-xs cursor-pointer"
                            onSelect={(e) => {
                                e.preventDefault();
                                setActiveLayers(l => ({ ...l, [key]: !l[key] }));
                            }}
                        >
                            <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                            <Switch
                                checked={!!activeLayers[key]}
                                onCheckedChange={v => setActiveLayers(l => ({ ...l, [key]: v }))}
                                onClick={(e) => e.stopPropagation()}
                                className="ml-2"
                            />
                        </DropdownMenuItem>
                    ) : null
                )}
                {/* Coverage toggle - only show if there are satellites */}
                {Object.keys(filteredSatellites).length > 0 && (
                    <>
                        <div className="my-1 h-px bg-border" />
                        <DropdownMenuItem
                            className="flex items-center justify-between text-xs cursor-pointer"
                            onSelect={(e) => {
                                e.preventDefault();
                                setShowCoverage(!showCoverage);
                            }}
                        >
                            <span>Satellite Coverage</span>
                            <Switch
                                checked={showCoverage}
                                onCheckedChange={setShowCoverage}
                                onClick={(e) => e.stopPropagation()}
                                className="ml-2"
                            />
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <DraggableModal
            title={selectedPOI && selectedSatelliteForSchedule 
                ? `Pass Schedule: ${selectedPOI.name || `${selectedPOI.lat.toFixed(1)}°, ${selectedPOI.lon.toFixed(1)}°`}`
                : `Ground-track: ${planet?.name || ''}`}
            isOpen={isOpen}
            onClose={onClose}
            rightElement={!selectedPOI ? (
                <div className="flex items-center gap-1">
                    {layerSelector}
                    {planetSelector}
                </div>
            ) : null}
            defaultWidth={500}
            defaultHeight={450}
            resizable
            minWidth={300}
            minHeight={300}
        >
            <div ref={containerRef} className="flex flex-col h-full">
                {!selectedPOI && (
                    <>
                        <div style={{ height: `${mapHeight}px`, minHeight: '100px' }} className="relative">
                            <GroundTrackCanvas
                                map={planet?.getSurfaceTexture?.()}
                                planetNaifId={planet?.naifId || 399} 
                                width={1024}
                                height={512}
                                satellites={filteredSatellites}
                                tracks={trackPoints}
                                layers={activeLayers}
                                showCoverage={showCoverage}
                                poiData={poiDataForCanvas}
                                groundtracks={currentPositions}
                                planet={planet}
                                physicsBodies={physicsBodies}
                                currentTime={simulationTime || Date.now()}
                            />
                        </div>
                        <div 
                            className="h-2 bg-border/50 hover:bg-border cursor-ns-resize flex items-center justify-center group"
                            onMouseDown={handleMouseDown}
                        >
                            <GripHorizontal className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
                        </div>
                        <div className="flex-1 overflow-auto">
                            <POIVisibilityPanel
                                poiData={poiDataForCanvas}
                                satellites={filteredSatellites}
                                currentPositions={currentPositions}
                                showCoverage={showCoverage}
                                planetData={planet}
                                tracks={trackPoints}
                                currentTime={simulationTime || Date.now()}
                                onSelectSchedule={(poi, satellite) => {
                                    setSelectedPOI(poi);
                                    setSelectedSatelliteForSchedule(satellite);
                                }}
                            />
                        </div>
                    </>
                )}
                {selectedPOI && selectedSatelliteForSchedule && (
                    <div className="space-y-2 h-full overflow-auto">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSelectedPOI(null);
                                setSelectedSatelliteForSchedule(null);
                            }}
                            className="w-full justify-start text-xs"
                        >
                            <ChevronLeft className="h-3 w-3 mr-1" />
                            Back to POI Visibility
                        </Button>
                        <POIPassSchedule
                            poi={selectedPOI}
                            satellite={selectedSatelliteForSchedule}
                            satData={filteredSatellites[selectedSatelliteForSchedule.id]}
                            tracks={processedTracksForSchedule}
                            currentTime={simulationTime || Date.now()}
                            planetData={planet}
                        />
                    </div>
                )}
            </div>
        </DraggableModal>
    );
}

GroundTrackWindow.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    satellites: PropTypes.object.isRequired,
    planets: PropTypes.array,
    simulationTime: PropTypes.number,
    onDataUpdate: PropTypes.func,
};
