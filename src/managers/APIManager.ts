import { getMethodFromApiMode } from '../config/satelliteCreationMethods';
import { Manager } from '../types';
import { Satellite } from '../components/Satellite/Satellite';

interface SatelliteCreationParams {
    mode: string;
    [key: string]: any; // Additional parameters depend on the mode
}

interface SatelliteCreationResponse {
    id?: string | number;
    name?: string;
    mode?: string;
    params?: SatelliteCreationParams;
    success: boolean;
    error?: string;
}

interface MoonOrbitResponse {
    success: boolean;
    data: Record<string, any>;
}

interface API {
    createSatellite: (params: SatelliteCreationParams) => Promise<SatelliteCreationResponse>;
    getMoonOrbit: () => Promise<MoonOrbitResponse>;
}

interface App3D {
    satelliteManager: {
        satellites: { [key: string | number]: Satellite };
        _satellites: { [key: string | number]: Satellite };
        updateSatelliteList: () => void;
        [key: string]: any; // For dynamic method access
    };
}

declare global {
    interface Window {
        api?: API;
    }
}

export class APIManager implements Manager {
    private app: App3D;

    constructor(app: App3D) {
        this.app = app;
        this.initializeAPI();
    }

    public async initialize(): Promise<void> {
        // No additional initialization needed as it's done in constructor
        return Promise.resolve();
    }

    private initializeAPI(): void {
        window.api = {
            createSatellite: async (params: SatelliteCreationParams) => this.createSatellite(params),
            getMoonOrbit: async () => this.getMoonOrbit()
        };

        // Add satellites getter/setter
        Object.defineProperty(this.app, 'satellites', {
            get: () => this.app.satelliteManager.satellites,
            set: (value: { [key: string | number]: Satellite }) => {
                console.warn('Direct satellite setting is deprecated. Use satelliteManager instead.');
                Object.assign(this.app.satelliteManager._satellites, value);
                this.app.satelliteManager.updateSatelliteList();
            }
        });
    }

    public async createSatellite(params: SatelliteCreationParams): Promise<SatelliteCreationResponse> {
        try {
            const method = getMethodFromApiMode(params.mode);
            if (!method) {
                throw new Error(`Unknown satellite mode: ${params.mode}`);
            }

            const satellite = await this.app.satelliteManager[method](params);
            
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
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    public async getMoonOrbit(): Promise<MoonOrbitResponse> {
        return {
            success: true,
            data: {}
        };
    }

    public dispose(): void {
        window.api = undefined;
    }
} 