/**
 * usePhysicsData - React hook for accessing physics data
 * 
 * This hook provides clean access to physics data without
 * React components knowing about the physics implementation.
 */

import { useState, useEffect, useCallback } from 'react';

export function usePhysicsData() {
    const [satellites, setSatellites] = useState(new Map());
    const [bodies, setBodies] = useState(new Map());
    const [simulationTime, setSimulationTime] = useState(new Date());

    useEffect(() => {
        // Get physics API from window.app3d
        const getPhysicsAPI = () => window.app3d?.physicsAPI;
        
        let unsubscribe = null;
        let intervalId = null;

        const setupSubscription = () => {
            const physicsAPI = getPhysicsAPI();
            if (physicsAPI) {
                // Subscribe to physics updates
                unsubscribe = physicsAPI.subscribe((renderData) => {
                    // Get UI data for satellites
                    const uiData = physicsAPI.getAllSatelliteUIData();
                    setSatellites(uiData);
                    setBodies(renderData.bodies);
                    setSimulationTime(renderData.time);
                });
                
                // Clear interval once subscribed
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
            }
        };

        // Try to subscribe immediately
        setupSubscription();

        // If not ready, poll until physics API is available
        if (!unsubscribe) {
            intervalId = setInterval(setupSubscription, 100);
        }

        // Cleanup
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, []);

    /**
     * Create a new satellite
     */
    const createSatellite = useCallback(async (params) => {
        const physicsAPI = window.app3d?.physicsAPI;
        if (!physicsAPI) {
            throw new Error('Physics API not available');
        }
        
        return physicsAPI.createSatellite(params);
    }, []);

    /**
     * Delete a satellite
     */
    const deleteSatellite = useCallback((satelliteId) => {
        const physicsAPI = window.app3d?.physicsAPI;
        if (!physicsAPI) return;
        
        physicsAPI.deleteSatellite(satelliteId);
    }, []);

    /**
     * Update satellite color
     */
    const updateSatelliteColor = useCallback((satelliteId, color) => {
        const physicsAPI = window.app3d?.physicsAPI;
        if (!physicsAPI) return;
        
        physicsAPI.updateSatelliteColor(satelliteId, color);
    }, []);

    /**
     * Update satellite name
     */
    const updateSatelliteName = useCallback((satelliteId, name) => {
        const physicsAPI = window.app3d?.physicsAPI;
        if (!physicsAPI) return;
        
        physicsAPI.updateSatelliteName(satelliteId, name);
    }, []);

    /**
     * Calculate circular velocity
     */
    const calculateCircularVelocity = useCallback((altitude, centralBodyId) => {
        const physicsAPI = window.app3d?.physicsAPI;
        if (!physicsAPI) return 0;
        
        return physicsAPI.calculateCircularVelocity(altitude, centralBodyId);
    }, []);

    return {
        // Data
        satellites,
        bodies,
        simulationTime,
        
        // Actions
        createSatellite,
        deleteSatellite,
        updateSatelliteColor,
        updateSatelliteName,
        calculateCircularVelocity
    };
}

/**
 * Hook for single satellite data
 */
export function useSatelliteData(satelliteId) {
    const [satelliteData, setSatelliteData] = useState(null);

    useEffect(() => {
        if (!satelliteId) return;

        const updateData = () => {
            const physicsAPI = window.app3d?.physicsAPI;
            if (physicsAPI) {
                const data = physicsAPI.getSatelliteUIData(satelliteId);
                setSatelliteData(data);
            }
        };

        // Initial update
        updateData();

        // Subscribe to updates
        const handler = () => updateData();
        window.addEventListener('physicsUpdate', handler);

        return () => {
            window.removeEventListener('physicsUpdate', handler);
        };
    }, [satelliteId]);

    return satelliteData;
}