import { useCallback, useMemo } from 'react';
import { usePhysicsSatellites } from './usePhysicsSatellites.js';

/**
 * Hook for satellite operations and data management
 * Extracts satellite-related logic from App.jsx
 */
export function useSatelliteOperations(app3d, modalState, handleBodyChange) {
  // Get physics satellite data
  const satellitesPhysics = usePhysicsSatellites(app3d);
  
  // Get UI satellite data
  const satellitesUI = app3d?.satellites?.getSatellitesMap?.() || new Map();
  
  // Memoized satellite data transformation
  const satellites = useMemo(() => {
    return Object.values(satellitesPhysics)
      .map(satState => {
        const satUI = satellitesUI.get(satState.id);
        if (!satUI) return null;
        return {
          ...satState,
          color: satUI.color,
          name: satUI.name,
          setColor: satUI.setColor?.bind(satUI),
          delete: satUI.delete?.bind(satUI)
        };
      })
      .filter(Boolean);
  }, [satellitesPhysics, satellitesUI]);

  // Memoized available bodies calculation
  const availableBodies = useMemo(() => {
    let bodies = [];
    if (Array.isArray(app3d?.celestialBodies)) {
      bodies = app3d.celestialBodies
        .filter(b => b && (b.naifId !== undefined && b.naifId !== null))
        .map(b => ({ ...b, naifId: b.naifId ?? b.naif_id }));
    }
    if (bodies.length === 0) {
      bodies = [{ name: 'Earth', naifId: 399, type: 'planet' }];
    }
    return bodies;
  }, [app3d?.celestialBodies]);

  // Satellite creation callback
  const onCreateSatellite = useCallback(async (params) => {
    try {
      let result;
      if (params.mode === 'latlon') {
        result = await app3d?.createSatelliteFromLatLon(params);
      } else if (params.mode === 'orbital') {
        result = await app3d?.createSatelliteFromOrbitalElements(params);
      } else if (params.mode === 'circular') {
        result = await app3d?.createSatelliteFromLatLonCircular(params);
      }
      
      const satellite = result?.satellite || result;
      if (satellite) {
        modalState.setIsSatelliteModalOpen(false);
        handleBodyChange(satellite);
        app3d?.createDebugWindow?.(satellite);
      }
    } catch (error) {
      console.error('Error creating satellite:', error);
    }
  }, [app3d, handleBodyChange, modalState]);

  return {
    satellites,
    satellitesPhysics,
    availableBodies,
    onCreateSatellite,
  };
}