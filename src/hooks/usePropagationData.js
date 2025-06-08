import { useState, useEffect } from 'react';

/**
 * Custom hook to manage satellite orbit propagation data
 * @param {Object} satellite - The satellite object
 * @returns {Object} Propagation data and status
 */
export function usePropagationData(satellite) {
  const [propagationData, setPropagationData] = useState(null);

  useEffect(() => {
    if (!satellite || !window.app3d?.satelliteOrbitManager) return;
    
    const updatePropagationData = () => {
      const orbitManager = window.app3d.satelliteOrbitManager;
      if (!orbitManager || !orbitManager.orbitCacheManager) {
        setPropagationData(null);
        return;
      }

      const orbitData = orbitManager.orbitCacheManager.getCachedOrbit(satellite.id);
      
      if (orbitData && orbitData.points && orbitData.points.length > 0) {
        // Calculate propagation duration from data or use cached duration
        const lastPoint = orbitData.points[orbitData.points.length - 1];
        const propagationDuration = orbitData.duration || lastPoint.time || 0; // seconds
        
        // Find SOI transitions
        const soiTransitions = [];
        let lastBodyId = null;
        
        for (let i = 0; i < orbitData.points.length; i++) {
          const point = orbitData.points[i];
          if (lastBodyId !== null && point.centralBodyId !== lastBodyId) {
            soiTransitions.push({
              index: i,
              time: point.time,
              fromBody: lastBodyId,
              toBody: point.centralBodyId,
              isEntry: point.isSOIEntry || false,
              isExit: point.isSOIExit || false
            });
          }
          lastBodyId = point.centralBodyId;
        }
        
        setPropagationData({
          duration: propagationDuration,
          pointCount: orbitData.pointCount || orbitData.points.length,
          maxPeriods: orbitData.maxPeriods || orbitData.requestedPeriods,
          soiTransitions: soiTransitions,
          partial: orbitData.partial || false,
          timestamp: orbitData.timestamp,
          centralBodyId: orbitData.centralBodyNaifId,
          pointsPerPeriod: orbitData.pointsPerPeriod,
          requestedPeriods: orbitData.requestedPeriods
        });
      } else {
        setPropagationData(null);
        
        // Trigger orbit calculation if no data exists
        if (orbitManager.updateSatelliteOrbit) {
          orbitManager.updateSatelliteOrbit(satellite.id);
        }
      }
    };
    
    // Initial update
    updatePropagationData();
    
    // Listen for orbit updates
    const handleOrbitUpdate = (e) => {
      if (e.detail?.satelliteId === satellite.id) {
        updatePropagationData();
      }
    };
    
    document.addEventListener('orbitUpdated', handleOrbitUpdate);
    
    // Periodic update to catch any changes
    const intervalId = setInterval(updatePropagationData, 1000);
    
    return () => {
      document.removeEventListener('orbitUpdated', handleOrbitUpdate);
      clearInterval(intervalId);
    };
  }, [satellite?.id]);

  return propagationData;
}