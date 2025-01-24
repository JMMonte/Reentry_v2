// Centralized configuration for satellite creation methods
export const SATELLITE_METHODS = {
    // Method name in SatelliteManager
    createFromLatLon: {
        apiMode: 'latlon',
        eventName: 'createSatelliteFromLatLon'
    },
    createFromOrbitalElements: {
        apiMode: 'orbital',
        eventName: 'createSatelliteFromOrbitalElements'
    },
    createFromLatLonCircular: {
        apiMode: 'circular',
        eventName: 'createSatelliteFromLatLonCircular'
    }
};

// Helper functions to get mappings
export function getMethodFromApiMode(mode) {
    const entry = Object.entries(SATELLITE_METHODS).find(([_, config]) => config.apiMode === mode);
    return entry ? entry[0] : null;
}

export function getMethodFromEventName(eventName) {
    const entry = Object.entries(SATELLITE_METHODS).find(([_, config]) => config.eventName === eventName);
    return entry ? entry[0] : null;
}

export function getAllEventNames() {
    return Object.values(SATELLITE_METHODS).map(config => config.eventName);
} 