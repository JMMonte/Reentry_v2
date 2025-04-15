import { useEffect, useState } from 'react';
import { App3DController } from './App3DController';

export function useApp3D() {
    const [controller, setController] = useState(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const ctrl = new App3DController();
        setController(ctrl);
        ctrl.onReady(() => setReady(true));
        ctrl.initialize();
        return () => ctrl.dispose();
    }, []);

    return { controller, ready };
} 