import { getSocket } from '../socket';

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
        // Use the centralized socket
        this.socket = getSocket();
        this.socket.on('connect', () => {
            // Connected to server (log removed)
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
            // Do not close the socket here, as it is shared
            this.socket = null;
        }
        this._handlers = {};
    }
} 