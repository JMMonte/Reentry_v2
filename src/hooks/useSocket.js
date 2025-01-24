import { useState, useEffect } from 'react';
import { SocketManager } from '../managers/SocketManager';

export const useSocket = (app) => {
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        let socketManager;
        
        if (!app) {
            return;
        }
        
        try {
            socketManager = new SocketManager(app);
            setSocket(socketManager.getSocket());
        } catch (error) {
            console.error('Socket connection failed:', error);
        }

        return () => {
            if (socketManager) {
                socketManager.dispose();
            }
        };
    }, [app]);

    return socket;
};