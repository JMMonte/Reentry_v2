import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

export const useSocket = () => {
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        const newSocket = io('http://localhost:3000', {
            reconnectionDelayMax: 10000,
            transports: ['websocket']
        });

        newSocket.on('connect', () => {
            console.log('Socket connected');
        });

        newSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });

        setSocket(newSocket);

        return () => {
            if (newSocket) {
                newSocket.close();
            }
        };
    }, []);

    return socket;
}; 