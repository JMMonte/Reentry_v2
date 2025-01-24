import { useState, useEffect, useRef } from 'react';
import App3D from '../App3d.js';

export const useApp3D = () => {
    const [app3dInstance, setApp3dInstance] = useState(null);
    const app3dRef = useRef(null);
    const initializingRef = useRef(false);

    useEffect(() => {
        if (initializingRef.current || app3dInstance) {
            return;
        }

        initializingRef.current = true;

        try {
            const app = new App3D();
            app3dRef.current = app;
            setApp3dInstance(app);

            // Add method to create debug windows
            app.createDebugWindow = (satellite) => {
                document.dispatchEvent(new CustomEvent('createDebugWindow', {
                    detail: { satellite }
                }));
            };

            // Add method to update satellites list
            app.updateSatelliteList = () => {
                document.dispatchEvent(new CustomEvent('satelliteListUpdated', {
                    detail: { satellites: app.satellites }
                }));
            };

            // Add method to remove debug windows
            app.removeDebugWindow = (satelliteId) => {
                document.dispatchEvent(new CustomEvent('removeDebugWindow', {
                    detail: { satelliteId }
                }));
            };

            // Initialize display settings after scene is ready
            app.addEventListener('sceneReady', () => {
                console.log('Scene is ready');
                document.dispatchEvent(new CustomEvent('sceneReady'));
            });
        } catch (error) {
            console.error('Error initializing App3D:', error);
        }

        return () => {
            if (app3dRef.current) {
                console.log('Cleaning up App3D...');
                app3dRef.current.dispose();
                app3dRef.current = null;
                setApp3dInstance(null);
            }
            initializingRef.current = false;
        };
    }, []);

    return {
        app3dInstance,
        app3dRef
    };
}; 