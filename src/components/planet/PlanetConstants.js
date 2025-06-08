/**
 * Planet Constants
 * Shared constants for planet components to avoid circular dependencies
 */

// General Render Order Constants
export const RENDER_ORDER = {
    SOI: 0,
    SURFACE: 0,
    CLOUDS: 0,
    ATMOSPHERE: 100, // Much higher to ensure it renders after planet
    POI: 3,
    RINGS: 4
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