import { io } from 'socket.io-client';
import { SATELLITE_METHODS } from '../config/SatelliteCreationMethods';

// Use the environment variable prefixed with NEXT_PUBLIC for client-side access
const SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3000';

export class SocketManager {
    constructor(app) {
        this.app = app;
        this.socket = null;
        this.initialize();
    }

    initialize() {
        // Initialize the socket connection
        this.socket = io(SERVER_URL);

        // Handle connection events
        this.socket.on('connect', () => {
            console.log(`Connected to server at ${SERVER_URL}`);
        });

        this.socket.on('connect_error', (err) => {
            console.error('Error connecting to server:', err.message);
        });

        // Set up event listeners for satellite creation methods
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