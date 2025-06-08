import { useState, useEffect } from 'react';
import { ApsisService } from '../services/ApsisService.js';

/**
 * Custom hook to manage orbital elements calculations and apsis timing
 * @param {Object} physics - Physics data from the satellite
 * @param {Array} celestialBodies - Array of celestial bodies
 * @param {string} orbitalReferenceFrame - 'ecliptic' or 'equatorial'
 * @returns {Object} Orbital elements and apsis data
 */
export function useOrbitalElements(physics, celestialBodies, orbitalReferenceFrame = 'ecliptic') {
  const [orbitalElements, setOrbitalElements] = useState(null);
  const [apsisData, setApsisData] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Allow some time for celestial bodies to load
  useEffect(() => {
    const timer = setTimeout(() => setIsInitialized(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!physics || !isInitialized) {
      setOrbitalElements(null);
      setApsisData(null);
      return;
    }

    // Clear previous data while recalculating
    setApsisData(null);

    // Check if physics already has orbital elements calculated
    if (physics.orbitalElements && physics.orbitalElements.semiMajorAxis !== undefined && physics.orbitalElements.eccentricity !== undefined) {

      // Choose elements based on selected reference frame
      const eclipticElements = physics.orbitalElements; // Default elements are in ecliptic frame
      const equatorialElements = physics.equatorialElements;

      // Validate the selected reference frame has complete data
      const elementsToUse = (orbitalReferenceFrame === 'equatorial' && equatorialElements && 
                            equatorialElements.semiMajorAxis !== undefined && 
                            equatorialElements.eccentricity !== undefined) 
        ? equatorialElements 
        : eclipticElements;

      setOrbitalElements({
        semiMajorAxis: elementsToUse.semiMajorAxis,
        eccentricity: elementsToUse.eccentricity,
        inclination: elementsToUse.inclination,
        longitudeOfAscendingNode: elementsToUse.longitudeOfAscendingNode,
        argumentOfPeriapsis: elementsToUse.argumentOfPeriapsis,
        trueAnomaly: elementsToUse.trueAnomaly,
        meanAnomaly: elementsToUse.M0 !== undefined ? (elementsToUse.M0 * 180 / Math.PI) : elementsToUse.meanAnomaly,
        eccentricAnomaly: elementsToUse.eccentricAnomaly,
        period: elementsToUse.period,
        specificOrbitalEnergy: elementsToUse.specificOrbitalEnergy,
        specificAngularMomentum: elementsToUse.specificAngularMomentum,
        periapsisRadial: elementsToUse.periapsisRadial,
        apoapsisRadial: elementsToUse.apoapsisRadial,
        periapsisAltitude: elementsToUse.periapsisAltitude,
        apoapsisAltitude: elementsToUse.apoapsisAltitude,
        meanMotion: elementsToUse.meanMotion,
        periapsisVelocity: elementsToUse.periapsisVelocity,
        apoapsisVelocity: elementsToUse.apoapsisVelocity,
        referenceFrame: orbitalReferenceFrame,
        availableFrames: {
          ecliptic: !!eclipticElements,
          equatorial: !!equatorialElements
        }
      });

      // Calculate apsis timing if needed
      if (elementsToUse.eccentricity < 1.0 && elementsToUse.period) {
        try {
          const currentTime = window.app3d?.timeUtils?.getSimulatedTime() || new Date();

          // Get central body for apsis calculation
          let centralBody = null;
          const targetNaifId = parseInt(physics.centralBodyNaifId);
          
          if (celestialBodies?.length > 0) {
            const bodyFromContext = celestialBodies.find(b =>
              b.naif_id === targetNaifId || b.naifId === targetNaifId
            );
            
            if (bodyFromContext) {
              centralBody = {
                name: bodyFromContext.name,
                GM: bodyFromContext.GM || bodyFromContext.gm,
                radius: bodyFromContext.radius
              };
            }
          }

          if (!centralBody) {
            try {
              const bodyData = window.app3d?.physicsAPI?.Bodies.getByNaif(physics.centralBodyNaifId);
              if (bodyData) {
                centralBody = {
                  name: bodyData.name,
                  GM: bodyData.gm || bodyData.GM,
                  radius: bodyData.radius
                };
              }
            } catch (error) {
              // Fallback for common bodies if API fails
              const commonBodies = {
                399: { name: 'Earth', GM: 398600.4418, radius: 6371.0 }, // Earth
                301: { name: 'Moon', GM: 4902.7779, radius: 1737.4 },   // Moon
                499: { name: 'Mars', GM: 42828.37, radius: 3389.5 },    // Mars
                10: { name: 'Sun', GM: 132712440018, radius: 695700 }   // Sun
              };
              
              if (commonBodies[targetNaifId]) {
                centralBody = commonBodies[targetNaifId];
              } else {
                centralBody = null;
              }
            }
          }

          // Validate central body has required properties
          if (centralBody && centralBody.GM && centralBody.radius) {
            const elements = {
              semiMajorAxis: elementsToUse.semiMajorAxis,
              eccentricity: elementsToUse.eccentricity,
              inclination: elementsToUse.inclination,
              longitudeOfAscendingNode: elementsToUse.longitudeOfAscendingNode,
              argumentOfPeriapsis: elementsToUse.argumentOfPeriapsis,
              trueAnomaly: elementsToUse.trueAnomaly,
              period: elementsToUse.period
            };

            const nextPeriapsisTime = ApsisService.getNextApsisTimeFromElements(
              elements, 'periapsis', currentTime, centralBody
            );
            const nextApoapsisTime = ApsisService.getNextApsisTimeFromElements(
              elements, 'apoapsis', currentTime, centralBody
            );

            // Use physics data for time calculations instead of manual calculation
            const timeToPeriapsis = nextPeriapsisTime > currentTime ? (nextPeriapsisTime.getTime() - currentTime.getTime()) / (1000 * 60) : null;
            const timeToApoapsis = nextApoapsisTime > currentTime ? (nextApoapsisTime.getTime() - currentTime.getTime()) / (1000 * 60) : null;

            setApsisData({
              timeToPeriapsis,
              timeToApoapsis,
              periapsisAltitude: elementsToUse.periapsisAltitude,
              apoapsisAltitude: elementsToUse.apoapsisAltitude
            });
          } else {
            // Silently skip apsis calculation if central body data is not available
            // This is common during initialization or when celestial bodies are still loading
            setApsisData(null);
          }
        } catch (apsisError) {
          console.warn('[useOrbitalElements] Error calculating apsis timing:', apsisError);
          setApsisData(null);
        }
      }
    }
  }, [physics, celestialBodies, orbitalReferenceFrame, isInitialized]);

  return { orbitalElements, apsisData };
}