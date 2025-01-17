import { io } from 'socket.io-client';

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
        this.socket.on('createSatelliteFromLatLon', (params) => {
            this.app.satelliteManager.createFromLatLon(params);
        });

        this.socket.on('createSatelliteFromOrbitalElements', (params) => {
            this.app.satelliteManager.createFromOrbital(params);
        });

        this.socket.on('createSatelliteFromLatLonCircular', (params) => {
            this.app.satelliteManager.createFromLatLonCircular(params);
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