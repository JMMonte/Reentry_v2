import React, { createContext, useContext } from 'react';
import PropTypes from 'prop-types';

const SimulationContext = createContext({ timeUtils: null, displaySettings: {} });

/**
 * Provider for simulation-wide settings and utilities.
 * @param {{ timeUtils: Object, displaySettings: Object, children: React.ReactNode }} props
 */
export function SimulationProvider({ timeUtils, displaySettings, children }) {
    // Pure JS: use React.createElement instead of JSX
    return React.createElement(
        SimulationContext.Provider,
        { value: { timeUtils, displaySettings } },
        children
    );
}

SimulationProvider.propTypes = {
    timeUtils: PropTypes.object.isRequired,
    displaySettings: PropTypes.object.isRequired,
    children: PropTypes.node
};

/**
 * Hook to access simulation context.
 */
export function useSimulation() {
    return useContext(SimulationContext);
} 