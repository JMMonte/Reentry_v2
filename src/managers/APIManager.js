export class APIManager {
    constructor(app) {
        this.app = app;
        this.initializeAPI();
    }

    initializeAPI() {
        window.api = {
            createSatellite: async (params) => this.createSatellite(params),
            getMoonOrbit: async () => this.getMoonOrbit()
        };

        // Add satellites getter/setter
        Object.defineProperty(this.app, 'satellites', {
            get: () => this.app.satelliteManager.satellites,
            set: (value) => {
                console.warn('Direct satellite setting is deprecated. Use satelliteManager instead.');
                Object.assign(this.app.satelliteManager._satellites, value);
                this.app.satelliteManager.updateSatelliteList();
            }
        });
    }

    async createSatellite(params) {
        try {
            let satellite;
            switch (params.mode) {
                case 'latlon':
                    satellite = await this.app.satelliteManager.createFromLatLon(params);
                    break;
                case 'orbital':
                    satellite = await this.app.satelliteManager.createFromOrbital(params);
                    break;
                case 'circular':
                    satellite = await this.app.satelliteManager.createFromLatLonCircular(params);
                    break;
                default:
                    throw new Error(`Unknown satellite mode: ${params.mode}`);
            }
            
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