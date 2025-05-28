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
        window.addEventListener('physicsStateUpdate', handlePhysicsStateUpdate);

        // Optionally: initial fetch from window.app3d or similar
        if (window.app3d?.physicsIntegration?.physicsEngine?.getSatellitesState) {
            const initial = window.app3d.physicsIntegration.physicsEngine.getSatellitesState();
            if (initial && typeof initial === 'object') {
                setSatellites(initial);
            }
        }

        return () => {
            window.removeEventListener('physicsStateUpdate', handlePhysicsStateUpdate);
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