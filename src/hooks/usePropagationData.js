import { useState, useEffect } from 'react';

/**
 * Custom hook to manage satellite orbit propagation data using streaming system
 * @param {Object} satellite - The satellite object
 * @returns {Object} Propagation data and status
 */
export function usePropagationData(satellite) {
  const [propagationData, setPropagationData] = useState(null);

  useEffect(() => {
    if (!satellite) return;

    const updatePropagationData = (streamData) => {
      if (!streamData) {
        setPropagationData(null);
        return;
      }

      const { points, metadata } = streamData;

      if (points && points.length > 0) {
        // Calculate propagation duration from streaming data
        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];
        const propagationDuration = lastPoint.time ? (lastPoint.time - firstPoint.time) / 1000 : 0; // seconds

        // Find SOI transitions from streaming data
        const soiTransitions = [];
        let lastBodyId = null;

        for (let i = 0; i < points.length; i++) {
          const point = points[i];
          const currentBodyId = point.centralBodyNaifId;
          if (lastBodyId !== null && currentBodyId !== lastBodyId) {
            soiTransitions.push({
              index: i,
              time: point.time,
              fromBody: lastBodyId,
              toBody: currentBodyId,
              isEntry: true,
              isExit: false
            });
          }
          lastBodyId = currentBodyId;
        }

        setPropagationData({
          duration: propagationDuration,
          pointCount: points.length,
          maxPeriods: metadata?.params?.periods || 1.5,
          soiTransitions: soiTransitions,
          partial: metadata?.isExtending || false,
          timestamp: Date.now(),
          centralBodyId: lastPoint.centralBodyNaifId,
          pointsPerPeriod: metadata?.params?.pointsPerPeriod || 64,
          requestedPeriods: metadata?.params?.periods || 1.5,
          isComplete: metadata?.isComplete || false,
          progress: metadata?.progress || 0,
          physicsCount: metadata?.physicsCount || 0,
          predictedCount: metadata?.predictedCount || 0
        });
      } else {
        setPropagationData(null);
      }
    };

    // Get current orbit streaming data from physics engine
    const getOrbitData = () => {
      const physicsEngine = window.app3d?.physicsIntegration?.physicsEngine;
      if (physicsEngine?.satelliteEngine) {
        const streamData = physicsEngine.satelliteEngine.getOrbitStreamingData(satellite.id);
        updatePropagationData(streamData);
      }
    };

    // Initial update
    getOrbitData();

    // Listen for orbit stream updates
    const handleOrbitStreamUpdate = (e) => {
      if (e.detail?.satelliteId === satellite.id) {
        updatePropagationData(e.detail.data);
      }
    };

    window.addEventListener('orbitStreamUpdate', handleOrbitStreamUpdate);

    return () => {
      window.removeEventListener('orbitStreamUpdate', handleOrbitStreamUpdate);
    };
  }, [satellite?.id]);

  return propagationData;
}