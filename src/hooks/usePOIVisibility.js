/**
 * usePOIVisibility.js
 * 
 * React hook for POI visibility calculations using the optimized POIDataService.
 * Provides clean separation between physics calculations and React state management.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { POIVisibilityService } from '../services/POIVisibilityService.js';

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
            // Get POI data from planet surface
            const poiData = {};
            if (planetData?.surface?.points) {
                Object.entries(planetData.surface.points).forEach(([category, data]) => {
                    if (Array.isArray(data)) {
                        poiData[category] = data.map(item => {
                            if (item.userData?.feature) {
                                const feat = item.userData.feature;
                                const [lon, lat] = feat.geometry.coordinates;
                                return {
                                    lat,
                                    lon,
                                    name: feat.properties?.name || feat.properties?.NAME || feat.properties?.scalerank
                                };
                            }
                            return null;
                        }).filter(Boolean);
                    }
                });
            }

            // Calculate visibility using the working logic from externalApi
            const visibilityResult = {};
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
                    id: pos.id
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

                // Find visible POIs using the working service
                const visiblePOIs = POIVisibilityService.getVisiblePOIs(allPOIs, satelliteData);
                
                console.log(`Satellite ${pos.id}: ${allPOIs.length} POIs, ${visiblePOIs.length} visible`);
                
                if (visiblePOIs.length > 0) {
                    visibilityResult[pos.id] = {
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