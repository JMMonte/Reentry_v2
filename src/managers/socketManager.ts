import { io } from 'socket.io-client';
import { SATELLITE_METHODS } from '../config/satelliteCreationMethods';
import type { App3D } from '../types';

interface SatelliteMethodConfig {
    eventName: string;
    [key: string]: any;
}

interface SatelliteMethodMap {
    [key: string]: SatelliteMethodConfig;
}

// Declare the socket.io-client module to add the missing types
declare module 'socket.io-client' {
    interface Socket {
        on(event: string, listener: (...args: any[]) => void): this;
        close(): void;
    }
}

export class SocketManager {
    private app: App3D;
    private socket: ReturnType<typeof io> | null;

    constructor(app: App3D) {
        this.app = app;
        this.socket = null;
        this.initialize();
    }

    private initialize(): void {
        this.socket = io('http://localhost:3000');
        
        if (!this.socket) {
            console.error('Failed to initialize socket connection');
            return;
        }

        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('connect_error', (err: Error) => {
            console.error('Error connecting to server:', err.message);
        });

        // Setup satellite creation events
        Object.entries(SATELLITE_METHODS as SatelliteMethodMap).forEach(([method, config]) => {
            if (!this.socket) return;
            
            this.socket.on(config.eventName, (params: unknown) => {
                if (this.app.satelliteManager && method in this.app.satelliteManager) {
                    (this.app.satelliteManager as any)[method](params);
                } else {
                    console.error(`Method ${method} not found in satelliteManager`);
                }
            });
        });
    }

    public getSocket(): ReturnType<typeof io> | null {
        return this.socket;
    }

    public dispose(): void {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
} 