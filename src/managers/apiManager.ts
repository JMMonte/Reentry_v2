import { getMethodFromApiMode } from '../config/satelliteCreationMethods';
import type { App3D, Satellite } from '../types';

interface SatelliteCreationParams {
    mode: string;
    [key: string]: any;
}

interface SatelliteCreationResponse {
    id?: string;
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

interface APIInterface {
    createSatellite: (params: SatelliteCreationParams) => Promise<SatelliteCreationResponse>;
    getMoonOrbit: () => Promise<MoonOrbitResponse>;
}

declare global {
    interface Window {
        api?: APIInterface;
    }
}

export class APIManager {
    private app: App3D;

    constructor(app: App3D) {
        this.app = app;
        this.initializeAPI();
    }

    private initializeAPI(): void {
        window.api = {
            createSatellite: async (params: SatelliteCreationParams) => this.createSatellite(params),
            getMoonOrbit: async () => this.getMoonOrbit()
        };

        // Add satellites getter/setter
        Object.defineProperty(this.app, 'satellites', {
            get: () => this.app.satelliteManager?.satellites || {},
            set: (value: Record<string, Satellite>) => {
                console.warn('Direct satellite setting is deprecated. Use satelliteManager instead.');
                if (this.app.satelliteManager) {
                    Object.assign(this.app.satelliteManager.satellites, value);
                    this.app.satelliteManager.updateSatelliteList?.();
                }
            }
        });
    }

    public async createSatellite(params: SatelliteCreationParams): Promise<SatelliteCreationResponse> {
        try {
            const method = getMethodFromApiMode(params.mode);
            if (!method) {
                throw new Error(`Unknown satellite mode: ${params.mode}`);
            }

            if (!this.app.satelliteManager || !(method in this.app.satelliteManager)) {
                throw new Error(`Method ${method} not found in satelliteManager`);
            }

            const satellite = await (this.app.satelliteManager as any)[method](params);
            
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
        delete window.api;
    }
} 