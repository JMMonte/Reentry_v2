import React, { createContext, useContext, useEffect, useState } from 'react';
import PropTypes from 'prop-types';

// Context for physics state
const PhysicsStateContext = createContext({ satellites: {} });

export function PhysicsStateProvider({ children }) {
    const [satellites, setSatellites] = useState({});

    useEffect(() => {
        // Handler for physics state updates (from window event or app3d)
        function handlePhysicsStateUpdate(e) {
            if (e.detail && e.detail.satellites) {
                setSatellites(e.detail.satellites);
            }
        }
        
        // Handler for individual satellite changes
        function handleSatelliteAdded(e) {
            setSatellites(prev => ({ ...prev, [e.detail.id]: e.detail }));
        }
        
        function handleSatelliteRemoved(e) {
            setSatellites(prev => {
                const newSats = { ...prev };
                delete newSats[e.detail.id];
                return newSats;
            });
        }
        
        function handleSatellitePropertyUpdated(e) {
            setSatellites(prev => ({
                ...prev,
                [e.detail.id]: { ...prev[e.detail.id], [e.detail.property]: e.detail.value }
            }));
        }
        
        window.addEventListener('physicsStateUpdate', handlePhysicsStateUpdate);
        window.addEventListener('satelliteAdded', handleSatelliteAdded);
        window.addEventListener('satelliteRemoved', handleSatelliteRemoved);
        window.addEventListener('satellitePropertyUpdated', handleSatellitePropertyUpdated);

        // Optionally: initial fetch from window.app3d or similar
        if (window.app3d?.physicsIntegration?.physicsEngine?.getSimulationState) {
            const state = window.app3d.physicsIntegration.physicsEngine.getSimulationState();
            if (state?.satellites && typeof state.satellites === 'object') {
                // Convert Map to object if needed
                const satObj = {};
                if (state.satellites instanceof Map) {
                    for (const [id, sat] of state.satellites) {
                        satObj[id] = sat;
                    }
                } else {
                    Object.assign(satObj, state.satellites);
                }
                setSatellites(satObj);
            }
        }

        return () => {
            window.removeEventListener('physicsStateUpdate', handlePhysicsStateUpdate);
            window.removeEventListener('satelliteAdded', handleSatelliteAdded);
            window.removeEventListener('satelliteRemoved', handleSatelliteRemoved);
            window.removeEventListener('satellitePropertyUpdated', handleSatellitePropertyUpdated);
        };
    }, []);

    return (
        <PhysicsStateContext.Provider value={satellites}>
            {children}
        </PhysicsStateContext.Provider>
    );
}

PhysicsStateProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

// Hook to get satellites physics state
export function usePhysicsSatellites() {
    return useContext(PhysicsStateContext);
} 