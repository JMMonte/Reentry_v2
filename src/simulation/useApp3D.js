import { useEffect, useState } from 'react';
import { App3DController } from './App3DController';

export function useApp3D(initialState) {
    const [controller, setController] = useState(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const ctrl = new App3DController(initialState);
        setController(ctrl);
        ctrl.onReady(() => setReady(true));
        ctrl.initialize();
        return () => ctrl.dispose();
    }, [initialState]);

    return { controller, ready };
} 