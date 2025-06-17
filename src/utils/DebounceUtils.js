/**
 * DebounceUtils.js
 * 
 * Utility functions for debouncing and throttling to improve UI performance
 * Especially important for physics-based real-time updates
 */

/**
 * Debounce function - delays execution until after wait milliseconds have elapsed
 * since the last time the function was invoked
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @param {boolean} immediate - Execute immediately on first call
 * @returns {Function} Debounced function
 */
export function debounce(func, wait, immediate = false) {
    let timeout;
    
    const debouncedFunction = function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(this, args);
        };
        
        const callNow = immediate && !timeout;
        
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        
        if (callNow) func.apply(this, args);
    };

    // Add cancel method to the debounced function
    debouncedFunction.cancel = function() {
        clearTimeout(timeout);
        timeout = null;
    };

    return debouncedFunction;
}

/**
 * Throttle function - limits function calls to at most once per specified interval
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Debounced event listener utility for React components
 * Automatically handles cleanup and provides stable references
 * @param {Function} handler - Event handler function
 * @param {number} delay - Debounce delay in milliseconds
 * @param {Array} deps - Dependencies for the handler (like useCallback deps)
 * @returns {Function} Stable debounced handler
 */
export function useDebouncedHandler(handler, delay) {
    // This would typically use React hooks, but keeping as utility for now
    // Components can use this with useCallback and useEffect
    return debounce(handler, delay);
}

/**
 * Create a debounced version of an event emitter/dispatcher
 * Useful for batching multiple rapid events into single updates
 * @param {Function} emitFunction - Function that emits/dispatches events
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Object} Debounced emitter with batch capability
 */
export function createDebouncedEmitter(emitFunction, delay = 100) {
    const pendingEvents = new Map();
    
    const debouncedEmit = debounce(() => {
        // Emit all pending events as a batch
        const events = Array.from(pendingEvents.values());
        pendingEvents.clear();
        
        if (events.length > 0) {
            emitFunction({
                type: 'batch',
                events,
                timestamp: Date.now()
            });
        }
    }, delay);
    
    return {
        emit(eventType, data) {
            // Store event in pending map (overwrites if same type)
            pendingEvents.set(eventType, {
                type: eventType,
                data,
                timestamp: Date.now()
            });
            
            // Trigger debounced emit
            debouncedEmit();
        },
        
        emitImmediate(eventType, data) {
            // Bypass debouncing for critical events
            emitFunction({
                type: eventType,
                data,
                timestamp: Date.now()
            });
        },
        
        flush() {
            // Force immediate emission of pending events
            if (pendingEvents.size > 0) {
                const events = Array.from(pendingEvents.values());
                pendingEvents.clear();
                emitFunction({
                    type: 'batch',
                    events,
                    timestamp: Date.now()
                });
            }
        },
        
        clear() {
            // Clear all pending events
            pendingEvents.clear();
        }
    };
}

/**
 * Animation frame-based throttling for smooth 60fps updates
 * @param {Function} func - Function to throttle to animation frames
 * @returns {Function} Animation frame throttled function
 */
export function rafThrottle(func) {
    let requestId = null;
    let lastArgs = null;
    
    const throttledFunc = (...args) => {
        lastArgs = args;
        
        if (requestId === null) {
            requestId = requestAnimationFrame(() => {
                func.apply(this, lastArgs);
                requestId = null;
                lastArgs = null;
            });
        }
    };
    
    throttledFunc.cancel = () => {
        if (requestId !== null) {
            cancelAnimationFrame(requestId);
            requestId = null;
            lastArgs = null;
        }
    };
    
    return throttledFunc;
}

/**
 * Smart debouncing that adapts delay based on frequency of calls
 * Shorter delays for frequent updates, longer for infrequent ones
 * @param {Function} func - Function to debounce
 * @param {Object} options - Configuration options
 * @returns {Function} Adaptive debounced function
 */
export function adaptiveDebounce(func, options = {}) {
    const {
        minDelay = 50,
        maxDelay = 500,
        frequencyThreshold = 10, // calls per second to trigger adaptive behavior
        adaptationFactor = 0.8
    } = options;
    
    let callCount = 0;
    let lastResetTime = Date.now();
    let currentDelay = minDelay;
    let timeout = null;
    
    return function executedFunction(...args) {
        const now = Date.now();
        callCount++;
        
        // Reset counter every second
        if (now - lastResetTime > 1000) {
            const frequency = callCount / ((now - lastResetTime) / 1000);
            
            // Adapt delay based on frequency
            if (frequency > frequencyThreshold) {
                currentDelay = Math.max(minDelay, currentDelay * adaptationFactor);
            } else {
                currentDelay = Math.min(maxDelay, currentDelay / adaptationFactor);
            }
            
            callCount = 0;
            lastResetTime = now;
        }
        
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, currentDelay);
    };
} 