/**
 * usePhysicsBodies - React hook for accessing physics bodies data
 * 
 * This hook provides clean access to celestial bodies data for orbit propagation
 * without React components directly accessing the physics engine.
 * 
 * It follows the proper data flow pattern:
 * PhysicsEngine -> Event System -> React Hook -> UI Component
 */

import { useState, useEffect, useRef } from 'react';

export function usePhysicsBodies() {
    const [bodies, setBodies] = useState([]);
    const [loading, setLoading] = useState(true);
    const attemptCountRef = useRef(0);

    useEffect(() => {
        let cleanup = false;

        const updateBodies = () => {
            // Access physics engine through the integration layer
            // This maintains separation while providing access to physics data
            if (window.app3d?.physicsIntegration?.physicsEngine) {
                try {
                    const bodiesData = window.app3d.physicsIntegration.physicsEngine.getBodiesForOrbitPropagation();
                    if (!cleanup && bodiesData) {
                        setBodies(bodiesData);
                        setLoading(false);
                    }
                } catch (error) {
                    console.warn('Failed to get physics bodies:', error);
                }
            }
        };

        // Initial update
        updateBodies();

        // Listen for physics updates via events (proper separation)
        const handlePhysicsUpdate = (event) => {
            if (!cleanup) {
                // If event contains bodies data, use it directly
                if (event.detail?.bodies) {
                    setBodies(event.detail.bodies);
                    setLoading(false);
                } else {
                    // Otherwise fetch the latest data
                    updateBodies();
                }
            }
        };

        // Listen to custom events dispatched by the physics system
        window.addEventListener('physicsStateUpdate', handlePhysicsUpdate);
        window.addEventListener('celestialBodiesUpdate', handlePhysicsUpdate);
        window.addEventListener('bodiesForOrbitPropagation', handlePhysicsUpdate);

        // Poll for initial availability with backoff
        let intervalId = null;
        if (loading) {
            const pollInterval = Math.min(100 * Math.pow(1.5, attemptCountRef.current), 1000);
            intervalId = setInterval(() => {
                attemptCountRef.current++;
                if (window.app3d?.physicsIntegration?.physicsEngine) {
                    updateBodies();
                    if (!loading) {
                        clearInterval(intervalId);
                        attemptCountRef.current = 0;
                    }
                }
                // Stop polling after 30 attempts (~10 seconds with backoff)
                if (attemptCountRef.current > 30) {
                    clearInterval(intervalId);
                    console.warn('Physics engine not available after timeout');
                }
            }, pollInterval);
        }

        return () => {
            cleanup = true;
            window.removeEventListener('physicsStateUpdate', handlePhysicsUpdate);
            window.removeEventListener('celestialBodiesUpdate', handlePhysicsUpdate);
            window.removeEventListener('bodiesForOrbitPropagation', handlePhysicsUpdate);
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [loading]);

    return { bodies, loading };
}