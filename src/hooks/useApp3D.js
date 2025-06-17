import { useEffect, useState } from 'react';
import { App3DController } from '../simulation/App3DController';

export function useApp3D(initialState) {
    const [controller, setController] = useState(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let ctrl = null;
        let isCleanedUp = false;
        let lastInitAttempt = 0;
        
        const initController = () => {
            // Throttle initialization attempts to prevent CPU overheating
            const now = Date.now();
            if (now - lastInitAttempt < 2000) { // 2 second minimum between attempts
                setTimeout(initController, 2000);
                return;
            }
            lastInitAttempt = now;
            // Check if canvas is actually ready and has WebGL context
            const canvas = document.getElementById('three-canvas');
            if (!canvas) {
                console.warn('Canvas not found, delaying 3D initialization');
                setTimeout(initController, 2000); // Longer delay to prevent CPU overheating
                return;
            }

            try {
                // Test WebGL context availability
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                if (!gl) {
                    console.warn('WebGL context not available, delaying 3D initialization');
                    setTimeout(initController, 2000); // Longer delay to prevent CPU overheating
                    return;
                }

                if (isCleanedUp) return; // Component was unmounted
                
                ctrl = new App3DController(initialState);
                setController(ctrl);
                ctrl.onReady(() => {
                    if (!isCleanedUp) {
                        setReady(true);
                    }
                });
                ctrl.initialize().catch(error => {
                    console.error('Failed to initialize App3D:', error);
                    // Don't set ready to true if initialization failed
                });
            } catch (error) {
                console.error('Error during 3D initialization:', error);
                setTimeout(initController, 5000); // Much longer delay to prevent CPU overheating
            }
        };

        // Longer delay to ensure canvas is mounted and prevent CPU overheating
        setTimeout(initController, 1000);
        
        // Clean up on unmount or HMR
        const cleanup = () => {
            isCleanedUp = true;
            if (ctrl) {
                ctrl.dispose();
            }
        };
        
        if (import.meta.hot) {
            import.meta.hot.dispose(cleanup);
        }
        
        return cleanup;
    }, [initialState]);

    return { controller, ready };
} 