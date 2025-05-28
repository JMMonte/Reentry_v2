import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';

const CelestialBodiesContext = createContext();

export function CelestialBodiesProvider({ children }) {
    // Initialize from window.app3d if available
    const initialBodies = (typeof window !== 'undefined' && window.app3d?.celestialBodies && window.app3d.celestialBodies.length > 0)
        ? window.app3d.celestialBodies
        : [];
    const [celestialBodies, setCelestialBodies] = useState(initialBodies);

    const updateCelestialBodies = useCallback((bodies) => {
        setCelestialBodies(bodies || []);
    }, []);

    useEffect(() => {
        function handleUpdate(e) {
            if (e?.detail?.celestialBodies) {
                setCelestialBodies(e.detail.celestialBodies);
            }
        }
        window.addEventListener('celestialBodiesUpdated', handleUpdate);
        // On mount, check again in case window.app3d was set after initial render
        if (window.app3d?.celestialBodies?.length > 0) {
            setCelestialBodies(window.app3d.celestialBodies);
        }
        return () => window.removeEventListener('celestialBodiesUpdated', handleUpdate);
    }, []);

    // Utility: get grouped planet/moon options, with optional filter
    const getGroupedPlanetOptions = useCallback((options = {}) => {
        const { excludeBarycenters = false } = options;
        const planets = celestialBodies.filter(b => (b.type === 'planet' || b.type === 'dwarf_planet') && (!excludeBarycenters || b.subtype !== 'barycenter'));
        const moons = celestialBodies.filter(b => b.type === 'moon');
        const moonsByParent = {};
        for (const moon of moons) {
            if (!moonsByParent[moon.parent]) moonsByParent[moon.parent] = [];
            moonsByParent[moon.parent].push(moon);
        }
        return planets.map(planet => ({
            planet,
            moons: moonsByParent[planet.naif_id] || []
        }));
    }, [celestialBodies]);

    CelestialBodiesProvider.propTypes = {
        children: PropTypes.node.isRequired,
    };

    return (
        <CelestialBodiesContext.Provider value={{
            celestialBodies,
            updateCelestialBodies,
            getGroupedPlanetOptions,
        }}>
            {children}
        </CelestialBodiesContext.Provider>
    );
}

export function useCelestialBodies() {
    return useContext(CelestialBodiesContext);
} 