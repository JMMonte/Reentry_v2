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

import GroundTrackCanvas from './GroundTrackCanvas';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import BodySelector from '../common/BodySelector';
import { Button } from '../button';
import { Switch } from '../switch';
import { ChevronLeft, GripHorizontal } from 'lucide-react';
import { POIVisibilityPanel } from './POIVisibilityPanel.jsx';
import { POIPassSchedule } from './POIPassSchedule.jsx';
import { useGroundTrackData } from '@/hooks/useOrbitStreaming';

// ---------------------------------------------------------------------------
// Main component - Memoized to prevent unnecessary re-renders
export const GroundTrackWindow = React.memo(function GroundTrackWindow({
    isOpen,
    onClose,
    satellites,
    planets,
    simulationTime,
    centralizedBodies = [], // Add centralized physics bodies parameter
    onDataUpdate,
    selectedBody: navbarSelectedBody, // Add prop to receive navbar's selected body
}) {
    // Use centralized physics bodies instead of separate hook
    const physicsBodies = Array.isArray(centralizedBodies) ? centralizedBodies : Object.values(centralizedBodies);

    // Memoized planet list filtering
    const planetList = useMemo(() => (planets || []).filter(
        p => p.type !== 'barycenter' &&
            !(typeof p.name === 'string' && (
                p.name.endsWith('_barycenter') ||
                p.name === 'ss_barycenter' ||
                p.name === 'emb'
            ))
    ), [planets]);

    // Ref to track if we've initialized from navbar selection
    const hasInitializedFromNavbar = useRef(false);

    // Memoized function to find planet by navbar selection
    const initialPlanetFromNavbar = useMemo(() => {
        if (!navbarSelectedBody || navbarSelectedBody === 'none' || !planetList.length) {
            return planetList[0]; // Fallback to first planet
        }

        // Handle satellite selection - find the central body
        if (navbarSelectedBody.startsWith('satellite-')) {
            const satelliteId = navbarSelectedBody.replace('satellite-', '');
            const satellite = satellites?.[satelliteId];
            if (satellite?.centralBodyNaifId) {
                return planetList.find(p => p.naifId === satellite.centralBodyNaifId) || planetList[0];
            }
            return planetList[0];
        }

        // Direct planet/body name match
        const matchedPlanet = planetList.find(p =>
            p.name?.toLowerCase() === navbarSelectedBody.toLowerCase() ||
            p.naifId?.toString() === navbarSelectedBody
        );

        return matchedPlanet || planetList[0];
    }, [navbarSelectedBody, planetList, satellites]);

    // Initial selected planet - use navbar selection when opening, persist user changes
    const [selectedPlanetNaifId, setSelectedPlanetNaifId] = useState(() => {
        const initialPlanet = initialPlanetFromNavbar;
        return initialPlanet?.naifId || 399;
    });

    // Sync with navbar selection when window opens, but only once per open session
    useEffect(() => {
        if (isOpen && !hasInitializedFromNavbar.current && initialPlanetFromNavbar) {
            setSelectedPlanetNaifId(initialPlanetFromNavbar.naifId);
            hasInitializedFromNavbar.current = true;
        }

        // Reset initialization flag when window closes
        if (!isOpen) {
            hasInitializedFromNavbar.current = false;
        }
    }, [isOpen, initialPlanetFromNavbar]);

    const [selectedPOI, setSelectedPOI] = useState(null);
    const [selectedSatelliteForSchedule, setSelectedSatelliteForSchedule] = useState(null);
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

    // FIX: Use proper orbit streaming data instead of empty Map
    const { trackData: trackDataFromHook } = useGroundTrackData(
        filteredSatellites, 
        planet?.naifId
    );
    
    // Convert to Map format for compatibility with existing code
    const trackPoints = useMemo(() => {
        const trackMap = new Map();
        if (trackDataFromHook) {
            Object.entries(trackDataFromHook).forEach(([satId, points]) => {
                trackMap.set(satId, points);
            });
        }
        return trackMap;
    }, [trackDataFromHook]);

    // Memoized physics state from centralized physics data
    const physicsState = useMemo(() => {
        // If centralizedBodies is the physics state object with groundTracks, use it directly
        if (centralizedBodies && typeof centralizedBodies === 'object' && !Array.isArray(centralizedBodies) && centralizedBodies.groundTracks) {
            return centralizedBodies;
        }
        
        return null;
    }, [centralizedBodies]);

    // Function to get current satellite positions as an array from physics groundtrack data
    const getPositionsArray = useCallback(() => {
        // Get groundtrack data from physics state for the current planet
        if (!physicsState || !planet) {
            return [];
        }

        if (!physicsState.groundTracks) {
            return [];
        }

        // Get groundtrack positions for the current planet
        const planetGroundTracks = physicsState.groundTracks[planet.naifId];
        if (!planetGroundTracks || !Array.isArray(planetGroundTracks)) {
            return [];
        }

        // Filter and normalize longitude values to handle equirectangular edge effects
        return planetGroundTracks.map(position => {
            let normalizedLon = position.lon;

            // Handle equirectangular projection edge effects
            // Normalize longitude to [-180, 180] range
            while (normalizedLon > 180) normalizedLon -= 360;
            while (normalizedLon < -180) normalizedLon += 360;

            // Clamp latitude to valid range
            const clampedLat = Math.max(-90, Math.min(90, position.lat));

            return {
                ...position,
                lat: clampedLat,
                lon: normalizedLon
            };
        });
    }, [physicsState, planet]);

    // FIX: Optimize currentPositions state updates with better memoization
    const currentPositions = useMemo(() => {
        return getPositionsArray();
    }, [getPositionsArray]);

    // FIX: Remove the complex useEffect for currentPositions that was causing excessive re-renders
    // The useMemo above handles this more efficiently

    // FIX: Optimize processedTracksForSchedule with better state management
    const processedTracksForSchedule = useMemo(() => {
        if (!selectedSatelliteForSchedule || !trackPoints || !trackPoints.has(selectedSatelliteForSchedule.id)) {
            return {};
        }

        const satTracks = trackPoints.get(selectedSatelliteForSchedule.id);
        if (!satTracks || satTracks.length === 0) {
            return {};
        }

        // For now, since trackPoints is empty, return empty object
        // This will be populated when orbit streaming system provides data
        return {};
    }, [selectedSatelliteForSchedule, trackPoints]);

    // FIX: Remove expensive async processing in useEffect - handle in components that need the data
    // The POIPassSchedule component now handles orbit data directly from streaming system

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

    // FIX: Optimize onDataUpdate callback with proper dependencies
    const handleDataUpdate = useCallback(() => {
        if (onDataUpdate && poiDataForCanvas && planet) {
            onDataUpdate(poiDataForCanvas, trackPoints, planet, currentPositions);
        }
    }, [onDataUpdate, poiDataForCanvas, trackPoints, planet, currentPositions]);

    // Use effect only when dependencies actually change
    useEffect(() => {
        handleDataUpdate();
    }, [handleDataUpdate]);

    // FIX: Memoize UI selectors to prevent recreation
    const planetSelector = useMemo(() => (
        <BodySelector
            mode="dropdown"
            showSearch={true}
            filterBarycenters={true}
            selectedBody={planet}
            onBodyChange={(selectedPlanet) => {
                // Handle both object and naifId selection
                const naifId = typeof selectedPlanet === 'object' ? selectedPlanet.naifId : selectedPlanet;
                setSelectedPlanetNaifId(naifId);
            }}
            bodies={planetList}
            placeholder="Select Planet"
            allowNone={false}
            size="sm"
            triggerClassName="w-full"
            searchPlaceholder="Search planets..."
        />
    ), [planet, planetList]);

    // FIX: Memoize availableLayers calculation
    const availableLayers = useMemo(() => ({
        grid: true,
        countryBorders: !!(planet?.surface?.countryGeo?.features?.length),
        states: !!(planet?.surface?.stateGeo?.features?.length),
        cities: !!(planet?.surface?.points?.cities?.length),
        airports: !!(planet?.surface?.points?.airports?.length),
        spaceports: !!(planet?.surface?.points?.spaceports?.length),
        groundStations: !!(planet?.surface?.points?.groundStations?.length),
        observatories: !!(planet?.surface?.points?.observatories?.length),
        missions: !!(planet?.surface?.points?.missions?.length),
    }), [planet]);

    // FIX: Memoize layer selector to prevent recreation
    const layerSelector = useMemo(() => (
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
    ), [availableLayers, activeLayers, showCoverage, filteredSatellites]);

    // FIX: Memoize the canvas props to prevent unnecessary re-renders
    const canvasProps = useMemo(() => ({
        map: planet?.getSurfaceTexture?.(),
        planetNaifId: planet?.naifId || 399,
        width: 1024,
        height: 512,
        satellites: filteredSatellites,
        tracks: trackPoints,
        layers: activeLayers,
        showCoverage,
        poiData: poiDataForCanvas,
        groundtracks: currentPositions,
        planet,
        physicsBodies,
        currentTime: simulationTime || Date.now()
    }), [
        planet,
        filteredSatellites,
        trackPoints,
        activeLayers,
        showCoverage,
        poiDataForCanvas,
        currentPositions,
        physicsBodies,
        simulationTime
    ]);

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
                            <GroundTrackCanvas {...canvasProps} />
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
});

GroundTrackWindow.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    satellites: PropTypes.object.isRequired,
    planets: PropTypes.array,
    simulationTime: PropTypes.number,
    centralizedBodies: PropTypes.oneOfType([PropTypes.array, PropTypes.object]), // Can be array of bodies or physics state object
    onDataUpdate: PropTypes.func,
    selectedBody: PropTypes.string,
};
