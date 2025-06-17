import React, { useState, useMemo, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import { Card, CardContent, CardHeader, CardTitle } from "../card";
import { Button } from "../button";
import { Badge } from "../badge";
import { Clock, Satellite, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import { usePassPrediction } from "@/hooks/usePassPrediction";

// Now using centralized physics-based pass prediction

// Memoized sub-components for better performance
const PassCard = React.memo(function PassCard({ pass, isExpanded, onToggle }) {
    const formatTime = useCallback((timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }, []);

    const formatDuration = useCallback((durationSeconds) => {
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = Math.floor(durationSeconds % 60);
        return `${minutes}m ${seconds}s`;
    }, []);

    const cardContent = useMemo(() => {
        if (!pass) return null;

        const { aos, los, tca, maxElevation, duration } = pass;
        const aosTime = formatTime(aos);
        const losTime = formatTime(los);
        const tcaTime = formatTime(tca);
        const maxElev = `${Math.round(maxElevation)}°`;
        const durationStr = formatDuration(duration);

        return {
            aosTime,
            losTime,
            tcaTime,
            maxElev,
            durationStr
        };
    }, [pass, formatTime, formatDuration]);

    if (!cardContent) return null;

    return (
        <Card className="mb-2">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                        {cardContent.aosTime} - {cardContent.losTime}
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggle}
                        className="h-6 w-6 p-0"
                    >
                        {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                        ) : (
                            <ChevronDown className="h-3 w-3" />
                        )}
                    </Button>
                </div>
            </CardHeader>
            {isExpanded && (
                <CardContent className="pt-0">
                    <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Max Elevation:</span>
                            <span>{cardContent.maxElev}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Duration:</span>
                            <span>{cardContent.durationStr}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">TCA:</span>
                            <span>{cardContent.tcaTime}</span>
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}, (prevProps, nextProps) => {
    // Custom comparison for better performance
    return prevProps.pass?.aos === nextProps.pass?.aos &&
        prevProps.pass?.los === nextProps.pass?.los &&
        prevProps.isExpanded === nextProps.isExpanded;
});

PassCard.displayName = 'PassCard';
PassCard.propTypes = {
    pass: PropTypes.object,
    isExpanded: PropTypes.bool,
    onToggle: PropTypes.func.isRequired
};

// Main component with full optimization
export const POIPassSchedule = React.memo(function POIPassSchedule({
    poi,
    satellite,
    onClose
}) {
    const [expandedPass, setExpandedPass] = useState(null);

    // Refs for caching expensive data processing
    const lastPassDataRef = useRef(null);
    const formattedDataRef = useRef(null);

    // Custom hook for pass prediction data with built-in optimization
    const { passData, isLoading, error } = usePassPrediction(poi, satellite);

    // Memoized formatting functions
    const formatTime = useCallback((timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }, []);

    const formatDuration = useCallback((durationSeconds) => {
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = Math.floor(durationSeconds % 60);
        return `${minutes}m ${seconds}s`;
    }, []);

    // Memoized pass card toggle handler
    const handlePassToggle = useCallback((passIndex) => {
        setExpandedPass(prev => prev === passIndex ? null : passIndex);
    }, []);

    // Memoized data processing with change detection
    const processedPassData = useMemo(() => {
        if (!passData) return null;

        // Change detection key
        const dataKey = JSON.stringify({
            current: passData.current?.aos,
            upcomingCount: passData.upcoming?.length,
            lastUpdate: passData.lastUpdate,
        });

        // Use cached result if data hasn't changed
        if (lastPassDataRef.current === dataKey && formattedDataRef.current) {
            return formattedDataRef.current;
        }

        // Process and cache
        const processed = {
            current: passData.current,
            upcoming: passData.upcoming || [],
            lastUpdate: passData.lastUpdate
        };

        lastPassDataRef.current = dataKey;
        formattedDataRef.current = processed;
        return processed;
    }, [passData, formatDuration]);

    // Memoized satellite info
    const satelliteInfo = useMemo(() => ({
        name: satellite?.name || `Satellite ${satellite?.id}`,
        id: satellite?.id
    }), [satellite?.name, satellite?.id]);

    // Memoized POI info
    const poiInfo = useMemo(() => ({
        name: poi?.name || 'Unknown POI',
        coordinates: `${poi?.lat?.toFixed(2)}°, ${poi?.lon?.toFixed(2)}°`
    }), [poi?.name, poi?.lat, poi?.lon]);

    // Render loading state
    if (isLoading) {
        return (
            <Card className="w-80">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Satellite className="h-4 w-4" />
                        Loading Pass Predictions...
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Render error state
    if (error) {
        return (
            <Card className="w-80">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                        <EyeOff className="h-4 w-4" />
                        Pass Prediction Error
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground">{error}</p>
                    <Button onClick={onClose} size="sm" className="mt-2">
                        Close
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const processedData = processedPassData;

    return (
        <Card className="w-80 max-h-96 overflow-y-auto">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Pass Schedule
                    </CardTitle>
                    <Button onClick={onClose} variant="ghost" size="sm" className="h-6 w-6 p-0">
                        ×
                    </Button>
                </div>
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                        <strong>Satellite:</strong> {satelliteInfo.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        <strong>POI:</strong> {poiInfo.name} ({poiInfo.coordinates})
                    </p>
                </div>
            </CardHeader>

            <CardContent className="space-y-2">
                {/* Current Pass */}
                {processedData?.current && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Badge variant="default" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                Current Pass
                            </Badge>
                        </div>
                        <PassCard
                            pass={processedData.current}
                            isExpanded={expandedPass === 'current'}
                            onToggle={() => handlePassToggle('current')}
                        />
                    </div>
                )}

                {/* Upcoming Passes */}
                {processedData?.upcoming?.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary" className="text-xs">
                                Upcoming ({processedData.upcoming.length})
                            </Badge>
                        </div>
                        <div className="space-y-2">
                            {processedData.upcoming.slice(0, 5).map((pass, index) => (
                                <PassCard
                                    key={`${pass.aos}-${index}`}
                                    pass={pass}
                                    isExpanded={expandedPass === index}
                                    onToggle={() => handlePassToggle(index)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {!processedData?.current && (!processedData?.upcoming || processedData.upcoming.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                        No passes predicted for this POI and satellite combination.
                    </p>
                )}

                {processedData?.lastUpdate && (
                    <p className="text-xs text-muted-foreground text-center border-t pt-2">
                        Last updated: {formatTime(processedData.lastUpdate)}
                    </p>
                )}
            </CardContent>
        </Card>
    );
});

POIPassSchedule.displayName = 'POIPassSchedule';
POIPassSchedule.propTypes = {
    poi: PropTypes.shape({
        name: PropTypes.string,
        lat: PropTypes.number.isRequired,
        lon: PropTypes.number.isRequired,
    }).isRequired,
    satellite: PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string,
    }).isRequired,
    onClose: PropTypes.func.isRequired,
};