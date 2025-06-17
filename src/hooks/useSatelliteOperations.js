import { useCallback, useMemo, useRef } from 'react';

/**
 * Hook for satellite operations and data management
 * Extracts satellite-related logic from App.jsx
 */
export function useSatelliteOperations(app3d, modalState, handleBodyChange, centralizedSatellites = {}) {
  // Use centralized satellite data instead of separate hook
  const satellitesPhysics = centralizedSatellites;
  
  // Get UI satellite data
  const satellitesUI = app3d?.satellites?.getSatellitesMap?.() || new Map();
  
  // Use refs to store stable method references
  const stableMethodsRef = useRef(new Map());
  
  // Memoized satellite data transformation with stable method references
  const satellites = useMemo(() => {
    const combined = {};
    
    // Clear stale method cache
    const currentIds = new Set();
    
    for (const [id, physicsData] of Object.entries(satellitesPhysics)) {
      currentIds.add(id);
      const uiData = satellitesUI.get(id);
      
      // Get or create stable method references
      let stableMethods = stableMethodsRef.current.get(id);
      if (!stableMethods) {
        stableMethods = {
          setColor: (color) => {
            const currentUI = app3d?.satellites?.getSatellitesMap?.()?.get(id);
            if (currentUI && typeof currentUI.setColor === 'function') {
              currentUI.setColor(color);
            }
          },
          delete: () => {
            const currentUI = app3d?.satellites?.getSatellitesMap?.()?.get(id);
            if (currentUI && typeof currentUI.delete === 'function') {
              currentUI.delete();
            }
          }
        };
        stableMethodsRef.current.set(id, stableMethods);
      }
      
      combined[id] = {
        id,
        name: physicsData.name || `Satellite ${id}`,
        color: uiData?.color || 0xffff00,
        position: physicsData.position,
        velocity: physicsData.velocity,
        centralBodyNaifId: physicsData.centralBodyNaifId,
        mass: physicsData.mass,
        orbitalElements: physicsData.orbitalElements,
        // Stable method references
        setColor: stableMethods.setColor,
        delete: stableMethods.delete,
        // Additional UI state
        isVisible: uiData?.isVisible !== false
      };
    }
    
    // Clean up stale method references
    for (const [id] of stableMethodsRef.current) {
      if (!currentIds.has(id)) {
        stableMethodsRef.current.delete(id);
      }
    }
    
    return combined;
  }, [satellitesPhysics, satellitesUI, app3d]);
  
  // Simple satellite creation handler 
  const createSatellite = useCallback(() => {
    if (modalState?.openSatelliteCreator) {
      modalState.openSatelliteCreator();
    }
  }, [modalState]);

  return {
    satellites,
    createSatellite,
    // No longer return availableBodies - consumers should use existing data sources:
    // - app3d.celestialBodies for UI components
    // - CelestialBodiesContext for React context
    // - getPlanetOptions() for dropdown formatting
  };
}