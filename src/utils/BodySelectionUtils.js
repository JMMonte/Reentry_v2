// Utility functions for handling body selection across the application

import { Planet } from '../components/Planet.js';

/**
 * Format a value into the standard body selection format
 * @param {string|object} value - The value to format (can be a satellite object, name, or id)
 * @returns {string} The formatted value (e.g., 'none', 'earth', 'moon', or 'satellite-[id]')
 */
export const formatBodySelection = (value) => {
  if (!value || value === 'none' || value === null) {
    return 'none';
  }
  if (value === 'earth' || value === 'moon') {
    return value;
  }
  
  // Handle satellite objects
  if (typeof value === 'object' && value.id != null) {
    return `satellite-${value.id}`;
  }
  
  // Handle satellite IDs
  if (typeof value === 'number' || !isNaN(parseInt(value))) {
    return `satellite-${parseInt(value)}`;
  }
  
  return value;
};

/**
 * Get the display name for a body selection value
 * @param {string} value - The body selection value
 * @param {Object} satellites - The satellites object for looking up names
 * @returns {string} The display name
 */
export const getBodyDisplayName = (value, satellites) => {
  if (!value || value === 'none') {
    return 'None';
  }
  if (value === 'earth') {
    return 'Earth';
  }
  if (value === 'moon') {
    return 'Moon';
  }
  
  // Handle satellite-[id] format
  if (value.startsWith('satellite-')) {
    const satelliteId = parseInt(value.split('-')[1]);
    const satellite = Object.values(satellites || {}).find(sat => sat.id === satelliteId);
    if (satellite) {
      return satellite.name;
    }
  }
  
  // Handle dynamic planets
  const planetOption = getPlanetOptions().find(opt => opt.value === value);
  if (planetOption) {
    return planetOption.text;
  }
  
  return value;
};

/**
 * Update camera target based on body selection
 * @param {string} value - The body selection value
 * @param {Object} app3d - The App3D instance
 * @param {boolean} [dispatchEvent=true] - Whether to dispatch the bodySelected event
 */
export const updateCameraTarget = (value, app3d, dispatchEvent = true) => {
  if (!app3d?.cameraControls) return;

  const formattedValue = formatBodySelection(value);

  if (!formattedValue || formattedValue === 'none') {
    app3d.cameraControls.clearCameraTarget();
  } else {
    // Handle dynamic planets
    const planetInstance = Planet.instances.find(p => p.name === formattedValue);
    if (planetInstance) {
      app3d.cameraControls.updateCameraTarget(planetInstance);
    } else if (formattedValue.startsWith('satellite-')) {
      const satelliteId = parseInt(formattedValue.split('-')[1], 10);
      // Look up satellites via getSatellites() map
      const sats = typeof app3d.satellites.getSatellites === 'function'
        ? app3d.satellites.getSatellites()
        : app3d.satellites;
      const satellite = sats?.[satelliteId];
      if (satellite) {
        app3d.cameraControls.updateCameraTarget(satellite);
      }
    }
  }

  // Dispatch body selected event if requested
  if (dispatchEvent) {
    document.dispatchEvent(new CustomEvent('bodySelected', {
      detail: { body: formattedValue }
    }));
  }
};

/**
 * Find a satellite by its name or ID
 * @param {string|number} identifier - The satellite name or ID
 * @param {Object} satellites - The satellites object to search in
 * @returns {Object|null} The found satellite or null
 */
export const findSatellite = (identifier, satellites) => {
  if (!satellites) return null;
  
  // If identifier is a number or numeric string, treat it as an ID
  if (typeof identifier === 'number' || !isNaN(parseInt(identifier))) {
    return satellites[identifier] || null;
  }
  
  // If identifier starts with 'satellite-', extract the ID
  if (typeof identifier === 'string' && identifier.startsWith('satellite-')) {
    const id = parseInt(identifier.split('-')[1]);
    return satellites[id] || null;
  }
  
  // Otherwise, search by name
  return Object.values(satellites).find(sat => sat.name === identifier) || null;
};

/**
 * Produce dropdown options where value is 'satellite-<id>' and text is satellite name or fallback
 */
export const getSatelliteOptions = (satellites) => {
  return Object.values(satellites || {})
    .filter(satellite => satellite && satellite.id != null)
    .map(satellite => ({
      value: `satellite-${satellite.id}`,
      text: satellite.name || `Satellite ${satellite.id}`
    }));
};

/**
 * Get options for planets based on instantiated celestial bodies
 * @param {Array<Planet|Sun>} celestialBodies - Array of instantiated bodies (e.g., from app.celestialBodies)
 * @returns {Array<{value:string, text:string}>}
 */
export const getPlanetOptions = (celestialBodies) => {
  // Filter for instances that have a 'getMesh' method (likely planets, not Sun)
  // and have a valid name.
  return (celestialBodies || [])
    .filter(body => typeof body?.getMesh === 'function' && body.name) 
    .map(planet => ({
      value: planet.name,
      text: planet.name.charAt(0).toUpperCase() + planet.name.slice(1),
  }));
};
