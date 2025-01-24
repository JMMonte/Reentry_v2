import { io } from 'socket.io-client';
import { SATELLITE_METHODS } from '../config/SatelliteCreationMethods';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export class SocketManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.initialize();
    }

    initialize() {
        // Use the environment variable or a fallback URL
        const serverUrl = process.env.SOCKET_SERVER_URL || 'http://localhost:3000';
        
        this.socket = io(serverUrl);
        
        this.socket.on('connect', () => {
            console.log(`Connected to server at ${serverUrl}`);
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