/**
 * Planet Constants
 * Shared constants for planet components to avoid circular dependencies
 */

// General Render Order Constants
export const RENDER_ORDER = {
    SOI: 0,
    SURFACE: 110,    // Surface features (lines, borders) above atmosphere
    CLOUDS: 0,
    POI: 113,        // POI markers above surface lines
    ATMOSPHERE: 100, // Much higher to ensure it renders after planet
    RINGS: 105,      // Above atmosphere
    POI_LEADERS: 115, // Leader lines above POI markers
    POI_LABELS: 118,  // Labels above leader lines
    
    // Label render orders - must be above all 3D elements
    LABELS_BASE: 500,           // Base for all labels
    DISTANCE_MARKERS: 500,      // Distance marker labels
    POI_UI_LABELS: 510,         // POI UI labels
    SATELLITE_LABELS: 520,      // Satellite and vehicle labels  
    GHOST_LABELS: 525,          // Temporary/ghost object labels
    PLANET_AXIS_LABELS: 530,    // Planet axis labels
    VECTOR_LABELS: 535,         // Vector and directional labels
    DEBUG_LABELS: 540,          // Debug labels (highest priority)
};

// Planet-specific constants
export const PLANET_DEFAULTS = {
    DOT_PIXEL_SIZE_THRESHOLD: 2,
    DOT_PIXEL_SIZE_THRESHOLD_DWARF: 3,
    DEFAULT_MESH_RES: 128,
    DEFAULT_ATMOSPHERE_RES: 128,
    DEFAULT_CLOUD_RES: 128
};

// LOD distance multipliers
export const LOD_DISTANCE_MULTIPLIERS = {
    default: [150, 75, 30, 10]
};