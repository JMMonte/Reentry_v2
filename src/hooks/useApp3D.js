import { useState, useEffect, useRef } from 'react';
import App3D from '../App3d.js';

export const useApp3D = () => {
    const [app3dInstance, setApp3dInstance] = useState(null);
    const app3dRef = useRef(null);
    const mountedRef = useRef(false);
    const cleanupInProgressRef = useRef(false);
    const initializingRef = useRef(false);
    const cleanupTimeoutRef = useRef(null);

    // Async cleanup function with timeout
    const cleanup = async () => {
        if (cleanupInProgressRef.current) {
            console.log('Cleanup already in progress');
            return;
        }
        if (!app3dRef.current) {
            console.log('No app instance to clean up');
            return;
        }

        cleanupInProgressRef.current = true;
        console.log('Starting cleanup...');

        try {
            // Set a timeout to prevent cleanup from hanging
            const timeoutPromise = new Promise((_, reject) => {
                cleanupTimeoutRef.current = setTimeout(() => {
                    reject(new Error('Cleanup timeout'));
                }, 5000); // 5 second timeout
            });

            // Run cleanup with timeout
            await Promise.race([
                app3dRef.current.dispose(),
                timeoutPromise
            ]);

            app3dRef.current = null;
            window.app3d = null;
            setApp3dInstance(null);
            console.log('Cleanup complete');
        } catch (error) {
            console.error('Error during cleanup:', error);
            // Force cleanup on timeout
            app3dRef.current = null;
            window.app3d = null;
            setApp3dInstance(null);
        } finally {
            clearTimeout(cleanupTimeoutRef.current);
            cleanupInProgressRef.current = false;
        }
    };

    useEffect(() => {
        mountedRef.current = true;

        const initializeApp = async () => {
            // Prevent double initialization
            if (initializingRef.current) {
                console.log('Initialization already in progress');
                return;
            }

            // If we have an existing instance, clean it up first
            if (app3dRef.current) {
                console.log('Cleaning up existing instance before re-initialization');
                await cleanup();
            }

            initializingRef.current = true;
            console.log('Starting initialization...');

            const canvas = document.getElementById('three-canvas');
            if (!canvas) {
                console.error('Canvas element not found');
                initializingRef.current = false;
                return;
            }

            let app = null;
            try {
                // Create app with initial config
                app = new App3D({
                    initialTime: new Date().toISOString(),
                    canvas
                });

                if (!mountedRef.current) {
                    console.log('Component unmounted during initialization, cleaning up');
                    if (app?.dispose) {
                        await app.dispose();
                    }
                    initializingRef.current = false;
                    return;
                }

                // Add event handlers before initialization
                app.createDebugWindow = (satellite) => {
                    document.dispatchEvent(new CustomEvent('createDebugWindow', {
                        detail: { satellite }
                    }));
                };

                app.updateSatelliteList = () => {
                    document.dispatchEvent(new CustomEvent('satelliteListUpdated', {
                        detail: { satellites: app.satellites }
                    }));
                };

                app.removeDebugWindow = (satelliteId) => {
                    document.dispatchEvent(new CustomEvent('removeDebugWindow', {
                        detail: { satelliteId }
                    }));
                };

                app.addEventListener('sceneReady', () => {
                    console.log('Scene is ready');
                    document.dispatchEvent(new CustomEvent('sceneReady'));
                });

                // Initialize after setup
                console.log('Initializing app...');
                await app.initialize();

                if (!mountedRef.current) {
                    console.log('Component unmounted during initialization, cleaning up');
                    if (app?.dispose) {
                        await app.dispose();
                    }
                    initializingRef.current = false;
                    return;
                }

                // Only set refs after successful initialization
                console.log('Initialization successful, setting refs...');
                app3dRef.current = app;
                window.app3d = app;
                setApp3dInstance(app);

            } catch (error) {
                console.error('Error initializing App3D:', error);
                if (app && app.dispose) {
                    await app.dispose();
                }
                app3dRef.current = null;
                window.app3d = null;
                setApp3dInstance(null);
            } finally {
                initializingRef.current = false;
                console.log('Initialization process complete');
            }
        };

        initializeApp();

        return () => {
            console.log('Component unmounting, cleaning up...');
            mountedRef.current = false;
            cleanup();
        };
    }, []);

    return {
        app3dInstance,
        app3dRef
    };
}; 