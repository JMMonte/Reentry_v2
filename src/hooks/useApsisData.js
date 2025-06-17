/**
 * useApsisData - React Hook for Apsis Information
 * 
 * This hook provides a clean interface to apsis calculations without
 * exposing physics complexity to UI components.
 */

import { useMemo, useCallback } from 'react';
import { ApsisService } from '../services/ApsisService.js';

/**
 * Hook for getting apsis data for a satellite
 * @param {Object} satellite - Satellite with position, velocity, centralBodyNaifId
 * @param {Date} currentTime - Current simulation time
 * @param {Object} options - Additional options
 * @returns {Object} - Apsis data and helper functions
 */
export function useApsisData(satellite, currentTime, options = {}) {
    // Get central body data via PhysicsAPI
    const centralBody = useMemo(() => {
        if (!satellite?.centralBodyNaifId) return null;
        
        // Use PhysicsAPI if available
        if (window.app3d?.physicsAPI?.isReady()) {
            return window.app3d.physicsAPI.Bodies.getByNaif(satellite.centralBodyNaifId);
        }
        
        // Fallback - try to access directly (for backwards compatibility)
        try {
            if (window.app3d?.physicsIntegration?.bodies) {
                const bodies = Array.isArray(window.app3d.physicsIntegration.bodies) 
                    ? window.app3d.physicsIntegration.bodies
                    : Object.values(window.app3d.physicsIntegration.bodies);
                
                return bodies.find(body => body.naifId === satellite.centralBodyNaifId);
            }
        } catch (error) {
            console.warn('[useApsisData] Error accessing physics bodies:', error);
        }
        
        return null;
    }, [satellite?.centralBodyNaifId]);

    // Calculate apsis data
    const apsisData = useMemo(() => {
        if (!satellite || !centralBody || !currentTime) {
            return null;
        }

        // Additional validation for satellite data structure
        if (!satellite.position || !satellite.velocity || !satellite.centralBodyNaifId) {
            console.warn('[useApsisData] Satellite missing required data:', {
                hasPosition: !!satellite.position,
                hasVelocity: !!satellite.velocity,
                hasCentralBodyNaifId: !!satellite.centralBodyNaifId
            });
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
        
        // Use existing ApsisService method - no complex numerical detection in UI layer
        return ApsisService.getNextPeriapsisTime(satellite, centralBody, currentTime);
    }, [satellite, centralBody, currentTime]);

    const getNextApoapsisTime = useCallback(() => {
        if (!satellite || !centralBody || !currentTime) {
            return new Date(currentTime?.getTime() + 7200000); // +2 hours fallback
        }
        
        // Use existing ApsisService method - no complex numerical detection in UI layer
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
export function useManeuverApsisData(satellite, simulationTime) {
    const baseApsisData = useApsisData(satellite, simulationTime);

    // Compute next periapsis considering maneuver node context
    const computeNextPeriapsis = useCallback(() => {
        // SIMPLIFIED APPROACH: Use current satellite's apsis timing to avoid jittery calculations
        // This provides stable, consistent results for maneuver planning
        return baseApsisData.getNextPeriapsisTime();
    }, [baseApsisData]);

    // Compute next apoapsis considering maneuver node context
    const computeNextApoapsis = useCallback(() => {
        // SIMPLIFIED APPROACH: Use current satellite's apsis timing to avoid jittery calculations
        // This provides stable, consistent results for maneuver planning
        return baseApsisData.getNextApoapsisTime();
    }, [baseApsisData]);

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