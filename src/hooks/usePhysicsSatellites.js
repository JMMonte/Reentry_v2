import { useEffect, useState } from 'react';

/**
 * Hook to get the latest satellite state from the PhysicsEngine.
 * @param {App3D} app3d
 * @returns {Object} satellites - Map of satelliteId -> satelliteState
 */
export function usePhysicsSatellites(app3d) {
    const [satellites, setSatellites] = useState({});

    useEffect(() => {
        if (!app3d?.physicsIntegration) return;

        // Function to update satellites from physics engine
        const updateSatellites = () => {
            const state = app3d.physicsIntegration.getSimulationState?.();
            setSatellites(state?.satellites || {});
        };

        // Update on mount and on every physics update event
        updateSatellites();
        window.addEventListener('physicsUpdate', updateSatellites);

        return () => {
            window.removeEventListener('physicsUpdate', updateSatellites);
        };
    }, [app3d]);

    return satellites;
} 