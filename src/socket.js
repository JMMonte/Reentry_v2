import { io } from 'socket.io-client';

const socketServerUrl = import.meta.env.VITE_SOCKET_SERVER_URL;

let socket;
export function getSocket() {
    // If no socket server URL is configured, return null to disable chat
    if (!socketServerUrl || socketServerUrl.trim() === '') {
        return null;
    }
    
    if (!socket) {
        try {
            socket = io(socketServerUrl, {
                reconnectionDelayMax: 10000,
                transports: ['polling', 'websocket'],
                reconnection: true,
                reconnectionAttempts: 3,
                secure: socketServerUrl.startsWith('https'),
                withCredentials: true,
                timeout: 5000,
                forceNew: false,
                autoConnect: true
            });
            
            // Handle connection events
            socket.on('connect', () => {
                console.log(`AI chat connected to ${socketServerUrl}`);
            });
            
            socket.on('connect_error', (error) => {
                if (error.message.includes('CORS') || error.message.includes('cors')) {
                    console.warn('AI chat failed: CORS error. Backend needs to allow origin http://localhost:4000');
                    console.info('See README.md for backend CORS configuration');
                } else {
                    console.warn('AI chat connection failed:', error.message);
                }
            });
            
            socket.on('disconnect', (reason) => {
                console.log('AI chat disconnected:', reason);
            });
            
        } catch (error) {
            console.warn('Failed to create socket connection:', error.message);
            return null;
        }
    }
    return socket;
}

/**
 * Close the socket connection and cleanup
 */
export function closeSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
        console.log('Socket connection closed');
    }
} 