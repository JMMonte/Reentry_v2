import { getMethodFromApiMode } from '../config/SatelliteCreationMethods';

export class APIManager {
    constructor(app) {
        this.app = app;
    }

    initialize() {
        // Ensure SatelliteManager is initialized before setting up satellites getter
        if (!this.app.managers?.satellite) {
            throw new Error('SatelliteManager must be initialized before APIManager');
        }

        this.initializeAPI();
    }

    initializeAPI() {
        window.api = {
            createSatellite: async (params) => this.createSatellite(params),
            getMoonOrbit: async () => this.getMoonOrbit()
        };

        // Add satellites getter/setter
        Object.defineProperty(this.app, 'satellites', {
            get: () => this.app.managers.satellite.satellites,
            set: (value) => {
                console.warn('Direct satellite setting is deprecated. Use satelliteManager instead.');
                Object.assign(this.app.managers.satellite._satellites, value);
                this.app.managers.satellite.updateSatelliteList();
            }
        });
    }

    async createSatellite(params) {
        try {
            const method = getMethodFromApiMode(params.mode);
            if (!method) {
                throw new Error(`Unknown satellite mode: ${params.mode}`);
            }

            const satellite = await this.app.managers.satellite[method](params);
            
            if (!satellite) {
                throw new Error('Failed to create satellite');
            }

            return {
                id: satellite.id,
                name: satellite.name,
                mode: params.mode,
                params: params,
                success: true
            };
        } catch (error) {
            console.error('Error creating satellite:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getMoonOrbit() {
        return {
            success: true,
            data: {}
        };
    }

    dispose() {
        delete window.api;
    }
} 