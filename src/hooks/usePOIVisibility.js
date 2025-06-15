/**
 * usePOIVisibility.js
 * 
 * React hook for POI visibility calculations using the optimized POIDataService.
 * Provides clean separation between physics calculations and React state management.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { POIDataService } from '../services/POIDataService.js';

// Worker is created lazily; using ES-module worker so bundlers (Vite) can include it.
// Keep path relative to this file.
const createVisibilityWorker = () =>
    new Worker(new URL('../physics/workers/poiVisibilityWorker.js', import.meta.url), {
        type: 'module'
    });

/**
 * Hook for calculating POI visibility with optimized performance
 * @param {Array} satellites - Array of satellite objects
 * @param {Array} currentPositions - Current satellite positions
 * @param {Object} planetData - Planet data for calculations
 * @param {number} planetId - Planet NAIF ID (default: 399 for Earth)
 * @param {Object} options - Configuration options
 * @returns {Object} Visibility data and utility functions
 */
export function usePOIVisibility(satellites, currentPositions, planetData, planetId = 399, options = {}) {
    // State for visibility results
    const [visibilityData, setVisibilityData] = useState({});
    const [isCalculating, setIsCalculating] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);

    // Configuration
    const {
        updateInterval = 1000, // Minimum time between updates (ms)
        enabled = true
    } = options;

    // Refs for performance optimization
    const lastUpdateTime = useRef(0);
    const updateTimeoutRef = useRef(null);
    const lastPositionsHash = useRef('');
    const workerRef = useRef(null);
    const nextRequestId = useRef(0);

    /**
     * Create a hash of satellite positions to detect changes
     */
    const createPositionsHash = useCallback((positions) => {
        if (!positions || positions.length === 0) return '';
        
        return positions
            .map(pos => `${pos.id}_${Math.round(pos.lat * 100)}_${Math.round(pos.lon * 100)}_${Math.round(pos.alt)}`)
            .sort()
            .join('|');
    }, []);

    /**
     * Calculate visibility data
     */
    const calculateVisibility = useCallback(async () => {
        if (!enabled || !currentPositions || currentPositions.length === 0) {
            setVisibilityData({});
            return;
        }

        const currentTime = Date.now();
        
        // Throttle updates
        if (currentTime - lastUpdateTime.current < updateInterval) {
            return;
        }

        // Check if positions actually changed
        const positionsHash = createPositionsHash(currentPositions);
        if (positionsHash === lastPositionsHash.current && Object.keys(visibilityData).length > 0) {
            return;
        }

        setIsCalculating(true);

        try {
            // Build satellites array expected by the services/worker
            const satArray = (currentPositions || []).map(pos => {
                const satInfo = satellites?.[pos.id] || {};
                return {
                    id: pos.id,
                    lat: pos.lat,
                    lon: pos.lon,
                    alt: pos.alt,
                    name: satInfo.name,
                    color: satInfo.color
                };
            });

            // Decide whether to off-load to worker based on workload size
            const poiCount = POIDataService.getAllPOIs(planetId).length;
            const workload = poiCount * satArray.length; // rough measure
            const OFFLOAD_THRESHOLD = 100_000; // tuned experimentally

            let visibilityResult;

            if (workload > OFFLOAD_THRESHOLD && workerRef.current) {
                // Use worker path
                visibilityResult = await new Promise((resolve, reject) => {
                    const requestId = nextRequestId.current++;

                    const handleMessage = (e) => {
                        const { type, data } = e.data;
                        if (type === 'VISIBILITY_RESULT' && data.requestId === requestId) {
                            workerRef.current.removeEventListener('message', handleMessage);
                            resolve(data.result);
                        } else if (type === 'VISIBILITY_ERROR' && data.requestId === requestId) {
                            workerRef.current.removeEventListener('message', handleMessage);
                            reject(new Error(data.error));
                        }
                    };

                    workerRef.current.addEventListener('message', handleMessage);

                    workerRef.current.postMessage({
                        type: 'CALCULATE_VISIBILITY',
                        data: {
                            requestId,
                            satellites: satArray,
                            pois: POIDataService.getAllPOIs(planetId)
                        }
                    });
                });
            } else {
                // Fast path – compute synchronously with spatial cache
                visibilityResult = POIDataService.calculateVisibility(satArray, planetId, planetData);
            }

            setVisibilityData(visibilityResult);

            setLastUpdate(currentTime);
            lastUpdateTime.current = currentTime;
            lastPositionsHash.current = positionsHash;

        } catch (error) {
            console.error('[usePOIVisibility] Error calculating visibility:', error);
            setVisibilityData({});
        } finally {
            setIsCalculating(false);
        }
    }, [enabled, currentPositions, satellites, planetData, planetId, updateInterval, createPositionsHash]);

    /**
     * Debounced update function
     */
    const debouncedUpdate = useCallback(() => {
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }

        updateTimeoutRef.current = setTimeout(() => {
            calculateVisibility();
        }, 100); // Small debounce to avoid excessive updates
    }, [calculateVisibility]);

    // Effect to trigger updates when data changes
    useEffect(() => {
        debouncedUpdate();
        
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, [debouncedUpdate]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, []);

    // Initialise worker once – cleaned up on unmount
    useEffect(() => {
        workerRef.current = createVisibilityWorker();
        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

    /**
     * Force update visibility calculations
     */
    const forceUpdate = useCallback(() => {
        lastUpdateTime.current = 0;
        lastPositionsHash.current = '';
        calculateVisibility();
    }, [calculateVisibility]);

    return {
        // Core data
        visibilityData,
        
        // State
        isCalculating,
        lastUpdate,
        
        // Utility functions
        forceUpdate,
        
        // Statistics
        totalSatellitesWithVisibility: Object.keys(visibilityData).length,
        totalVisiblePOIs: Object.values(visibilityData).reduce((sum, data) => sum + (data.totalCount || 0), 0)
    };
}