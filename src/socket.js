import { io } from 'socket.io-client';

const socketServerUrl = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3000';

let socket;
export function getSocket() {
    if (!socket) {
        socket = io(socketServerUrl, {
            reconnectionDelayMax: 10000,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            secure: socketServerUrl.startsWith('https'),
            withCredentials: true
        });
    }
    return socket;
} 