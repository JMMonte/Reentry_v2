import { io, Socket } from 'socket.io-client';
import { SATELLITE_METHODS } from '../config/satelliteCreationMethods';
import { Manager } from '../types';

interface SatelliteMethodConfig {
    eventName: string;
    [key: string]: any;
}

interface SatelliteMethodMap {
    [key: string]: SatelliteMethodConfig;
}

interface App3D {
    satelliteManager: {
        [key: string]: (params: any) => Promise<any>;
    };
}

export class SocketManager implements Manager {
    private app: App3D;
    private socket: Socket;

    constructor(app: App3D) {
        this.app = app;
        this.socket = io('http://localhost:3000');
    }

    public async initialize(): Promise<void> {
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('connect_error', (err: Error) => {
            console.error('Error connecting to server:', err.message);
        });

        // Setup satellite creation events
        Object.entries(SATELLITE_METHODS as SatelliteMethodMap).forEach(([method, config]) => {
            this.socket.on(config.eventName, (params: any) => {
                this.app.satelliteManager[method](params);
            });
        });
    }

    public getSocket(): Socket {
        return this.socket;
    }

    public dispose(): void {
        this.socket.close();
    }
} 