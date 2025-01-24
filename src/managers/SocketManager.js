import { io } from 'socket.io-client';
import { SATELLITE_METHODS } from '../config/SatelliteCreationMethods';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export class SocketManager {
    constructor(app) {
        if (!app) {
            throw new Error('SocketManager requires an app instance');
        }
        this.app = app;
        this.socket = null;
        this.initialize();
    }

    initialize() {
        this.socket = io(SOCKET_URL);
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('connect_error', (err) => {
            console.error('Error connecting to server:', err.message);
        });

        // Setup satellite creation events
        Object.entries(SATELLITE_METHODS).forEach(([method, config]) => {
            this.socket.on(config.eventName, (params) => {
                this.app.satelliteManager[method](params);
            });
        });
    }

    getSocket() {
        return this.socket;
    }

    dispose() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
} 