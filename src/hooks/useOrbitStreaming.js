import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncePhysics } from './useDebouncePhysics.js';

/**
 * Custom hook for orbit data streaming with proper separation of concerns
 * Provides a clean interface between React components and the physics engine's orbit streaming system
 */
export function useOrbitStreaming(satellite, options = {}) {
    const [orbitData, setOrbitData] = useState({ points: [], metadata: null });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const dataRef = useRef({ lastUpdate: 0, lastDataHash: null });

    // Configuration options with defaults
    const config = {
        throttleMs: 1000,      // Throttle updates to prevent excessive re-renders
        enableFallback: true,  // Allow fallback to legacy data
        ...options
    };

    // Function to get orbit streaming data from physics engine - memoized
    const getOrbitStreamingData = useCallback(() => {
        if (!satellite?.id) return null;

        try {
            // Try primary streaming system first
            const physicsEngine = window.app3d?.physicsIntegration?.physicsEngine;
            if (physicsEngine?.satelliteEngine) {
                const streamData = physicsEngine.satelliteEngine.getOrbitStreamingData(satellite.id);
                if (streamData?.points?.length > 0) {
                    return streamData;
                }
            }

            // Fallback to legacy orbit data if streaming system doesn't have data yet
            if (config.enableFallback) {
                const legacyData = window.app3d?.orbitData?.[satellite.id];
                if (legacyData?.length > 0) {
                    return {
                        points: legacyData,
                        metadata: { source: 'legacy', satelliteId: satellite.id }
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('[useOrbitStreaming] Error accessing orbit data:', error);
            return null;
        }
    }, [satellite?.id, config.enableFallback]);

    // Function to update orbit data with change detection - memoized
    const updateOrbitData = useCallback(() => {
        const now = Date.now();
        const timeSinceLastUpdate = now - dataRef.current.lastUpdate;

        // Throttle updates to prevent excessive processing
        if (timeSinceLastUpdate < config.throttleMs && dataRef.current.lastDataHash) {
            return;
        }

        const streamData = getOrbitStreamingData();
        const newDataHash = streamData ? JSON.stringify({
            pointCount: streamData.points.length,
            lastPointTime: streamData.points[streamData.points.length - 1]?.time,
            source: streamData.metadata?.source || 'physics'
        }) : null;

        // Only update if data actually changed
        if (newDataHash === dataRef.current.lastDataHash) {
            return;
        }

        if (!streamData) {
            setError('No orbit data available');
            setIsLoading(false);
            return;
        }

        if (streamData.points?.length > 0) {
            setOrbitData(streamData);
            setError(null);
            setIsLoading(false);
            dataRef.current.lastUpdate = now;
            dataRef.current.lastDataHash = newDataHash;
        } else {
            setIsLoading(true);
            setError(null);
        }
    }, [getOrbitStreamingData, config.throttleMs]);

    // Initial data load
    useEffect(() => {
        if (!satellite?.id) return;

        setIsLoading(true);
        updateOrbitData();
    }, [satellite?.id, updateOrbitData]);

    // Debounced orbit update handler using centralized system
    const handleOrbitUpdate = useDebouncePhysics(
        'groundTrack', // Use debounced strategy for orbit streaming
        useCallback((event) => {
            if (event.detail?.satelliteId === satellite.id) {
                updateOrbitData();
            }
        }, [satellite.id, updateOrbitData]),
        [satellite.id, updateOrbitData]
    );

    // Debounced error handler
    const handleOrbitError = useDebouncePhysics(
        'groundTrack',
        useCallback((event) => {
            if (event.detail?.satelliteId === satellite.id) {
                setError(event.detail.error || 'Orbit calculation failed');
                setIsLoading(false);
            }
        }, [satellite.id]),
        [satellite.id]
    );

    // Listen for orbit stream updates from physics engine
    useEffect(() => {
        if (!satellite?.id) return;

        // Listen for physics engine events with debounced handlers
        window.addEventListener('orbitStreamUpdate', handleOrbitUpdate);
        window.addEventListener('orbitCalculationError', handleOrbitError);

        return () => {
            window.removeEventListener('orbitStreamUpdate', handleOrbitUpdate);
            window.removeEventListener('orbitCalculationError', handleOrbitError);
        };
    }, [satellite?.id, handleOrbitUpdate, handleOrbitError]);

    return {
        orbitData,
        isLoading,
        error,
        hasData: orbitData.points?.length > 0,
        source: orbitData.metadata?.source || 'unknown'
    };
}

/**
 * Hook specifically for ground track data with coordinate transformations
 */
export function useGroundTrackData(satellites, planetNaifId, options = {}) {
    const [trackData, setTrackData] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const config = {
        throttleMs: 500,
        maxPoints: 1000,
        ...options
    };

    // Get ground track data for all satellites orbiting the specified planet - memoized
    const updateTrackData = useCallback(async () => {
        if (!satellites || !planetNaifId) {
            setTrackData({});
            return;
        }

        setIsLoading(true);
        const newTrackData = {};

        try {
            // Filter satellites for the current planet
            const relevantSatellites = Object.entries(satellites).filter(
                ([, sat]) => sat.centralBodyNaifId === planetNaifId
            );

            for (const [satId] of relevantSatellites) {
                // Get orbit data from streaming system
                const physicsEngine = window.app3d?.physicsIntegration?.physicsEngine;
                if (physicsEngine?.satelliteEngine) {
                    const streamData = physicsEngine.satelliteEngine.getOrbitStreamingData(satId);
                    if (streamData?.points?.length > 0) {
                        // Limit points for performance
                        const points = streamData.points.slice(-config.maxPoints);
                        newTrackData[satId] = points;
                    }
                }
            }

            setTrackData(newTrackData);
            setError(null);
        } catch (err) {
            console.error('[useGroundTrackData] Error updating track data:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [satellites, planetNaifId, config.maxPoints]);

    // Update when satellites or planet changes
    useEffect(() => {
        updateTrackData();
    }, [updateTrackData]);

    // Debounced orbit update handler
    const handleOrbitUpdate = useDebouncePhysics(
        'groundTrack',
        useCallback((event) => {
            const { satelliteId } = event.detail;
            const satellite = satellites[satelliteId];
            
            // Only update if this satellite orbits the current planet
            if (satellite?.centralBodyNaifId === planetNaifId) {
                updateTrackData();
            }
        }, [satellites, planetNaifId, updateTrackData]),
        [satellites, planetNaifId, updateTrackData]
    );

    // Listen for orbit updates with debounced handler
    useEffect(() => {
        if (!satellites) return;

        window.addEventListener('orbitStreamUpdate', handleOrbitUpdate);

        return () => {
            window.removeEventListener('orbitStreamUpdate', handleOrbitUpdate);
        };
    }, [satellites, planetNaifId, handleOrbitUpdate]);

    return {
        trackData,
        isLoading,
        error,
        refreshData: updateTrackData
    };
} 