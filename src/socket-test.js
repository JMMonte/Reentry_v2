// Simple Socket.IO connection test
import { io } from 'socket.io-client';

export function testSocketConnection() {
    const socketServerUrl = import.meta.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
        import.meta.env.VITE_SOCKET_SERVER_URL ||
        // Fallback to production URL if not in development mode
        (import.meta.env.MODE === 'development' ?
            'http://localhost:3000' :
            'https://reentry-server.up.railway.app');
    console.log('TEST: Attempting to connect to socket server:', socketServerUrl);

    const socket = io(socketServerUrl, {
        reconnectionDelayMax: 10000,
        transports: ['websocket', 'polling'],
        reconnection: true,
        timeout: 10000,
        reconnectionAttempts: 10
    });

    socket.on('connect', () => {
        console.log('TEST: Socket connected successfully!');
        console.log('TEST: Socket ID:', socket.id);
    });

    socket.on('connect_error', (error) => {
        console.error('TEST: Socket connection error:', error);
        console.error('TEST: Error details:', error.message);
    });

    socket.on('error', (error) => {
        console.error('TEST: General socket error:', error);
    });

    socket.on('disconnect', (reason) => {
        console.log('TEST: Socket disconnected. Reason:', reason);
    });

    return socket;
}

// You can import and call this from your App.jsx or directly in the browser console 