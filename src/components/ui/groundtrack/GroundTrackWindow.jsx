// GroundTrackWindow.jsx
import React, {
    useEffect,
    useState,
    useMemo,
} from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import { DraggableModal } from '../modal/DraggableModal';
import { usePlanetList } from '../../../hooks/useGroundTrack';
import GroundTrackCanvas from './GroundTrackCanvas.jsx';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import { Button } from '../button';
import { GroundtrackPath } from '../../Satellite/GroundtrackPath.js';
import { Switch } from '../switch';
import { groundTrackService } from '../../../services/GroundTrackService.js';

// ---------------------------------------------------------------------------
// Main component
export function GroundTrackWindow({
    isOpen,
    onClose,
    satellites,
    planets,
    simulationTime,
}) {
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
        if (!activeLayers.pois || !planet?.surface?.points) return {};
        return Object.entries(planet.surface.points).reduce((acc, [key, meshes]) => {
            acc[key] = meshes.map(mesh => {
                const feat = mesh.userData.feature;
                const [lon, lat] = feat.geometry.coordinates;
                return { lon, lat };
            });
            return acc;
        }, {});
    }, [planet, activeLayers.pois]);

    // State for satellite ground tracks and current positions
    const [groundtrackPaths, setGroundtrackPaths] = React.useState(new Map());
    const [currentPositions, setCurrentPositions] = React.useState([]);
    const [trackPoints, setTrackPoints] = React.useState({}); // Store computed groundtrack points
    
    // Cleanup on component unmount
    React.useEffect(() => {
        return () => {
            // Force cleanup of all paths when window closes
            groundtrackPaths.forEach(path => path.dispose());
            GroundtrackPath.forceCleanup();
        };
    }, []);
    
    // Create and manage GroundtrackPath instances for each satellite
    React.useEffect(() => {
        if (!planet?.naifId || !Object.keys(filteredSatellites).length) {
            // Cleanup existing paths
            groundtrackPaths.forEach(path => path.dispose());
            setGroundtrackPaths(new Map());
            setCurrentPositions([]);
            return;
        }
        
        const newPaths = new Map();
        const satellites = Object.values(filteredSatellites);
        
        // Create GroundtrackPath for each satellite
        satellites.forEach(sat => {
            if (sat.position && sat.velocity) {
                const path = new GroundtrackPath();
                newPaths.set(sat.id, path);
                
                // Get physics bodies for orbit propagation
                const bodies = window.app3d?.physicsIntegration?.physicsEngine?.getBodiesForOrbitPropagation() || [];
                
                // Update the groundtrack path with current satellite state
                const period = 6000; // 100 minutes in seconds (typical LEO)
                const numPoints = 200; // Number of points in the track
                
                // Use simulation time if available, otherwise current time
                const startTime = simulationTime || Date.now();
                
                path.update(
                    startTime,
                    new THREE.Vector3(sat.position[0], sat.position[1], sat.position[2]),
                    new THREE.Vector3(sat.velocity[0], sat.velocity[1], sat.velocity[2]),
                    sat.id,
                    bodies,
                    period,
                    numPoints,
                    planet.naifId,
                    // Direct callback for updates - no DOM events
                    (data) => {
                        setTrackPoints(prev => ({
                            ...prev,
                            [data.id]: data.points
                        }));
                    },
                    null, // onChunk callback
                    1024, // canvasWidth - matches GroundTrackCanvas dimensions
                    512   // canvasHeight - matches GroundTrackCanvas dimensions
                );
            }
        });
        
        // Cleanup old paths
        groundtrackPaths.forEach(path => path.dispose());
        setGroundtrackPaths(newPaths);
        
        // Update current positions from satellite data - convert to lat/lon for canvas
        const updatePositions = async () => {
            // Get current planet state from physics engine
            const bodies = window.app3d?.physicsIntegration?.physicsEngine?.getBodiesForOrbitPropagation() || [];
            const currentPlanetState = bodies.find(b => b.naifId === planet.naifId);
            
            const positions = await Promise.all(satellites.map(async sat => {
                if (!sat.position) {
                    return { id: sat.id, lat: 0, lon: 0, color: sat.color || 0xffff00 };
                }
                
                try {
                    const eciPos = [sat.position[0], sat.position[1], sat.position[2]];
                    const currentTime = simulationTime || Date.now();
                    const geoPos = await groundTrackService.transformECIToSurface(
                        eciPos, 
                        planet.naifId, 
                        currentTime,
                        currentPlanetState // Pass current planet state with orientation
                    );
                    return {
                        id: sat.id,
                        lat: geoPos.lat,
                        lon: geoPos.lon,
                        alt: geoPos.alt,
                        color: sat.color || 0xffff00
                    };
                } catch (error) {
                    console.warn(`Failed to convert position for satellite ${sat.id}:`, error);
                    return { id: sat.id, lat: 0, lon: 0, color: sat.color || 0xffff00 };
                }
            }));
            setCurrentPositions(positions);
        };
        
        updatePositions();
        
        return () => {
            // Cleanup on unmount
            newPaths.forEach(path => path.dispose());
            setTrackPoints({}); // Clear track points to free memory
        };
    }, [filteredSatellites, planet, simulationTime]);
    
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
        countryBorders: !!planet?.surface?.countryGeo,
        states: !!planet?.surface?.stateGeo,
        cities: !!planet?.surface?.cities,
        airports: !!planet?.surface?.airports,
        spaceports: !!planet?.surface?.spaceports,
        groundStations: !!planet?.surface?.groundStations,
        observatories: !!planet?.surface?.observatories,
        missions: !!planet?.surface?.missions,
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
        </div>
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
                currentTime={simulationTime || Date.now()}
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
