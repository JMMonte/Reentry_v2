import { getVisibleLocationsFromOrbitalElements as computeVisibleLocations } from '../satellites/createSatellite.js';

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
        createSatelliteFromLatLonCircular: (params) => serializeSatellite(app3d.createSatelliteFromLatLonCircular(params)),
        /**
         * Simulate running code with optional file uploads (for code interpreter tool)
         * @param {Object} params - { code: string, files: [{ name, data }] }
         * @returns {Object} Simulated result or error
         */
        runCodeInterpreter: async (params) => {
            const { code, files } = params || {};
            // Simulate file validation
            if (files && Array.isArray(files)) {
                for (const file of files) {
                    if (!file.name || !file.data || typeof file.data !== 'string') {
                        return { error: 'Invalid file format. Each file must have { name, data }.' };
                    }
                    // Simple base64 check (not strict)
                    if (!/^([A-Za-z0-9+/=]+)$/.test(file.data)) {
                        return { error: `File ${file.name} data is not valid base64.` };
                    }
                }
            }
            // Simulate code execution result
            return {
                result: `Simulated code output for: ${code ? code.slice(0, 30) + (code.length > 30 ? '...' : '') : '[no code]'}`,
                files: files ? files.map(f => ({ name: f.name, size: f.data.length })) : []
            };
        },
        /**
         * Get the current Moon orbital elements
         * @returns {Object} Orbital elements: semiMajorAxis, eccentricity, inclination, ascendingNode, argumentOfPeriapsis
         */
        getMoonOrbit: () => {
            const Constants = app3d?.constructor?.Constants || window.Constants || {};
            const moon = app3d?.moon;
            // Prefer live values from moon instance if available, else fallback to Constants
            return {
                semiMajorAxis: (moon && moon.semiMajorAxis) || Constants.semiMajorAxis || 384400000,
                eccentricity: (moon && moon.eccentricity) || Constants.eccentricity || 0.0549,
                inclination: (moon && moon.inclination) || Constants.inclination || (5.145 * Math.PI / 180),
                ascendingNode: (moon && moon.ascendingNode) || Constants.ascendingNode || (-11.26064 * Math.PI / 180),
                argumentOfPeriapsis: (moon && moon.argumentOfPeriapsis) || Constants.argumentOfPeriapsis || (318.15 * Math.PI / 180)
            };
        },
        /**
         * Compute visible ground locations over time from orbital elements.
         * @param {Object} params { semiMajorAxis, eccentricity, inclination, raan, argumentOfPeriapsis, trueAnomaly, referenceFrame, locations, numPoints, numPeriods }
         */
        getVisibleLocationsFromOrbitalElements: (params) => {
            const { locations, numPoints, numPeriods, ...orbitalParams } = params;
            return computeVisibleLocations(app3d, orbitalParams, locations, { numPoints, numPeriods });
        },
    };
} 