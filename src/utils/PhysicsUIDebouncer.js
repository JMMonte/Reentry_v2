/**
 * PhysicsUIDebouncer.js
 * 
 * Specialized utilities for managing physics engine updates across UI components
 * Provides consistent debouncing patterns for real-time simulation interfaces
 */

import { debounce, throttle, rafThrottle, adaptiveDebounce } from './DebounceUtils.js';

/**
 * Standard debounce intervals for different types of physics updates
 */
export const PHYSICS_UPDATE_INTERVALS = {
    // Critical real-time data (position displays, live charts)
    REALTIME: 100,

    // Standard UI updates (tables, lists, status panels)
    STANDARD: 200,

    // Non-critical updates (statistics, summaries)
    RELAXED: 500,

    // Background processing (cache updates, analytics)
    BACKGROUND: 1000
};

/**
 * Component-specific debouncing configurations
 * Maps component types to appropriate update strategies
 */
export const COMPONENT_DEBOUNCE_CONFIG = {
    // Real-time position and tracking components
    positionDisplay: {
        interval: PHYSICS_UPDATE_INTERVALS.REALTIME,
        strategy: 'throttle' // Smooth updates for position tracking
    },

    // Ground track and orbital displays
    groundTrack: {
        interval: PHYSICS_UPDATE_INTERVALS.STANDARD,
        strategy: 'debounce' // Prevent jank from rapid updates
    },

    // Pass prediction and scheduling
    passPrediction: {
        interval: PHYSICS_UPDATE_INTERVALS.STANDARD,
        strategy: 'debounce' // Already implemented
    },

    // Visibility and communication panels
    visibility: {
        interval: PHYSICS_UPDATE_INTERVALS.STANDARD,
        strategy: 'adaptive' // Adapts to update frequency
    },

    // Debug windows and detailed displays
    debugWindow: {
        interval: PHYSICS_UPDATE_INTERVALS.REALTIME,
        strategy: 'throttle' // Smooth for debugging
    },

    // Statistics and summary components
    statistics: {
        interval: PHYSICS_UPDATE_INTERVALS.RELAXED,
        strategy: 'debounce' // Don't need frequent updates
    },

    // Charts and graphs
    charts: {
        interval: PHYSICS_UPDATE_INTERVALS.REALTIME,
        strategy: 'raf' // Smooth 60fps updates
    }
};

/**
 * Create a debounced physics event handler for a specific component type
 * @param {string} componentType - Component type from COMPONENT_DEBOUNCE_CONFIG
 * @param {Function} handler - Event handler function
 * @param {Object} customConfig - Optional custom configuration
 * @returns {Function} Debounced handler
 */
export function createPhysicsHandler(componentType, handler, customConfig = {}) {
    const config = {
        ...COMPONENT_DEBOUNCE_CONFIG[componentType],
        ...customConfig
    };

    if (!config) {
        console.warn(`Unknown component type: ${componentType}, using standard debounce`);
        return debounce(handler, PHYSICS_UPDATE_INTERVALS.STANDARD);
    }

    switch (config.strategy) {
        case 'throttle':
            return throttle(handler, config.interval);

        case 'raf':
            return rafThrottle(handler);

        case 'adaptive':
            return adaptiveDebounce(handler, {
                minDelay: config.interval / 2,
                maxDelay: config.interval * 2
            });

        case 'debounce':
        default:
            return debounce(handler, config.interval);
    }
}

/**
 * React hook for physics-based event handling with automatic debouncing
 * @param {string} componentType - Component type
 * @param {Function} handler - Event handler
 * @param {Array} deps - Dependencies for the handler
 * @param {Object} customConfig - Custom configuration
 * @returns {Function} Stable debounced handler
 */
export function usePhysicsHandler(componentType, handler, deps, customConfig = {}) {
    const { useMemo, useCallback } = React;

    // Memoize the handler to prevent recreation
    const stableHandler = useCallback(handler, deps);

    // Create debounced version
    const debouncedHandler = useMemo(() => {
        return createPhysicsHandler(componentType, stableHandler, customConfig);
    }, [componentType, stableHandler, customConfig]);

    return debouncedHandler;
}

/**
 * Global physics event manager for coordinating updates across components
 * Prevents UI from being overwhelmed by high-frequency physics updates
 */
export class PhysicsEventManager {
    constructor() {
        this.handlers = new Map(); // Map<eventType, Set<handler>>
        this.isActive = true;
    }

    /**
     * Register a component handler for physics events
     * @param {string} eventType - Physics event type
     * @param {string} componentType - Component type for debouncing config
     * @param {Function} handler - Event handler function
     * @param {string} handlerId - Unique identifier for this handler
     * @returns {Function} Cleanup function
     */
    registerHandler(eventType, componentType, handler, handlerId) {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, new Map());
        }

        // Create debounced handler
        const debouncedHandler = createPhysicsHandler(componentType, handler);

        // Store handler
        this.handlers.get(eventType).set(handlerId, {
            handler: debouncedHandler,
            componentType,
            originalHandler: handler
        });

        // Return cleanup function
        return () => {
            this.unregisterHandler(eventType, handlerId);
        };
    }

    /**
     * Unregister a component handler
     * @param {string} eventType - Physics event type
     * @param {string} handlerId - Handler identifier
     */
    unregisterHandler(eventType, handlerId) {
        const eventHandlers = this.handlers.get(eventType);
        if (eventHandlers) {
            const handlerInfo = eventHandlers.get(handlerId);
            if (handlerInfo?.handler?.cancel) {
                handlerInfo.handler.cancel();
            }
            eventHandlers.delete(handlerId);
        }
    }

    /**
     * Pause all physics event handling
     */
    pause() {
        this.isActive = false;
    }

    /**
     * Resume physics event handling
     */
    resume() {
        this.isActive = true;
    }

    cleanup() {
        this.handlers.clear();
        this.isActive = false;
    }
}

// Export singleton instance
export const physicsEventManager = new PhysicsEventManager();

/**
 * React hook for easy physics event handling with automatic cleanup
 * @param {string} eventType - Physics event type
 * @param {string} componentType - Component type for debouncing
 * @param {Function} handler - Event handler
 * @param {Array} deps - Dependencies
 * @param {string} componentId - Unique component identifier
 * @returns {Object} Status and control methods
 */
export function usePhysicsEvent(eventType, componentType, handler, deps, componentId) {
    const { useEffect, useCallback, useState } = React;
    const [isRegistered, setIsRegistered] = useState(false);

    // Create stable handler
    const stableHandler = useCallback(handler, deps);

    useEffect(() => {
        const cleanup = physicsEventManager.registerHandler(
            eventType,
            componentType,
            stableHandler,
            componentId
        );

        setIsRegistered(true);

        return () => {
            cleanup();
            setIsRegistered(false);
        };
    }, [eventType, componentType, stableHandler, componentId]);

    return {
        isRegistered,
        pause: () => physicsEventManager.pause(),
        resume: () => physicsEventManager.resume()
    };
}

// Helper function to check if React is available (for optional React features)
const React = typeof window !== 'undefined' && window.React ? window.React : null; 