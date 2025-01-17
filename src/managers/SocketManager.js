import { io } from 'socket.io-client';
import { SATELLITE_METHODS } from '../config/satelliteCreationMethods';

export class SocketManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.initialize();
    }

    initialize() {
        this.socket = io('http://localhost:3000');
        
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