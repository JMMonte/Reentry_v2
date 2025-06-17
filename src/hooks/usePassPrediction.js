import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { debounce } from '../utils/DebounceUtils.js';

/**
 * Hook to consume centralized pass prediction data from physics engine
 * UI components use this to get pass data without triggering calculations
 * 
 * Better architecture:
 * - Physics engine calculates passes centrally as part of update cycle
 * - UI components just consume the results
 * - No redundant calculations
 * - Consistent physics-based predictions
 */
export function usePassPrediction(poi, satellite) {
    const [passData, setPassData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Use refs to prevent unnecessary re-registrations
    const lastPoiRef = useRef(null);
    const lastSatelliteRef = useRef(null);
    const eventListenerRef = useRef(null);
    const debouncedHandlerRef = useRef(null);

    // Memoize POI ID generation to prevent recalculations
    const poiId = useMemo(() => {
        if (!poi) return null;
        return `poi_${poi.lat}_${poi.lon}_${poi.name || 'unnamed'}`;
    }, [poi?.lat, poi?.lon, poi?.name]);

    // Stable comparison function for POI changes
    const poiHasChanged = useCallback((newPoi, oldPoi) => {
        if (!newPoi && !oldPoi) return false;
        if (!newPoi || !oldPoi) return true;
        return newPoi.lat !== oldPoi.lat ||
            newPoi.lon !== oldPoi.lon ||
            newPoi.name !== oldPoi.name;
    }, []);

    // Stable comparison function for satellite changes
    const satelliteHasChanged = useCallback((newSat, oldSat) => {
        if (!newSat && !oldSat) return false;
        if (!newSat || !oldSat) return true;
        return newSat.id !== oldSat.id;
    }, []);

    // Memoized and debounced event handler to prevent rapid UI updates
    const handlePassUpdate = useCallback((event) => {
        try {
            const passEngine = event.detail.engine;
            if (passEngine && poiId && satellite?.id) {
                // Get pass data for this specific POI and satellite
                const passes = passEngine.getPassData(poiId, satellite.id);

                if (passes) {
                    // Process passes into the format expected by UI components
                    const currentTime = Date.now();
                    const processedData = processPassData(passes, currentTime);
                    setPassData(processedData);
                    setIsLoading(false);
                    setError(null);
                }
            }
        } catch (err) {
            console.error('[usePassPrediction] Error processing pass update:', err);
            setError(err.message);
            setIsLoading(false);
        }
    }, [poiId, satellite?.id]);

    // Create debounced version of the handler
    const debouncedHandlePassUpdate = useMemo(() => {
        // Debounce pass updates to prevent UI jank from rapid physics updates
        return debounce(handlePassUpdate, 200); // 200ms debounce for UI stability
    }, [handlePassUpdate]);

    // Register POI with physics engine - with proper change detection
    useEffect(() => {
        if (!poi || !window.app3d?.physicsIntegration?.physicsEngine?.passPredictionEngine) {
            return;
        }

        // Only re-register if POI actually changed
        if (!poiHasChanged(poi, lastPoiRef.current)) {
            return;
        }

        const passEngine = window.app3d.physicsIntegration.physicsEngine.passPredictionEngine;

        // Unregister previous POI if it exists
        if (lastPoiRef.current) {
            const oldPoiId = `poi_${lastPoiRef.current.lat}_${lastPoiRef.current.lon}_${lastPoiRef.current.name || 'unnamed'}`;
            passEngine.unregisterPOI(oldPoiId);
        }

        // Register new POI for pass prediction
        passEngine.registerPOI(poiId, poi);
        lastPoiRef.current = poi;

        // Cleanup - unregister POI when component unmounts or poi changes
        return () => {
            if (poiId) {
                passEngine.unregisterPOI(poiId);
            }
            lastPoiRef.current = null;
        };
    }, [poiId, poi, poiHasChanged]);

    // Listen for pass data updates from physics engine - with debounced handling
    useEffect(() => {
        if (!poiId || !satellite?.id) {
            setPassData(null);
            return;
        }

        // Only update listener if satellite changed
        if (!satelliteHasChanged(satellite, lastSatelliteRef.current) && eventListenerRef.current) {
            return;
        }

        // Remove old event listener
        if (eventListenerRef.current) {
            window.removeEventListener('passDataUpdate', eventListenerRef.current);
        }

        // Store debounced handler reference
        debouncedHandlerRef.current = debouncedHandlePassUpdate;

        // Add new debounced event listener
        window.addEventListener('passDataUpdate', debouncedHandlePassUpdate);
        eventListenerRef.current = debouncedHandlePassUpdate;
        lastSatelliteRef.current = satellite;

        // Initial data fetch - only if data doesn't exist
        if (!passData) {
            const passEngine = window.app3d?.physicsIntegration?.physicsEngine?.passPredictionEngine;
            if (passEngine) {
                const passes = passEngine.getPassData(poiId, satellite.id);
                if (passes) {
                    const currentTime = Date.now();
                    const processedData = processPassData(passes, currentTime);
                    setPassData(processedData);
                } else {
                    setIsLoading(true);
                }
            }
        }

        return () => {
            if (eventListenerRef.current) {
                window.removeEventListener('passDataUpdate', eventListenerRef.current);
                eventListenerRef.current = null;
            }
            // Cancel any pending debounced calls
            if (debouncedHandlerRef.current?.cancel) {
                debouncedHandlerRef.current.cancel();
            }
            lastSatelliteRef.current = null;
        };
    }, [poiId, satellite?.id, debouncedHandlePassUpdate, satelliteHasChanged, passData]);

    // Memoized return object to prevent recreation
    return useMemo(() => ({
        passData,
        isLoading,
        error,
        isPhysicsBased: true // Always physics-based now
    }), [passData, isLoading, error]);
}

/**
 * Process raw pass data from physics engine into UI-friendly format
 * Uses internal caching to prevent expensive recalculations
 * @param {Array} passes - Raw pass data from physics engine
 * @param {number} currentTime - Current time in milliseconds
 * @returns {Object} Processed pass data
 */
function processPassData(passes, currentTime) {
    // Static cache for the function - persists across calls
    if (!processPassData._cache) {
        processPassData._cache = new Map();
        processPassData._CACHE_TTL = 10000; // 10 seconds cache lifetime
    }

    const cache = processPassData._cache;
    const CACHE_TTL = processPassData._CACHE_TTL;

    // Create cache key
    const cacheKey = `${JSON.stringify(passes)}_${Math.floor(currentTime / 60000)}`; // Round to minute for stability

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }

    // Process data
    if (!Array.isArray(passes)) {
        const result = {
            current: null,
            upcoming: [],
            past: [],
            all: [],
            stats: { totalPasses: 0 },
            nextPass: null,
            optimalPasses: []
        };

        // Cache result
        cache.set(cacheKey, { data: result, timestamp: Date.now() });

        // Clean old cache entries (simple cleanup)
        if (cache.size > 100) {
            const oldestKeys = Array.from(cache.keys()).slice(0, 50);
            oldestKeys.forEach(key => cache.delete(key));
        }

        return result;
    }

    // Separate current, upcoming, and past passes
    const current = passes.find(pass =>
        pass.aos <= currentTime && pass.los >= currentTime
    );

    const upcoming = passes.filter(pass => pass.aos > currentTime);
    const past = passes.filter(pass => pass.los < currentTime);

    // Calculate statistics
    const stats = {
        totalPasses: passes.length,
        avgPassDuration: passes.length > 0
            ? passes.reduce((sum, pass) => sum + pass.duration, 0) / passes.length / 60000
            : 0,
        avgMaxElevation: passes.length > 0
            ? passes.reduce((sum, pass) => sum + pass.maxElevation, 0) / passes.length
            : 0,
        excellentPasses: passes.filter(p => p.quality?.rating === 'Excellent').length,
        goodPasses: passes.filter(p => p.quality?.rating === 'Good').length,
        fairPasses: passes.filter(p => p.quality?.rating === 'Fair').length,
        marginalPasses: passes.filter(p => p.quality?.rating === 'Marginal').length,
        poorPasses: passes.filter(p => p.quality?.rating === 'Poor').length
    };

    // Find next pass
    const nextPass = upcoming.length > 0 ? {
        ...upcoming[0],
        timeToAOS: upcoming[0].aos - currentTime
    } : null;

    // Find optimal passes (high elevation and good duration)
    const optimalPasses = upcoming
        .filter(pass => pass.maxElevation >= 30 && pass.duration >= 5 * 60 * 1000)
        .sort((a, b) => b.quality?.score - a.quality?.score)
        .slice(0, 5);

    const result = {
        current,
        upcoming,
        past,
        all: passes,
        stats,
        nextPass,
        optimalPasses,
        isPhysicsBased: true,
        lastUpdate: Date.now()
    };

    // Cache result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
} 