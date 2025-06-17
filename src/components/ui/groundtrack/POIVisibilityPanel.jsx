import React, { useState, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { POIVisibilityService } from '@/services/POIVisibilityService';
import { Eye, Satellite, ChevronDown, ChevronRight, Clock, Calendar } from 'lucide-react';
import { Badge } from '../badge';
import { Button } from '../button';

// Memoized section component
const Section = React.memo(function Section({ title, isOpen, onToggle, children }) {
    return (
        <div className="border-b border-border last:border-b-0">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-2 text-xs hover:bg-accent transition-colors"
                aria-expanded={isOpen}
            >
                <span className="text-foreground font-medium">{title}</span>
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {isOpen && (
                <div className="px-2 pb-2">
                    {children}
                </div>
            )}
        </div>
    );
});

Section.propTypes = {
    title: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.node
    ]),
    isOpen: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired,
    children: PropTypes.node
};

// Memoized POI item component to prevent re-renders
const POIItem = React.memo(function POIItem({ 
    poi, 
    satellite, 
    satId, 
    satellites, 
    currentTime, 
    onSelectSchedule
}) {
    // Use ref to prevent recalculations with same data
    const calculationsRef = useRef(null);
    const lastInputsRef = useRef(null);

    // Memoize expensive calculations with proper dependencies
    const calculations = useMemo(() => {
        const currentInputs = { 
            poiLat: poi.lat, 
            poiLon: poi.lon, 
            satLat: satellite.lat, 
            satLon: satellite.lon, 
            satAlt: satellite.alt,
            satId,
            currentTime: Math.floor((currentTime || Date.now()) / 60000) // Round to minutes for stability
        };

        // Use cached result if inputs haven't changed - simple property comparison
        if (lastInputsRef.current && 
            lastInputsRef.current.poiLat === currentInputs.poiLat &&
            lastInputsRef.current.poiLon === currentInputs.poiLon &&
            lastInputsRef.current.satLat === currentInputs.satLat &&
            lastInputsRef.current.satLon === currentInputs.satLon &&
            lastInputsRef.current.satAlt === currentInputs.satAlt &&
            lastInputsRef.current.satId === currentInputs.satId &&
            lastInputsRef.current.currentTime === currentInputs.currentTime &&
            calculationsRef.current) {
            return calculationsRef.current;
        }

        const distanceDegrees = POIVisibilityService.greatCircleDistance(
            poi.lat, poi.lon,
            satellite.lat, satellite.lon
        );
        const distanceKm = distanceDegrees * 111.32;

        // Use physics-based duration calculation instead of legacy service
        const duration = estimateVisibilityDuration(satellite.alt);

        // Get next pass from centralized physics engine if available
        let nextPassInfo = null;
        const passEngine = window.app3d?.physicsIntegration?.physicsEngine?.passPredictionEngine;
        if (passEngine) {
            const poiId = `poi_${poi.lat}_${poi.lon}_${poi.name || 'unnamed'}`;
            const passData = passEngine.getPassData(poiId, satId);
            if (passData && Array.isArray(passData)) {
                const nextPass = passData.find(pass => pass.aos > (currentTime || Date.now()));
                if (nextPass) {
                    const timeUntil = nextPass.aos - (currentTime || Date.now());
                    const hours = Math.floor(timeUntil / 3600000);
                    const minutes = Math.floor((timeUntil % 3600000) / 60000);
                    nextPassInfo = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                }
            }
        }

        const result = { distanceKm, duration, nextPassInfo };
        
        // Cache the result
        calculationsRef.current = result;
        lastInputsRef.current = currentInputs;
        
        return result;
    }, [poi.lat, poi.lon, satellite.lat, satellite.lon, satellite.alt, satId, Math.floor((currentTime || Date.now()) / 60000)]);

    // Memoize the satellite object to prevent recreation
    const satelliteWithAlt = useMemo(() => ({
        ...satellites[satId],
        alt: satellite.alt
    }), [satellites, satId, satellite.alt]);

    // Memoize event handler
    const handleScheduleClick = useCallback((e) => {
        e.stopPropagation();
        e.preventDefault();
        onSelectSchedule(poi, satelliteWithAlt);
    }, [poi, satelliteWithAlt, onSelectSchedule]);

    const displayName = poi.name || `${poi.lat.toFixed(1)}°, ${poi.lon.toFixed(1)}°`;
    const titleText = poi.name || `${poi.lat.toFixed(3)}°, ${poi.lon.toFixed(3)}°`;

    return (
        <div className="space-y-0.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate flex-1" title={titleText}>
                    {displayName}
                </span>
                <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        <span>~{calculations.duration}m</span>
                    </div>
                </div>
            </div>
            <div className="ml-4 flex items-center justify-between text-xs text-muted-foreground/70 relative z-50">
                <div className="flex items-center gap-2">
                    <span>Distance: {calculations.distanceKm.toFixed(0)}km</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-xs"
                    onMouseDown={handleScheduleClick}
                >
                    <Calendar className="h-3 w-3 mr-1" />
                    Schedule
                </Button>
            </div>
            {calculations.nextPassInfo && (
                <div className="ml-4 text-xs text-muted-foreground/50">
                    Next pass in {calculations.nextPassInfo}
                </div>
            )}
        </div>
    );
});

POIItem.propTypes = {
    poi: PropTypes.object.isRequired,
    satellite: PropTypes.object.isRequired,
    satId: PropTypes.string.isRequired,
    satellites: PropTypes.object.isRequired,
    currentTime: PropTypes.number,
    onSelectSchedule: PropTypes.func.isRequired
};

// Memoized satellite row component
const SatelliteRow = React.memo(function SatelliteRow({
    satId,
    data,
    isExpanded,
    onToggleExpanded,
    satellites,
    tracks,
    currentTime,
    onSelectSchedule
}) {
    // Memoize satellite color calculation
    const satColor = useMemo(() => 
        `#${data.satellite.color.toString(16).padStart(6, '0')}`, 
        [data.satellite.color]
    );

    // Memoize the style object
    const iconStyle = useMemo(() => ({ color: satColor }), [satColor]);

    return (
        <div className="border rounded p-1.5">
            <div
                onMouseDown={onToggleExpanded}
                className="w-full flex items-center gap-1 text-xs font-medium hover:bg-accent/50 rounded p-0.5 cursor-pointer"
            >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Satellite
                    className="h-3 w-3"
                    style={iconStyle}
                />
                <span className="flex-1 text-left">{data.satellite.name}</span>
                <Badge variant="outline" className="text-xs">
                    {data.totalPOIs} POIs
                </Badge>
            </div>

            {isExpanded && (
                <div className="mt-1 ml-5 space-y-1">
                    {data.visiblePOIs.map((poi, idx) => (
                        <POIItem
                            key={poi.id || `${satId}_${idx}`}
                            poi={poi}
                            satellite={data.satellite}
                            satId={satId}
                            satellites={satellites}
                            tracks={tracks}
                            currentTime={currentTime}
                            onSelectSchedule={onSelectSchedule}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

SatelliteRow.propTypes = {
    satId: PropTypes.string.isRequired,
    data: PropTypes.object.isRequired,
    isExpanded: PropTypes.bool.isRequired,
    onToggleExpanded: PropTypes.func.isRequired,
    satellites: PropTypes.object.isRequired,
    tracks: PropTypes.object,
    currentTime: PropTypes.number,
    onSelectSchedule: PropTypes.func.isRequired
};

// Helper function for physics-based duration estimation
function estimateVisibilityDuration(altitude) {
    const planetRadius = 6371; // Earth radius in km
    if (!altitude || altitude <= 0) return 0;

    // Calculate coverage radius
    const coverageRadius = Math.acos(planetRadius / (planetRadius + altitude)) * planetRadius;
    
    // Estimate ground speed (simplified)
    const GM = 3.986004418e5;
    const orbitalRadius = planetRadius + altitude;
    const groundSpeed = Math.sqrt(GM / orbitalRadius);
    
    return Math.round((coverageRadius / groundSpeed) / 60); // minutes
}

export const POIVisibilityPanel = React.memo(function POIVisibilityPanel({
    poiData,
    satellites,
    currentPositions,
    planetData,
    tracks,
    currentTime,
    onSelectSchedule
}) {
    const [expandedSatellites, setExpandedSatellites] = useState({});
    
    // Use ref to prevent expensive recalculations
    const visibilityRef = useRef(null);
    const lastPositionsRef = useRef(null);

    // Memoize expensive visibility calculations with proper caching
    const visibilityBySatellite = useMemo(() => {
        if (!poiData || !currentPositions || currentPositions.length === 0) {
            return {};
        }

        // Create stable key for caching
        const positionsKey = currentPositions
            .map(pos => `${pos.id}:${pos.lat?.toFixed(3)}:${pos.lon?.toFixed(3)}:${pos.alt?.toFixed(1)}`)
            .sort()
            .join('|');

        // Use cached result if positions haven't changed significantly
        if (lastPositionsRef.current === positionsKey && visibilityRef.current) {
            return visibilityRef.current;
        }

        const result = {};

        for (const pos of currentPositions) {
            const satellite = satellites?.[pos.id];
            if (!satellite || !pos.lat || !pos.lon || pos.alt === undefined) continue;

            // Use physics-based coverage calculation
            const coverageRadiusDegrees = Math.acos(
                (planetData?.radius || 6371) / ((planetData?.radius || 6371) + pos.alt)
            ) * 180 / Math.PI;
            const coverageRadiusKm = coverageRadiusDegrees * 111.32;

            const satelliteData = {
                lat: pos.lat,
                lon: pos.lon,
                alt: pos.alt,
                coverageRadius: coverageRadiusDegrees,
                coverageRadiusKm,
                name: satellite.name,
                id: pos.id,
                color: satellite.color || 0xffffff
            };

            // Flatten all POIs (cached in parent if possible)
            const allPOIs = [];
            Object.entries(poiData).forEach(([category, pois]) => {
                if (Array.isArray(pois)) {
                    pois.forEach(poi => {
                        if (poi.lat !== undefined && poi.lon !== undefined) {
                            allPOIs.push({
                                ...poi,
                                category
                            });
                        }
                    });
                }
            });

            // Find visible POIs
            const visiblePOIs = POIVisibilityService.getVisiblePOIs(allPOIs, satelliteData);

            if (visiblePOIs.length > 0) {
                result[pos.id] = {
                    satellite: satelliteData,
                    visiblePOIs,
                    totalPOIs: visiblePOIs.length
                };
            }
        }

        // Cache the results
        visibilityRef.current = result;
        lastPositionsRef.current = positionsKey;

        return result;
    }, [poiData, satellites, currentPositions, planetData]);

    // Memoized event handlers
    const toggleSatelliteExpanded = useCallback((satId) => {
        setExpandedSatellites(prev => ({
            ...prev,
            [satId]: !prev[satId]
        }));
    }, []);

    // Section visibility state
    const [sectionVisibility, setSectionVisibility] = useState({
        poiVisibility: true
    });

    const toggleSection = useCallback((section) => {
        setSectionVisibility(prev => ({ ...prev, [section]: !prev[section] }));
    }, []);

    // Memoize computed values
    const totalSatellitesWithVisibility = useMemo(() => 
        Object.keys(visibilityBySatellite).length, 
        [visibilityBySatellite]
    );

    // Memoize the title JSX to prevent recreation
    const titleElement = useMemo(() => (
        <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                POI Visibility
            </div>
            {totalSatellitesWithVisibility > 0 && (
                <Badge variant="secondary" className="text-xs">
                    {totalSatellitesWithVisibility} satellites
                </Badge>
            )}
        </div>
    ), [totalSatellitesWithVisibility]);

    const hasVisibilityData = Object.keys(visibilityBySatellite).length > 0;

    return (
        <Section
            title={titleElement}
            isOpen={sectionVisibility.poiVisibility}
            onToggle={() => toggleSection('poiVisibility')}
        >
            {!hasVisibilityData ? (
                <div className="text-xs text-muted-foreground py-2">
                    {currentPositions.length === 0 ? 'No satellites available' : 'No POI visibility data'}
                </div>
            ) : (
                <div className="space-y-2 pr-3">
                    {Object.entries(visibilityBySatellite).map(([satId, data]) => (
                        <SatelliteRow
                            key={satId}
                            satId={satId}
                            data={data}
                            isExpanded={!!expandedSatellites[satId]}
                            onToggleExpanded={() => toggleSatelliteExpanded(satId)}
                            satellites={satellites}
                            tracks={tracks}
                            currentTime={currentTime}
                            onSelectSchedule={onSelectSchedule}
                        />
                    ))}
                </div>
            )}
        </Section>
    );
});

POIVisibilityPanel.propTypes = {
    poiData: PropTypes.object,
    satellites: PropTypes.object.isRequired,
    currentPositions: PropTypes.array.isRequired,
    planetData: PropTypes.object,
    tracks: PropTypes.object,
    currentTime: PropTypes.number,
    onSelectSchedule: PropTypes.func
};