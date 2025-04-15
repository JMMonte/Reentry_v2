import { io } from 'socket.io-client';

/**
 * Manages the Socket.IO connection and related event handling for the simulation.
 */
export class SocketManager {
    /**
     * @param {App3D} app - Reference to the main App3D instance
     */
    constructor(app) {
        this.app = app;
        this.socket = null;
        this._handlers = {};
    }

    /**
     * Initialize the socket connection and set up default event handlers.
     */
    init() {
        const socketServerUrl = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3000';
        console.log('SocketManager connecting to socket server:', socketServerUrl);
        this.socket = io(socketServerUrl, {
            reconnectionDelayMax: 10000,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            secure: socketServerUrl.startsWith('https'),
            withCredentials: true
        });
        this.socket.on('connect', () => {
            console.log('SocketManager: Connected to server');
        });
        this.socket.on('connect_error', (err) => {
            console.error('SocketManager: Error connecting to server:', err.message);
        });
    }

    /**
     * Register a custom event handler for a socket event.
     * @param {string} event
     * @param {Function} handler
     */
    on(event, handler) {
        if (this.socket) {
            this.socket.on(event, handler);
            this._handlers[event] = handler;
        }
    }

    /**
     * Remove all registered event handlers and close the socket connection.
     */
    dispose() {
        if (this.socket) {
            for (const [event, handler] of Object.entries(this._handlers)) {
                this.socket.off(event, handler);
            }
            this.socket.close();
            this.socket = null;
        }
        this._handlers = {};
    }
} 