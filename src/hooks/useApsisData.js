/**
 * useApsisData - React Hook for Apsis Information
 * 
 * This hook provides a clean interface to apsis calculations without
 * exposing physics complexity to UI components.
 */

import { useMemo, useCallback } from 'react';
import { ApsisService } from '../services/ApsisService.js';
import { Bodies } from '../physics/PhysicsAPI.js';

/**
 * Hook for getting apsis data for a satellite
 * @param {Object} satellite - Satellite with position, velocity, centralBodyNaifId
 * @param {Date} currentTime - Current simulation time
 * @param {Object} options - Additional options
 * @returns {Object} - Apsis data and helper functions
 */
export function useApsisData(satellite, currentTime, options = {}) {
    // Get central body data
    const centralBody = useMemo(() => {
        if (!satellite?.centralBodyNaifId) return null;
        return Bodies.getByNaif(satellite.centralBodyNaifId);
    }, [satellite?.centralBodyNaifId]);

    // Calculate apsis data
    const apsisData = useMemo(() => {
        if (!satellite || !centralBody || !currentTime) {
            return null;
        }

        try {
            return ApsisService.getApsisData(satellite, centralBody, currentTime, options);
        } catch (error) {
            console.error('[useApsisData] Error calculating apsis data:', error);
            return null;
        }
    }, [satellite, centralBody, currentTime, options]);

    // Helper functions
    const getNextPeriapsisTime = useCallback(() => {
        if (!satellite || !centralBody || !currentTime) {
            return new Date(currentTime?.getTime() + 3600000); // +1 hour fallback
        }
        return ApsisService.getNextPeriapsisTime(satellite, centralBody, currentTime);
    }, [satellite, centralBody, currentTime]);

    const getNextApoapsisTime = useCallback(() => {
        if (!satellite || !centralBody || !currentTime) {
            return new Date(currentTime?.getTime() + 7200000); // +2 hours fallback
        }
        return ApsisService.getNextApoapsisTime(satellite, centralBody, currentTime);
    }, [satellite, centralBody, currentTime]);

    const getApsisAltitudes = useCallback(() => {
        if (!satellite || !centralBody) {
            return { periapsisAltitude: 0, apoapsisAltitude: 0 };
        }
        return ApsisService.getApsisAltitudes(satellite, centralBody);
    }, [satellite, centralBody]);

    const checkImpactRisk = useCallback(() => {
        if (!satellite || !centralBody) {
            return { willImpact: false };
        }
        return ApsisService.checkApsisImpact(satellite, centralBody);
    }, [satellite, centralBody]);

    return {
        // Data
        apsisData,
        centralBody,
        isLoading: !apsisData && !!(satellite && centralBody && currentTime),
        
        // Helper functions
        getNextPeriapsisTime,
        getNextApoapsisTime,
        getApsisAltitudes,
        checkImpactRisk,
        
        // Convenience accessors
        periapsisAltitude: apsisData?.periapsis?.altitude || 0,
        apoapsisAltitude: apsisData?.apoapsis?.altitude || null,
        nextPeriapsisTime: apsisData?.periapsis?.nextTime || null,
        nextApoapsisTime: apsisData?.apoapsis?.nextTime || null,
        orbitalPeriod: apsisData?.period || 0
    };
}

/**
 * Hook for managing apsis times in maneuver node context
 * Handles complex logic for chaining nodes and computing times relative to existing maneuvers
 * @param {Object} satellite - Satellite data
 * @param {Date} simulationTime - Current simulation time
 * @param {Array} nodes - Existing maneuver nodes
 * @param {number|null} selectedIndex - Currently selected node index
 * @param {boolean} isAdding - Whether adding a new node
 * @returns {Object} - Maneuver-specific apsis functions
 */
export function useManeuverApsisData(satellite, simulationTime, nodes = [], selectedIndex = null, isAdding = false) {
    const baseApsisData = useApsisData(satellite, simulationTime);

    // Compute next periapsis considering maneuver node context
    const computeNextPeriapsis = useCallback(() => {
        // If working with existing nodes, calculate based on that context
        if ((selectedIndex != null || isAdding) && nodes.length > 0) {
            const baseNodeIndex = selectedIndex != null ? selectedIndex : nodes.length - 1;
            const baseNode = nodes[baseNodeIndex]?.node3D;
            
            const baselineTime = baseNode?.executionTime || baseNode?.time;
            if (!baselineTime) {
                console.error('[useManeuverApsisData] No execution time found for base node');
                return new Date(simulationTime.getTime() + 3600 * 1000); // Default to 1 hour
            }
            
            // Add one orbital period to the baseline time
            const periodMs = (baseApsisData.orbitalPeriod || 3600) * 1000; // Convert to milliseconds
            return new Date(baselineTime.getTime() + periodMs);
        }
        
        // Use service for calculation from current satellite state
        return baseApsisData.getNextPeriapsisTime();
    }, [satellite, simulationTime, nodes, selectedIndex, isAdding, baseApsisData]);

    // Compute next apoapsis considering maneuver node context
    const computeNextApoapsis = useCallback(() => {
        // Similar logic to periapsis but add half a period more
        if ((selectedIndex != null || isAdding) && nodes.length > 0) {
            const baseNodeIndex = selectedIndex != null ? selectedIndex : nodes.length - 1;
            const baseNode = nodes[baseNodeIndex]?.node3D;
            
            const baselineTime = baseNode?.executionTime || baseNode?.time;
            if (!baselineTime) {
                console.error('[useManeuverApsisData] No execution time found for base node');
                return new Date(simulationTime.getTime() + 7200 * 1000); // Default to 2 hours
            }
            
            // Add one and a half orbital periods to get to apoapsis
            const periodMs = (baseApsisData.orbitalPeriod || 3600) * 1000;
            return new Date(baselineTime.getTime() + (periodMs * 1.5));
        }
        
        // Use service for calculation from current satellite state
        return baseApsisData.getNextApoapsisTime();
    }, [satellite, simulationTime, nodes, selectedIndex, isAdding, baseApsisData]);

    return {
        ...baseApsisData,
        
        // Maneuver-specific functions
        computeNextPeriapsis,
        computeNextApoapsis,
        
        // Convenience aliases for backward compatibility
        findNextPeriapsis: computeNextPeriapsis,
        findNextApoapsis: computeNextApoapsis
    };
}