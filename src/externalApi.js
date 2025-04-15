/**
 * Sets up the minimal public API for external/AI integration.
 * This attaches a stable, minimal API to window.api for use by AI and external tools.
 * @param {App3D} app3d - The App3D instance.
 */
export function setupExternalApi(app3d) {
    function serializeSatellite(sat) {
        return sat ? { id: sat.id, name: sat.name } : null;
    }
    window.api = {
        /**
         * Create a satellite (auto-detects parameter type for backward compatibility)
         * @param {Object} params
         */
        createSatellite: (params) => {
            let sat;
            if ('latitude' in params && 'longitude' in params && 'altitude' in params) {
                if ('velocity' in params) {
                    sat = app3d.createSatelliteFromLatLon(params);
                } else {
                    sat = app3d.createSatelliteFromLatLonCircular(params);
                }
            } else if ('semiMajorAxis' in params && 'eccentricity' in params) {
                sat = app3d.createSatelliteFromOrbitalElements(params);
            } else {
                sat = app3d.createSatellite(params);
            }
            return serializeSatellite(sat);
        },
        /**
         * Create a satellite from latitude/longitude parameters
         * @param {Object} params
         */
        createSatelliteFromLatLon: (params) => serializeSatellite(app3d.createSatelliteFromLatLon(params)),
        /**
         * Create a satellite from orbital elements
         * @param {Object} params
         */
        createSatelliteFromOrbitalElements: (params) => serializeSatellite(app3d.createSatelliteFromOrbitalElements(params)),
        /**
         * Create a satellite from latitude/longitude (circular orbit)
         * @param {Object} params
         */
        createSatelliteFromLatLonCircular: (params) => serializeSatellite(app3d.createSatelliteFromLatLonCircular(params))
    };
} 