/**
 * SatellitePositionDisplay.jsx
 * 
 * Optimized real-time satellite position display component
 * Demonstrates the complete optimization stack: memoization + refs + debouncing
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { Badge } from '../badge';
import { Satellite, Globe, Zap, Activity } from 'lucide-react';
import { useOrbitUpdates } from '@/hooks/useDebouncePhysics';
import { formatNumber } from '@/utils/numberUtils';

// Memoized position data row component
const PositionRow = React.memo(({ label, value, unit = '', precision = 3, icon: Icon }) => (
    <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
            {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <span className="text-xs font-mono">
            {typeof value === 'number' ? formatNumber(value, precision) : value}
            {unit && <span className="text-muted-foreground ml-1">{unit}</span>}
        </span>
    </div>
), (prevProps, nextProps) => {
    // Custom comparison for better performance
    return prevProps.label === nextProps.label &&
        prevProps.value === nextProps.value &&
        prevProps.unit === nextProps.unit &&
        prevProps.precision === nextProps.precision;
});

PositionRow.displayName = 'PositionRow';
PositionRow.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    unit: PropTypes.string,
    precision: PropTypes.number,
    icon: PropTypes.elementType
};

// Main component with full optimization stack
export const SatellitePositionDisplay = React.memo(function SatellitePositionDisplay({
    satellite,
    showVelocity = true,
    showAltitude = true,
    updateInterval = 100, // 100ms for smooth position updates
    className = ''
}) {
    // Refs for expensive calculations and caching
    const lastPositionRef = useRef(null);
    const lastVelocityRef = useRef(null);
    const calculationCacheRef = useRef({});
    const lastUpdateTimeRef = useRef(0);

    // State for position data
    const [positionData, setPositionData] = useState({
        lat: null,
        lon: null,
        alt: null,
        velocity: null,
        speed: null,
        groundSpeed: null,
        lastUpdate: null
    });

    // Memoized satellite info to prevent recreations
    const satelliteInfo = useMemo(() => ({
        id: satellite?.id,
        name: satellite?.name || `Satellite ${satellite?.id}`,
        color: satellite?.color || 0xffffff,
        centralBodyId: satellite?.centralBodyNaifId
    }), [satellite?.id, satellite?.name, satellite?.color, satellite?.centralBodyNaifId]);

    // Debounced position update handler with caching
    const handlePositionUpdate = useCallback((orbitData) => {
        const now = performance.now();

        // Skip if update is too frequent (additional throttling on top of debouncing)
        if (now - lastUpdateTimeRef.current < updateInterval / 2) {
            return;
        }
        lastUpdateTimeRef.current = now;

        // Extract position data with fallbacks
        const lat = orbitData.latitude ?? orbitData.lat;
        const lon = orbitData.longitude ?? orbitData.lon;
        const alt = orbitData.altitude_surface ?? orbitData.alt;
        const velocity = orbitData.velocity;
        const groundSpeed = orbitData.ground_track_velocity;

        // Check if position has changed significantly to prevent unnecessary updates
        const posChanged = (
            !lastPositionRef.current ||
            Math.abs(lat - lastPositionRef.current.lat) > 0.001 ||
            Math.abs(lon - lastPositionRef.current.lon) > 0.001 ||
            Math.abs(alt - lastPositionRef.current.alt) > 0.1
        );

        const velChanged = (
            !lastVelocityRef.current ||
            (velocity && (!lastVelocityRef.current.velocity ||
                Math.abs(velocity[0] - lastVelocityRef.current.velocity[0]) > 0.001))
        );

        if (posChanged || velChanged) {
            // Calculate derived values with caching
            let speed = calculationCacheRef.current.speed;
            if (velocity && velChanged) {
                speed = Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2);
                calculationCacheRef.current.speed = speed;
            }

            // Update state
            setPositionData({
                lat,
                lon,
                alt,
                velocity,
                speed,
                groundSpeed,
                lastUpdate: now
            });

            // Cache for next comparison
            lastPositionRef.current = { lat, lon, alt };
            if (velocity) {
                lastVelocityRef.current = { velocity };
            }
        }
    }, [updateInterval]);

    // Subscribe to orbit updates with physics-based debouncing
    useOrbitUpdates(
        handlePositionUpdate,
        [handlePositionUpdate],
        {
            componentType: 'positionDisplay', // Uses 100ms throttle strategy
            satelliteId: satelliteInfo.id,
            enabled: !!satelliteInfo.id
        }
    );

    // Memoized display values with formatting
    const displayValues = useMemo(() => {
        const { lat, lon, alt, speed, groundSpeed, lastUpdate } = positionData;

        // Check data freshness
        const isStale = lastUpdate && (performance.now() - lastUpdate) > 5000; // 5 seconds

        return {
            position: {
                lat: lat !== null ? lat : 'N/A',
                lon: lon !== null ? lon : 'N/A',
                alt: alt !== null ? alt : 'N/A'
            },
            velocity: {
                speed: speed !== null ? speed : 'N/A',
                groundSpeed: groundSpeed !== null ? groundSpeed * 3600 : 'N/A' // Convert to km/h
            },
            status: {
                isStale,
                hasPosition: lat !== null && lon !== null,
                hasVelocity: speed !== null,
                lastUpdate: lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 'Never'
            }
        };
    }, [positionData]);

    // Memoized status badge
    const statusBadge = useMemo(() => {
        const { isStale, hasPosition } = displayValues.status;

        if (isStale) {
            return <Badge variant="destructive" className="text-xs">Stale</Badge>;
        } else if (hasPosition) {
            return <Badge variant="default" className="text-xs">Live</Badge>;
        } else {
            return <Badge variant="secondary" className="text-xs">Waiting</Badge>;
        }
    }, [displayValues.status]);

    // Memoized coordinate display
    const coordinateDisplay = useMemo(() => {
        const { lat, lon } = displayValues.position;

        if (lat === 'N/A' || lon === 'N/A') {
            return 'Position unavailable';
        }

        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';

        return `${Math.abs(lat).toFixed(3)}°${latDir}, ${Math.abs(lon).toFixed(3)}°${lonDir}`;
    }, [displayValues.position]);

    return (
        <Card className={`w-full max-w-sm ${className}`}>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Satellite className="h-4 w-4" />
                        <span className="truncate">{satelliteInfo.name}</span>
                    </div>
                    {statusBadge}
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
                {/* Position Section */}
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        Position
                    </div>

                    <div className="pl-5 space-y-1">
                        <div className="text-xs font-mono">
                            {coordinateDisplay}
                        </div>

                        {showAltitude && (
                            <PositionRow
                                label="Altitude"
                                value={displayValues.position.alt}
                                unit="km"
                                precision={1}
                            />
                        )}
                    </div>
                </div>

                {/* Velocity Section */}
                {showVelocity && (
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Zap className="h-3 w-3" />
                            Velocity
                        </div>

                        <div className="pl-5 space-y-1">
                            <PositionRow
                                label="Orbital Speed"
                                value={displayValues.velocity.speed}
                                unit="km/s"
                                precision={2}
                            />

                            <PositionRow
                                label="Ground Speed"
                                value={displayValues.velocity.groundSpeed}
                                unit="km/h"
                                precision={0}
                            />
                        </div>
                    </div>
                )}

                {/* Status Section */}
                <div className="pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            <span>Last Update</span>
                        </div>
                        <span>{displayValues.status.lastUpdate}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
});

SatellitePositionDisplay.propTypes = {
    satellite: PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string,
        color: PropTypes.number,
        centralBodyNaifId: PropTypes.number
    }).isRequired,
    showVelocity: PropTypes.bool,
    showAltitude: PropTypes.bool,
    updateInterval: PropTypes.number,
    className: PropTypes.string
};

export default SatellitePositionDisplay; 