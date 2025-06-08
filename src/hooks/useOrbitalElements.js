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

  useEffect(() => {
    if (!physics) {
      return;
    }


    // Check if physics already has orbital elements calculated
    if (physics.orbitalElements && physics.orbitalElements.semiMajorAxis !== undefined && physics.orbitalElements.eccentricity !== undefined) {

      // Choose elements based on selected reference frame
      const eclipticElements = physics.orbitalElements; // Default elements are in ecliptic frame
      const equatorialElements = physics.equatorialElements;

      const elementsToUse = (orbitalReferenceFrame === 'equatorial' && equatorialElements)
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
          if (celestialBodies?.length > 0) {
            centralBody = celestialBodies.find(b =>
              b.naif_id === parseInt(physics.centralBodyNaifId) || b.naifId === parseInt(physics.centralBodyNaifId)
            );
          }

          if (!centralBody) {
            try {
              const bodyData = window.app3d?.physicsAPI?.Bodies.getByNaif(physics.centralBodyNaifId);
              centralBody = bodyData ? {
                name: bodyData.name,
                GM: bodyData.gm,
                radius: bodyData.radius
              } : null;
            } catch {
              centralBody = null;
            }
          }

          if (centralBody) {
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
          }
        } catch (apsisError) {
          console.warn('[useOrbitalElements] Error calculating apsis timing:', apsisError);
        }
      }
    }
  }, [physics, celestialBodies, orbitalReferenceFrame]);

  return { orbitalElements, apsisData };
}