import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { PassPredictionService } from '../../../services/PassPredictionService';
import { POIVisibilityService } from '../../../services/POIVisibilityService';
import { Eye, MapPin, Radio, Satellite, ChevronDown, ChevronRight, Clock, Calendar } from 'lucide-react';
import { Badge } from '../badge';
import { Button } from '../button';

export function POIVisibilityPanel({ 
    poiData, // Legacy prop - now handled by usePOIVisibility
    satellites, 
    currentPositions,
    planetData,
    tracks,
    currentTime,
    onSelectSchedule
}) {
    const [expandedSatellites, setExpandedSatellites] = useState({});
    const [expandedCategories, setExpandedCategories] = useState({});
    
    // Calculate POI visibility directly using the working logic
    const visibilityBySatellite = useMemo(() => {
        if (!poiData || !currentPositions || currentPositions.length === 0) {
            return {};
        }

        const result = {};
        
        for (const pos of currentPositions) {
            const satellite = satellites?.[pos.id];
            if (!satellite || !pos.lat || !pos.lon || pos.alt === undefined) continue;

            // Calculate coverage radius
            const altitude = pos.alt;
            const planetRadius = planetData?.radius || 6371;
            const centralAngle = Math.acos(planetRadius / (planetRadius + altitude));
            const coverageRadius = centralAngle * (180 / Math.PI);

            const satelliteData = {
                lat: pos.lat,
                lon: pos.lon,
                alt: altitude,
                coverageRadius,
                name: satellite.name,
                id: pos.id,
                color: satellite.color || 0xffffff
            };

            // Flatten all POIs
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
                    visiblePOIs: visiblePOIs.reduce((acc, poi) => {
                        if (!acc[poi.category]) acc[poi.category] = [];
                        acc[poi.category].push(poi);
                        return acc;
                    }, {}),
                    totalCount: visiblePOIs.length
                };
            }
        }

        return result;
    }, [poiData, currentPositions, satellites, planetData]);

    const totalSatellitesWithVisibility = Object.keys(visibilityBySatellite).length;
    const isCalculating = false;
    
    
    // Section component for collapsible sections (same pattern as SatelliteDebugWindow)
    const Section = ({ title, isOpen, onToggle, children }) => {
        return (
            <div className="border-b border-border/50 last:border-0">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle();
                    }}
                    className="w-full flex items-center justify-between py-2 px-1 hover:bg-accent/5 transition-colors cursor-pointer text-left"
                >
                    {typeof title === 'string' ? (
                        <span className="text-xs font-semibold text-foreground/90">{title}</span>
                    ) : (
                        <div className="text-xs font-semibold text-foreground/90 flex-1">{title}</div>
                    )}
                    <span className="text-xs text-muted-foreground">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                    <div className="pb-2 px-1 space-y-1">
                        {children}
                    </div>
                )}
            </div>
        );
    };
    Section.propTypes = {
        title: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.node
        ]),
        isOpen: PropTypes.bool.isRequired,
        onToggle: PropTypes.func.isRequired,
        children: PropTypes.node
    };
    
    // Section visibility state
    const [sectionVisibility, setSectionVisibility] = useState({
        poiVisibility: true
    });
    
    const toggleSection = (section) => {
        setSectionVisibility(prev => ({ ...prev, [section]: !prev[section] }));
    };
    
    const categoryIcons = {
        cities: MapPin,
        airports: Radio,
        spaceports: Radio,
        groundStations: Radio,
        observatories: Eye,
        missions: MapPin
    };
    
    const categoryColors = {
        cities: '#00A5FF',
        airports: '#FF0000',
        spaceports: '#FFD700',
        groundStations: '#00FF00',
        observatories: '#FF00FF',
        missions: '#FFFF00'
    };
    
    
    const toggleSatelliteExpanded = (satId) => {
        setExpandedSatellites(prev => ({
            ...prev,
            [satId]: !prev[satId]
        }));
    };
    
    // Calculate visibility time estimates
    const getVisibilityDuration = (poi, satellite) => {
        // Simple estimate based on coverage radius and satellite motion
        // For accurate calculation, we'd need orbit propagation
        const coverageDiameter = satellite.coverageRadius * 2;
        // Estimate based on typical LEO ground speed (~7 km/s)
        const groundSpeed = 7; // km/s
        const duration = (coverageDiameter * 111) / groundSpeed; // Convert degrees to km (approx)
        return Math.round(duration / 60); // Return in minutes
    };
    
    // Estimate communication capability based on satellite parameters
    const getCommCapability = (poi, satellite, satData) => {
        // Get satellite's communication config if available
        const commsConfig = satData?.commsConfig;
        
        // Calculate slant range (distance from satellite to POI)
        const planetRadius = planetData?.radius;
        if (!planetRadius) {
            console.warn('No planet radius available for communication calculations');
            return { quality: 'Unknown', color: '#666666', distance: 'Unknown', elevation: 'Unknown' };
        }
        const satAlt = satellite.alt;
        const angle = POIVisibilityService.greatCircleDistance(
            poi.lat, poi.lon,
            satellite.lat, satellite.lon
        ) * Math.PI / 180; // Convert to radians
        
        // Elevation angle calculation using simpler formula
        const cosAngle = Math.cos(angle);
        const radiusRatio = planetRadius / (planetRadius + satAlt);
        
        // Calculate sin of elevation angle
        const sinEl = cosAngle - radiusRatio;
        
        // Check if satellite is below horizon
        let elevationAngle = 0;
        if (sinEl > 0) {
            elevationAngle = Math.asin(sinEl) * 180 / Math.PI;
        }
        
        // Law of cosines for slant range (still needed for distance)
        const slantRange = Math.sqrt(
            planetRadius * planetRadius + 
            (planetRadius + satAlt) * (planetRadius + satAlt) - 
            2 * planetRadius * (planetRadius + satAlt) * Math.cos(angle)
        );
        
        // Communication quality factors
        const factors = {
            distance: slantRange,
            elevation: elevationAngle,
            // Free space path loss (simplified - doesn't account for atmosphere)
            pathLoss: 20 * Math.log10(slantRange * 1000) + 20 * Math.log10(2400e6) - 147.55, // Assuming S-band (2.4 GHz)
        };
        
        // Estimate link quality based on elevation angle and distance
        let quality = 'Poor';
        let color = '#ff4444';
        
        if (elevationAngle > 45) {
            quality = 'Excellent';
            color = '#44ff44';
        } else if (elevationAngle > 30) {
            quality = 'Good';
            color = '#88ff88';
        } else if (elevationAngle > 15) {
            quality = 'Fair';
            color = '#ffff44';
        } else if (elevationAngle > 5) {
            quality = 'Marginal';
            color = '#ff8844';
        }
        
        // If satellite has comm config, use it to refine estimate
        if (commsConfig) {
            const dataRate = commsConfig.dataRate || 'Unknown';
            const bands = commsConfig.bands || [];
            return {
                quality,
                color,
                distance: slantRange.toFixed(0),
                elevation: elevationAngle.toFixed(1),
                dataRate,
                bands,
                pathLoss: factors.pathLoss.toFixed(1)
            };
        }
        
        return {
            quality,
            color,
            distance: slantRange.toFixed(0),
            elevation: elevationAngle.toFixed(1),
            pathLoss: factors.pathLoss.toFixed(1)
        };
    };
    
    const toggleCategoryExpanded = (satId, category) => {
        const key = `${satId}_${category}`;
        setExpandedCategories(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };
    
    return (
        <Section 
            title={
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        POI Visibility
                        {isCalculating && <span className="text-xs text-muted-foreground ml-1">calculating...</span>}
                    </div>
                    {totalSatellitesWithVisibility > 0 && (
                        <Badge variant="secondary" className="text-xs">
                            {totalSatellitesWithVisibility} satellites
                        </Badge>
                    )}
                </div>
            }
            isOpen={sectionVisibility.poiVisibility}
            onToggle={() => toggleSection('poiVisibility')}
        >
            {!visibilityBySatellite || Object.keys(visibilityBySatellite).length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">
                    {currentPositions.length === 0 ? 'No satellites available' : 
                     (isCalculating ? 'Calculating POI visibility...' : 'No POI visibility data')}
                </div>
            ) : (
                <div className="space-y-2 pr-3">
                        {Object.entries(visibilityBySatellite).map(([satId, data]) => {
                            const satColor = `#${data.satellite.color.toString(16).padStart(6, '0')}`;
                            const isExpanded = !!expandedSatellites[satId];
                            
                            return (
                                <div key={satId} className="border rounded p-1.5">
                                    <div
                                        onMouseDown={() => toggleSatelliteExpanded(satId)}
                                        className="w-full flex items-center gap-1 text-xs font-medium hover:bg-accent/50 rounded p-0.5 cursor-pointer"
                                    >
                                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                        <Satellite 
                                            className="h-3 w-3" 
                                            style={{ color: satColor }} 
                                        />
                                        <span className="flex-1 text-left">{data.satellite.name}</span>
                                        <Badge variant="outline" className="text-xs">
                                            {data.totalCount} POIs
                                        </Badge>
                                    </div>
                                    
                                    {isExpanded && (
                                        <div className="mt-1 ml-5 space-y-1">
                                            {Object.entries(data.visiblePOIs).map(([category, pois]) => {
                                                const Icon = categoryIcons[category] || MapPin;
                                                const color = categoryColors[category];
                                                const categoryKey = `${satId}_${category}`;
                                                const isCategoryExpanded = expandedCategories[categoryKey];
                                                const displayLimit = isCategoryExpanded ? pois.length : 3;
                                                
                                                return (
                                                    <div key={category} className="space-y-0.5">
                                                        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                                            <Icon className="h-2.5 w-2.5" style={{ color }} />
                                                            <span className="capitalize">{category}</span>
                                                            <span className="text-muted-foreground/70">({pois.length})</span>
                                                        </div>
                                                        <div className="ml-4 space-y-0.5">
                                                            {pois.slice(0, displayLimit).map((poi, idx) => {
                                                                const duration = getVisibilityDuration(poi, data.satellite);
                                                                const commCap = getCommCapability(poi, data.satellite, satellites[satId]);
                                                                
                                                                // Calculate next pass if we have track data
                                                                let nextPassInfo = null;
                                                                if (tracks && tracks[satId]) {
                                                                    const passes = PassPredictionService.findPassesForPOI(
                                                                        poi, 
                                                                        tracks[satId], 
                                                                        data.satellite.coverageRadius
                                                                    );
                                                                    const nextPass = PassPredictionService.findNextPass(passes, currentTime || Date.now());
                                                                    if (nextPass) {
                                                                        const timeUntil = nextPass.timeToAOS;
                                                                        const hours = Math.floor(timeUntil / 3600000);
                                                                        const minutes = Math.floor((timeUntil % 3600000) / 60000);
                                                                        nextPassInfo = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                                                                    }
                                                                }
                                                                
                                                                return (
                                                                    <div 
                                                                        key={poi.id || `${satId}_${category}_${idx}`} 
                                                                        className="space-y-0.5"
                                                                    >
                                                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                                            <span className="truncate flex-1" title={poi.name || `${poi.lat.toFixed(3)}°, ${poi.lon.toFixed(3)}°`}>
                                                                                {poi.name || `${poi.lat.toFixed(1)}°, ${poi.lon.toFixed(1)}°`}
                                                                            </span>
                                                                            <div className="flex items-center gap-2 text-xs">
                                                                                <div className="flex items-center gap-1">
                                                                                    <Clock className="h-2.5 w-2.5" />
                                                                                    <span>~{duration}m</span>
                                                                                </div>
                                                                                <Badge 
                                                                                    variant="outline" 
                                                                                    className="text-xs h-4 px-1"
                                                                                    style={{ 
                                                                                        borderColor: commCap.color,
                                                                                        color: commCap.color 
                                                                                    }}
                                                                                >
                                                                                    {commCap.quality}
                                                                                </Badge>
                                                                            </div>
                                                                        </div>
                                                                        <div className="ml-4 flex items-center justify-between text-xs text-muted-foreground/70 relative z-50">
                                                                            <div className="flex items-center gap-2">
                                                                                <span>Range: {commCap.distance}km</span>
                                                                                <span>Elev: {commCap.elevation}°</span>
                                                                                <span>Loss: {commCap.pathLoss}dB</span>
                                                                            </div>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-5 px-2 text-xs"
                                                                                onMouseDown={(e) => {
                                                                                    e.stopPropagation();
                                                                                    e.preventDefault();
                                                                                    // Create satellite object with altitude from position data
                                                                                    const satelliteWithAlt = {
                                                                                        ...satellites[satId],
                                                                                        alt: data.satellite.alt
                                                                                    };
                                                                                    onSelectSchedule(poi, satelliteWithAlt);
                                                                                }}
                                                                            >
                                                                                <Calendar className="h-3 w-3 mr-1" />
                                                                                Schedule
                                                                            </Button>
                                                                        </div>
                                                                        {nextPassInfo && (
                                                                            <div className="ml-4 text-xs text-muted-foreground/50">
                                                                                Next pass in {nextPassInfo}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                            {pois.length > 3 && (
                                                                <button
                                                                    onClick={() => toggleCategoryExpanded(satId, category)}
                                                                    className="text-xs text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1"
                                                                >
                                                                    {isCategoryExpanded ? (
                                                                        <>Show less</>
                                                                    ) : (
                                                                        <>+{pois.length - 3} more</>
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        
                        {Object.keys(visibilityBySatellite).length === 0 && (
                            <div className="text-xs text-muted-foreground text-center py-4">
                                No satellites with POI visibility
                            </div>
                        )}
                </div>
            )}
        </Section>
    );
}

POIVisibilityPanel.propTypes = {
    poiData: PropTypes.object,
    satellites: PropTypes.object.isRequired,
    currentPositions: PropTypes.array.isRequired,
    planetData: PropTypes.object,
    tracks: PropTypes.object,
    currentTime: PropTypes.number,
    onSelectSchedule: PropTypes.func
};