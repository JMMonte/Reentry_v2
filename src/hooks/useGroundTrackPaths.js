import { useState, useEffect, useRef, useCallback } from 'react';
import { GroundtrackPath } from '../services/GroundtrackPath.js';

/**
 * Custom hook to manage ground track paths for satellites
 * Handles creation, updates, and cleanup of GroundtrackPath instances
 */
export function useGroundTrackPaths({ 
    filteredSatellites, 
    planet, 
    simulationTime, 
    physicsBodies 
}) {
    const [trackPoints, setTrackPoints] = useState({});
    const groundtrackPathsRef = useRef(new Map());
    
    // Initialize paths when planet changes
    useEffect(() => {
        if (!planet?.naifId || !Object.keys(filteredSatellites).length) {
            // Cleanup existing paths
            groundtrackPathsRef.current.forEach(path => path.dispose());
            groundtrackPathsRef.current.clear();
            setTrackPoints({});
            return;
        }
        
        // Cleanup old paths
        groundtrackPathsRef.current.forEach(path => path.dispose());
        groundtrackPathsRef.current.clear();
        
        // Create new paths for each satellite
        Object.values(filteredSatellites).forEach(sat => {
            if (sat.position && sat.velocity) {
                const path = new GroundtrackPath();
                groundtrackPathsRef.current.set(sat.id, path);
            }
        });
        
        return () => {
            // Cleanup on unmount
            groundtrackPathsRef.current.forEach(path => path.dispose());
            groundtrackPathsRef.current.clear();
            setTrackPoints({});
        };
    }, [planet?.naifId]); // Only recreate when planet changes
    
    // Update ground tracks when satellite data changes
    useEffect(() => {
        const paths = groundtrackPathsRef.current;
        if (!planet || !Object.keys(filteredSatellites).length) return;
        
        // Create paths for any new satellites that don't have them yet
        Object.values(filteredSatellites).forEach(sat => {
            if (sat.position && sat.velocity && !paths.has(sat.id)) {
                const path = new GroundtrackPath();
                paths.set(sat.id, path);
            }
        });
        
        // Remove paths for satellites that no longer exist
        Array.from(paths.keys()).forEach(satId => {
            if (!filteredSatellites[satId]) {
                const path = paths.get(satId);
                if (path) {
                    path.dispose();
                    paths.delete(satId);
                }
            }
        });
        
        const updatePath = async (path, sat) => {
            // Calculate orbital period
            let period = 6000; // Default 100 minutes
            
            const centralBody = physicsBodies?.find(b => b.naifId === sat.centralBodyNaifId);
            if (centralBody && sat.orbitalElements?.period) {
                period = sat.orbitalElements.period;
            } else if (centralBody) {
                // Dynamic import to avoid circular dependencies
                const { OrbitalMechanics } = await import('../physics/core/OrbitalMechanics.js');
                const calculatedPeriod = OrbitalMechanics.calculateOrbitalPeriod(
                    sat.position,
                    sat.velocity,
                    centralBody
                );
                if (calculatedPeriod > 0) {
                    period = calculatedPeriod;
                }
            }
            
            const orbitsToShow = sat.orbitSimProperties?.periods || 2;
            const totalDuration = period * orbitsToShow;
            const numPoints = Math.min(Math.max(Math.floor(totalDuration / 60), 100), 2000);
            
            const position = Array.isArray(sat.position) 
                ? { x: sat.position[0], y: sat.position[1], z: sat.position[2] }
                : { x: sat.position.x, y: sat.position.y, z: sat.position.z };
            
            const velocity = Array.isArray(sat.velocity)
                ? { x: sat.velocity[0], y: sat.velocity[1], z: sat.velocity[2] }
                : { x: sat.velocity.x, y: sat.velocity.y, z: sat.velocity.z };
            
            path.update(
                simulationTime || Date.now(),
                position,
                velocity,
                sat.id,
                physicsBodies || [],
                totalDuration,
                numPoints,
                planet.naifId,
                (data) => {
                    if (data.error) {
                        console.error('[useGroundTrackPaths] Error:', data.error);
                        return;
                    }
                    setTrackPoints(prev => ({
                        ...prev,
                        [data.id]: data.points
                    }));
                },
                null, // onChunk callback
                1024, // canvas width
                512   // canvas height
            );
        };
        
        // Update all paths
        paths.forEach((path, satId) => {
            const sat = filteredSatellites[satId];
            if (sat && sat.position && sat.velocity) {
                updatePath(path, sat);
            }
        });
    }, [filteredSatellites, simulationTime, planet, physicsBodies]);
    
    // Calculate current positions
    const currentPositions = useCallback(async () => {
        if (!planet || !Object.keys(filteredSatellites).length) return [];
        
        const { groundTrackService } = await import('../services/GroundTrackService.js');
        const currentPlanetState = physicsBodies?.find(b => b.naifId === planet.naifId);
        
        const positions = await Promise.all(
            Object.values(filteredSatellites).map(async sat => {
                if (!sat.position) {
                    return { id: sat.id, lat: 0, lon: 0, color: sat.color || 0xffff00 };
                }
                
                try {
                    const eciPos = Array.isArray(sat.position) 
                        ? [sat.position[0], sat.position[1], sat.position[2]]
                        : [sat.position.x, sat.position.y, sat.position.z];
                    
                    const currentTime = simulationTime || Date.now();
                    const geoPos = await groundTrackService.transformECIToSurface(
                        eciPos, 
                        planet.naifId, 
                        currentTime,
                        currentPlanetState
                    );
                    
                    return {
                        id: sat.id,
                        lat: geoPos.lat,
                        lon: geoPos.lon,
                        alt: geoPos.alt,
                        color: sat.color || 0xffff00
                    };
                } catch (error) {
                    console.warn(`Failed to convert position for satellite ${sat.id}:`, error);
                    return { id: sat.id, lat: 0, lon: 0, color: sat.color || 0xffff00 };
                }
            })
        );
        
        return positions;
    }, [filteredSatellites, planet, simulationTime, physicsBodies]);
    
    return {
        trackPoints,
        currentPositions,
        groundtrackPaths: groundtrackPathsRef.current
    };
}