import { useMemo } from 'react';
import { projectToGeodetic } from '../../../utils/MapProjection';

// Hook to get the list of planets, preferring prop over window.app3d
export function usePlanetList(planetsProp) {
    return planetsProp?.length ? planetsProp : window.app3d?.celestialBodies ?? [];
}

// Hook to compute current geodetic positions for satellites
export function useCurrentPositions(isOpen, satellites, planet) {
    return useMemo(() => {
        if (!isOpen || !planet) return {};
        const out = {};
        for (const [id, sat] of Object.entries(satellites)) {
            out[id] = projectToGeodetic(sat.position, planet);
        }
        return out;
    }, [isOpen, satellites, planet]);
} 