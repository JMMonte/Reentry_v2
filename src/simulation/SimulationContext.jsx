import React, { createContext, useContext, useState } from 'react';
import PropTypes from 'prop-types';

export const SimulationContext = createContext();

/**
 * Provider for simulation-wide settings and utilities.
 * @param {{ timeUtils: Object, displaySettings: Object, simulatedTime: Date, timeWarp: number, children: React.ReactNode }} props
 */
export function SimulationProvider({ children, ...props }) {
    const [sessionId, setSessionId] = useState(null);
    const value = { sessionId, setSessionId, ...props };
    return (
        <SimulationContext.Provider value={value}>
            {children}
        </SimulationContext.Provider>
    );
}

SimulationProvider.propTypes = {
    timeUtils: PropTypes.object.isRequired,
    displaySettings: PropTypes.object.isRequired,
    simulatedTime: PropTypes.instanceOf(Date).isRequired,
    timeWarp: PropTypes.number.isRequired,
    children: PropTypes.node
};

/**
 * Hook to access simulation context.
 */
export function useSimulation() {
    return useContext(SimulationContext);
} 