import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { PassPredictionService } from '../../../services/PassPredictionService';
import { 
    Calendar, Clock, TrendingUp, Signal, BarChart3, 
    ChevronRight, ChevronDown, AlertCircle, CheckCircle2,
    Timer, Zap, Radio
} from 'lucide-react';
import { Badge } from '../badge';
import { Button } from '../button';
import { ScrollArea } from '../scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';

export function POIPassSchedule({
    poi,
    satellite,
    satData,
    tracks,
    currentTime,
    planetData,
    onClose
}) {
    const [expandedPasses, setExpandedPasses] = useState({});
    const [selectedTab, setSelectedTab] = useState('upcoming');
    
    // Calculate all passes from track data
    const passData = useMemo(() => {
        if (!tracks || !planetData) {
            return null;
        }
        
        // Check if we have tracks for this satellite
        const satTracks = tracks[satellite.id];
        if (!satTracks || satTracks.length === 0) {
            return null;
        }
        
        const trackPoints = satTracks;
        
        // Calculate coverage radius if not provided
        let coverageRadius = satellite.coverageRadius;
        if (!coverageRadius && satellite.alt !== undefined) {
            const planetRadius = planetData.radius;
            const centralAngle = Math.acos(planetRadius / (planetRadius + satellite.alt));
            coverageRadius = centralAngle * (180 / Math.PI);
        }
        
        // If we still don't have coverage radius, we can't calculate passes
        if (!coverageRadius) {
            return null;
        }
        
        // Find all passes
        const allPasses = PassPredictionService.findPassesForPOI(
            poi,
            trackPoints,
            coverageRadius,
            planetData.radius
        );
        
        // Separate current, upcoming, and past passes
        const current = allPasses.find(pass => 
            pass.aos <= currentTime && pass.los >= currentTime
        );
        
        const upcoming = allPasses.filter(pass => pass.aos > currentTime);
        const past = allPasses.filter(pass => pass.los < currentTime);
        
        // Calculate statistics
        const timeWindow = trackPoints[trackPoints.length - 1].time - trackPoints[0].time;
        const stats = PassPredictionService.calculatePassStatistics(allPasses, timeWindow);
        
        // Find next pass
        const nextPass = PassPredictionService.findNextPass(allPasses, currentTime);
        
        // Find optimal passes
        const optimalPasses = PassPredictionService.findOptimalPasses(upcoming, {
            minElevation: 30,
            minDuration: 5
        });
        
        return {
            current,
            upcoming,
            past,
            all: allPasses,
            stats,
            nextPass,
            optimalPasses,
            timeWindow
        };
    }, [poi, satellite, tracks, currentTime, planetData]);
    
    if (!passData) {
        return (
            <div className="p-4 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>No track data available</p>
                {!satellite.alt && satellite.alt !== 0 && (
                    <p className="text-xs mt-2">Satellite altitude data is missing</p>
                )}
                {tracks && Object.keys(tracks).length > 0 && !tracks[satellite.id] && (
                    <p className="text-xs mt-2">No orbit propagation data for {satellite.name}</p>
                )}
                {(!tracks || Object.keys(tracks).length === 0) && (
                    <p className="text-xs mt-2">Waiting for orbit calculation...</p>
                )}
            </div>
        );
    }
    
    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit',
            hour12: false 
        });
    };
    
    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
        });
    };
    
    const formatDuration = (ms) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    };
    
    const formatTimeUntil = (ms) => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };
    
    const getQualityColor = (rating) => {
        switch (rating) {
            case 'Excellent': return '#22c55e';
            case 'Good': return '#84cc16';
            case 'Fair': return '#eab308';
            case 'Marginal': return '#f97316';
            default: return '#ef4444';
        }
    };
    
    const PassCard = ({ pass, isExpanded, onToggle }) => {
        const qualityColor = getQualityColor(pass.quality.rating);
        
        return (
            <div className="border rounded p-2 space-y-1">
                <button
                    onClick={onToggle}
                    className="w-full flex items-center justify-between text-xs hover:bg-accent/50 rounded p-1"
                >
                    <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{formatDate(pass.aos)}</span>
                            <span>{formatTime(pass.aos)} - {formatTime(pass.los)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge 
                            variant="outline" 
                            className="text-xs"
                            style={{ borderColor: qualityColor, color: qualityColor }}
                        >
                            {pass.quality.rating}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                            {formatDuration(pass.duration)}
                        </Badge>
                    </div>
                </button>
                
                {isExpanded && (
                    <div className="ml-5 space-y-2 text-xs text-muted-foreground">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                <span>Max Elevation: {pass.maxElevation.toFixed(1)}°</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Signal className="h-3 w-3" />
                                <span>Min Distance: {(pass.minDistance * 111).toFixed(0)} km</span>
                            </div>
                        </div>
                        
                        <div className="space-y-1">
                            <div className="font-medium">Pass Timeline:</div>
                            <div className="ml-2 space-y-0.5">
                                <div>AOS: {formatTime(pass.aos)} ({formatDate(pass.aos)})</div>
                                <div>TCA: ~{formatTime((pass.aos + pass.los) / 2)}</div>
                                <div>LOS: {formatTime(pass.los)} ({formatDate(pass.los)})</div>
                            </div>
                        </div>
                        
                        <div className="space-y-1">
                            <div className="font-medium">Communication Metrics:</div>
                            <div className="ml-2 space-y-0.5">
                                <div>Total Contact Time: {formatDuration(pass.duration)}</div>
                                <div>Usable Time (&gt;10° elev): ~{formatDuration(pass.duration * 0.7)}</div>
                                <div>Peak Quality Time (&gt;30° elev): ~{formatDuration(pass.duration * 0.4)}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };
    
    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Radio className="h-4 w-4" />
                        Pass Schedule: {poi.name || `${poi.lat.toFixed(1)}°, ${poi.lon.toFixed(1)}°`}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                        {satellite.name} {satellite.alt !== undefined && `• ${satellite.alt.toFixed(0)} km altitude`}
                    </p>
                </div>
                {onClose && (
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Close
                    </Button>
                )}
            </div>
            
            {/* Current Pass Alert */}
            {passData.current && (
                <div className="bg-green-500/10 border border-green-500/50 rounded p-2">
                    <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="font-medium">Currently Visible</span>
                        <span>• Ends in {formatTimeUntil(passData.current.los - currentTime)}</span>
                        {passData.current.maxElevation !== undefined && (
                            <span>• Max Elevation: {passData.current.maxElevation.toFixed(1)}°</span>
                        )}
                    </div>
                </div>
            )}
            
            {/* Next Pass Alert */}
            {passData.nextPass && !passData.current && (
                <div className="bg-blue-500/10 border border-blue-500/50 rounded p-2">
                    <div className="flex items-center gap-2 text-xs">
                        <Timer className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Next Pass</span>
                        <span>• In {formatTimeUntil(passData.nextPass.timeToAOS)}</span>
                        <span>• {formatTime(passData.nextPass.aos)}</span>
                        <span>• Duration: {formatDuration(passData.nextPass.duration)}</span>
                    </div>
                </div>
            )}
            
            {/* Statistics Summary */}
            <div className="grid grid-cols-3 gap-2">
                <div className="border rounded p-2 text-center">
                    <div className="text-2xl font-bold">{passData.stats.totalPasses}</div>
                    <div className="text-xs text-muted-foreground">Total Passes</div>
                </div>
                <div className="border rounded p-2 text-center">
                    <div className="text-2xl font-bold">{passData.stats.avgPassDuration.toFixed(1)}m</div>
                    <div className="text-xs text-muted-foreground">Avg Duration</div>
                </div>
                <div className="border rounded p-2 text-center">
                    <div className="text-2xl font-bold">{passData.stats.coveragePercentage.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Coverage</div>
                </div>
            </div>
            
            {/* Pass Quality Distribution */}
            <div className="border rounded p-2">
                <div className="text-xs font-medium mb-2 flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" />
                    Pass Quality Distribution
                </div>
                <div className="grid grid-cols-5 gap-1 text-xs">
                    {['Excellent', 'Good', 'Fair', 'Marginal', 'Poor'].map(rating => {
                        const count = passData.stats[`${rating.toLowerCase()}Passes`];
                        const percentage = passData.stats.totalPasses > 0 
                            ? (count / passData.stats.totalPasses * 100).toFixed(0)
                            : 0;
                        return (
                            <div key={rating} className="text-center">
                                <div 
                                    className="h-20 bg-muted rounded mb-1 relative overflow-hidden"
                                    title={`${count} passes`}
                                >
                                    <div 
                                        className="absolute bottom-0 left-0 right-0 transition-all"
                                        style={{ 
                                            height: `${percentage}%`,
                                            backgroundColor: getQualityColor(rating),
                                            opacity: 0.5
                                        }}
                                    />
                                </div>
                                <div className="text-xs">{rating}</div>
                                <div className="text-xs text-muted-foreground">{count}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {/* Pass Lists */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="upcoming" className="text-xs">
                        Upcoming ({passData.upcoming.length})
                    </TabsTrigger>
                    <TabsTrigger value="optimal" className="text-xs">
                        Optimal ({passData.optimalPasses.length})
                    </TabsTrigger>
                    <TabsTrigger value="all" className="text-xs">
                        All ({passData.all.length})
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="upcoming" className="mt-2">
                    <ScrollArea className="h-48">
                        <div className="space-y-2 pr-3">
                            {passData.upcoming.length === 0 ? (
                                <div className="text-center text-muted-foreground py-4">
                                    No upcoming passes in the current propagation window
                                </div>
                            ) : (
                                passData.upcoming.slice(0, 10).map((pass, idx) => (
                                    <PassCard
                                        key={idx}
                                        pass={pass}
                                        isExpanded={expandedPasses[`upcoming_${idx}`]}
                                        onToggle={() => setExpandedPasses(prev => ({
                                            ...prev,
                                            [`upcoming_${idx}`]: !prev[`upcoming_${idx}`]
                                        }))}
                                    />
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </TabsContent>
                
                <TabsContent value="optimal" className="mt-2">
                    <ScrollArea className="h-48">
                        <div className="space-y-2 pr-3">
                            {passData.optimalPasses.length === 0 ? (
                                <div className="text-center text-muted-foreground py-4">
                                    No optimal passes found (requires &gt;30° elevation, &gt;5min duration)
                                </div>
                            ) : (
                                <>
                                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                        <Zap className="h-3 w-3" />
                                        Best passes for data downlink operations
                                    </div>
                                    {passData.optimalPasses.map((pass, idx) => (
                                        <PassCard
                                            key={idx}
                                            pass={pass}
                                            isExpanded={expandedPasses[`optimal_${idx}`]}
                                            onToggle={() => setExpandedPasses(prev => ({
                                                ...prev,
                                                [`optimal_${idx}`]: !prev[`optimal_${idx}`]
                                            }))}
                                        />
                                    ))}
                                </>
                            )}
                        </div>
                    </ScrollArea>
                </TabsContent>
                
                <TabsContent value="all" className="mt-2">
                    <ScrollArea className="h-48">
                        <div className="space-y-2 pr-3">
                            <div className="text-xs text-muted-foreground mb-2">
                                Showing all {passData.all.length} passes in {formatDuration(passData.timeWindow)} window
                            </div>
                            {passData.all.map((pass, idx) => (
                                <PassCard
                                    key={idx}
                                    pass={pass}
                                    isExpanded={expandedPasses[`all_${idx}`]}
                                    onToggle={() => setExpandedPasses(prev => ({
                                        ...prev,
                                        [`all_${idx}`]: !prev[`all_${idx}`]
                                    }))}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                </TabsContent>
            </Tabs>
        </div>
    );
}

POIPassSchedule.propTypes = {
    poi: PropTypes.object.isRequired,
    satellite: PropTypes.object.isRequired,
    satData: PropTypes.object,
    tracks: PropTypes.object.isRequired,
    currentTime: PropTypes.number.isRequired,
    planetData: PropTypes.object.isRequired,
    onClose: PropTypes.func
};