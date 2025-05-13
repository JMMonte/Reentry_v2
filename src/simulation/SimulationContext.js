import React, { createContext, useContext } from 'react';
import PropTypes from 'prop-types';

const SimulationContext = createContext({ timeUtils: null, displaySettings: {}, simulatedTime: null, timeWarp: 1 });

/**
 * Provider for simulation-wide settings and utilities.
 * @param {{ timeUtils: Object, displaySettings: Object, simulatedTime: Date, timeWarp: number, children: React.ReactNode }} props
 */
export function SimulationProvider({ timeUtils, displaySettings, simulatedTime, timeWarp, children }) {
    // Pure JS: use React.createElement instead of JSX
    return React.createElement(
        SimulationContext.Provider,
        { value: { timeUtils, displaySettings, simulatedTime, timeWarp } },
        children
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