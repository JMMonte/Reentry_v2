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
        }
    };
} 