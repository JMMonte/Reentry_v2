/**
 * usePhysicsReady.js
 * 
 * Hook that provides access to the PhysicsAPI only after it's ready,
 * preventing startup errors where React components try to access physics
 * before initialization is complete.
 */

import { useState, useEffect } from 'react';

/**
 * Hook that waits for physics API to be ready
 * @returns {Object} - { physicsAPI, isReady, error }
 */
export function usePhysicsReady() {
    const [isReady, setIsReady] = useState(false);
    const [physicsAPI, setPhysicsAPI] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let mounted = true;
        let timeoutId = null;
        
        const checkReady = async () => {
            try {
                // Check if physics API exists
                if (!window.app3d?.physicsAPI) {
                    if (mounted) {
                        // Wait a bit and try again
                        timeoutId = setTimeout(checkReady, 100);
                    }
                    return;
                }

                const api = window.app3d.physicsAPI;
                
                // If already ready, use it immediately
                if (api.isReady()) {
                    if (mounted) {
                        setPhysicsAPI(api);
                        setIsReady(true);
                        setError(null);
                    }
                    return;
                }

                // Otherwise wait for it to be ready
                await api.waitForReady();
                
                if (mounted) {
                    setPhysicsAPI(api);
                    setIsReady(true);
                    setError(null);
                }
            } catch (err) {
                console.warn('[usePhysicsReady] Error waiting for physics API:', err);
                if (mounted) {
                    setError(err);
                    setIsReady(false);
                }
            }
        };

        checkReady();

        return () => {
            mounted = false;
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, []);

    return {
        physicsAPI,
        isReady,
        error
    };
}

/**
 * Hook that provides access to physics bodies when ready
 * @returns {Array} - Array of body configurations
 */
export function usePhysicsBodies() {
    const { physicsAPI, isReady } = usePhysicsReady();
    const [bodies, setBodies] = useState([]);

    useEffect(() => {
        if (!physicsAPI || !isReady) {
            setBodies([]);
            return;
        }

        try {
            const allBodies = physicsAPI.getAllBodies();
            setBodies(allBodies);
        } catch (error) {
            console.warn('[usePhysicsBodies] Error getting bodies:', error);
            setBodies([]);
        }
    }, [physicsAPI, isReady]);

    return bodies;
}