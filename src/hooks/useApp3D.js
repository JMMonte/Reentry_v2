import { useEffect, useState } from 'react';
import { App3DController } from '../simulation/App3DController';

export function useApp3D(initialState) {
    const [controller, setController] = useState(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const ctrl = new App3DController(initialState);
        setController(ctrl);
        ctrl.onReady(() => setReady(true));
        ctrl.initialize();
        // Clean up on unmount or HMR
        const cleanup = () => ctrl.dispose();
        if (import.meta.hot) {
            import.meta.hot.dispose(cleanup);
        }
        return cleanup;
    }, [initialState]);

    return { controller, ready };
} 