/**
 * useDebouncePhysics.js
 * 
 * React hook for easy physics event debouncing across all UI components
 * Provides consistent performance optimization for real-time simulation interfaces
 */

import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { createPhysicsHandler, physicsEventManager } from '../utils/PhysicsUIDebouncer.js';

/**
 * React hook for debounced physics event handling
 * @param {string} componentType - Component type (e.g., 'positionDisplay', 'groundTrack')
 * @param {Function} handler - Event handler function
 * @param {Array} deps - Dependencies for the handler
 * @param {Object} customConfig - Optional custom debouncing configuration
 * @returns {Function} Debounced handler function
 */
export function useDebouncePhysics(componentType, handler, deps, customConfig = {}) {
    // Create stable handler reference
    const stableHandler = useCallback(handler, deps);

    // Create debounced version using physics-specific configuration
    const debouncedHandler = useMemo(() => {
        return createPhysicsHandler(componentType, stableHandler, customConfig);
    }, [componentType, stableHandler, customConfig]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debouncedHandler.cancel) {
                debouncedHandler.cancel();
            }
        };
    }, [debouncedHandler]);

    return debouncedHandler;
}

/**
 * React hook for physics event subscription with automatic debouncing
 * @param {string} eventType - Physics event type (e.g., 'satellitePositionUpdate')
 * @param {string} componentType - Component type for debouncing strategy
 * @param {Function} handler - Event handler function
 * @param {Array} deps - Dependencies for the handler
 * @param {boolean} enabled - Whether the subscription is enabled
 * @returns {Object} Subscription status and controls
 */
export function usePhysicsEvent(eventType, componentType, handler, deps, enabled = true) {
    const componentIdRef = useRef(`${componentType}-${Math.random().toString(36).substr(2, 9)}`);
    const [isSubscribed, setIsSubscribed] = useState(false);

    // Create stable handler
    const stableHandler = useCallback(handler, deps);

    useEffect(() => {
        if (!enabled) {
            setIsSubscribed(false);
            return;
        }

        // Register with physics event manager
        const cleanup = physicsEventManager.registerHandler(
            eventType,
            componentType,
            stableHandler,
            componentIdRef.current
        );

        setIsSubscribed(true);

        return () => {
            cleanup();
            setIsSubscribed(false);
        };
    }, [eventType, componentType, stableHandler, enabled]);

    return {
        isSubscribed,
        componentId: componentIdRef.current
    };
}

/**
 * React hook for orbit data updates with physics-based debouncing
 * Specialized for satellite position, velocity, and orbital element updates
 * @param {Function} onUpdate - Update handler function
 * @param {Array} deps - Dependencies for the handler
 * @param {Object} options - Configuration options
 * @returns {Object} Orbit subscription controls
 */
export function useOrbitUpdates(onUpdate, deps, options = {}) {
    const {
        componentType = 'positionDisplay',
        satelliteId = null,
        enabled = true
    } = options;

    // Create satellite-specific event handler
    const handleOrbitUpdate = useCallback((event) => {
        // Filter by satellite ID if specified
        if (satelliteId && event.detail?.satelliteId !== satelliteId) {
            return;
        }

        onUpdate(event.detail);
    }, [onUpdate, satelliteId]);

    // Subscribe to orbit updates with physics debouncing
    const subscription = usePhysicsEvent(
        'orbitUpdate',
        componentType,
        handleOrbitUpdate,
        deps,
        enabled
    );

    return subscription;
}

/**
 * React hook for pass prediction updates with specialized debouncing
 * @param {Object} poi - Point of interest
 * @param {Object} satellite - Satellite object
 * @param {Function} onUpdate - Update handler function
 * @param {Array} deps - Dependencies for the handler
 * @param {boolean} enabled - Whether updates are enabled
 * @returns {Object} Pass prediction subscription
 */
export function usePassPredictionUpdates(poi, satellite, onUpdate, deps, enabled = true) {
    // Create POI-satellite specific handler
    const handlePassUpdate = useCallback((event) => {
        const { poiData, satelliteData } = event.detail || {};

        // Filter for this specific POI-satellite combination
        if (!poiData || !satelliteData) return;
        if (satelliteData.id !== satellite?.id) return;
        if (Math.abs(poiData.lat - poi?.lat) > 0.001 || Math.abs(poiData.lon - poi?.lon) > 0.001) return;

        onUpdate(event.detail);
    }, [onUpdate, poi, satellite, ...deps]);

    // Subscribe with pass prediction specific debouncing
    const subscription = usePhysicsEvent(
        'passUpdate',
        'passPrediction',
        handlePassUpdate,
        [handlePassUpdate],
        enabled && poi && satellite
    );

    return subscription;
}

/**
 * React hook for debug window updates with real-time debouncing
 * @param {string} debugType - Type of debug data (e.g., 'orbital', 'position', 'forces')
 * @param {Function} onUpdate - Update handler function
 * @param {Array} deps - Dependencies for the handler
 * @param {boolean} enabled - Whether updates are enabled
 * @returns {Object} Debug subscription controls
 */
export function useDebugUpdates(debugType, onUpdate, deps, enabled = true) {
    // Create debug-specific handler
    const handleDebugUpdate = useCallback((event) => {
        const { type, data } = event.detail || {};

        // Filter by debug type
        if (type !== debugType) return;

        onUpdate(data);
    }, [onUpdate, debugType, ...deps]);

    // Subscribe with debug window specific debouncing (real-time throttling)
    const subscription = usePhysicsEvent(
        'debugUpdate',
        'debugWindow',
        handleDebugUpdate,
        [handleDebugUpdate],
        enabled
    );

    return subscription;
}

/**
 * React hook for statistics updates with relaxed debouncing
 * @param {Function} onUpdate - Update handler function
 * @param {Array} deps - Dependencies for the handler
 * @param {boolean} enabled - Whether updates are enabled
 * @returns {Object} Statistics subscription controls
 */
export function useStatisticsUpdates(onUpdate, deps, enabled = true) {
    // Create statistics handler
    const handleStatsUpdate = useCallback((event) => {
        onUpdate(event.detail);
    }, [onUpdate, ...deps]);

    // Subscribe with statistics specific debouncing (relaxed timing)
    const subscription = usePhysicsEvent(
        'statisticsUpdate',
        'statistics',
        handleStatsUpdate,
        [handleStatsUpdate],
        enabled
    );

    return subscription;
} 