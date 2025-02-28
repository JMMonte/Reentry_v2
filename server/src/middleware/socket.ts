import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import config from '../config/env.js';

/**
 * Configure Socket.IO server
 * @param httpServer HTTP server instance
 * @returns Configured Socket.IO instance
 */
export const setupSocketIO = (httpServer: HttpServer): SocketServer => {
    const io = new SocketServer(httpServer, {
        cors: {
            origin: config.clientUrl,
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    return io;
}; 