// Utility functions for handling body selection across the application

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
    return satellite ? satellite.name : 'None';
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
  } else if (formattedValue === 'earth') {
    app3d.cameraControls.updateCameraTarget(app3d.earth);
  } else if (formattedValue === 'moon') {
    app3d.cameraControls.updateCameraTarget(app3d.moon);
  } else if (formattedValue.startsWith('satellite-')) {
    const satelliteId = parseInt(formattedValue.split('-')[1]);
    const satellite = app3d.satellites[satelliteId];
    if (satellite) {
      app3d.cameraControls.updateCameraTarget(satellite);
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
 * Get satellite options for dropdown lists
 * @param {Object} satellites - The satellites object
 * @returns {Array} Array of option objects with value and text properties
 */
export const getSatelliteOptions = (satellites) => {
  return Object.values(satellites || {})
    .filter(satellite => satellite && satellite.id != null && satellite.name)
    .map(satellite => ({
      value: satellite.name,
      text: satellite.name
    }));
};
