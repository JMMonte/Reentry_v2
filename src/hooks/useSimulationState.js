import { useEffect } from 'react';

export function useSimulationState(controller, initialState) {
    useEffect(() => {
        if (controller && controller.ready && initialState && controller.app3d?.simulationStateManager) {
            // Wait for orbit manager to be ready before importing state
            const importStateWhenReady = () => {
                if (controller.app3d.satelliteOrbitManager) {
                    controller.app3d.simulationStateManager.importState(initialState);
                } else {
                    setTimeout(importStateWhenReady, 100);
                }
            };
            
            importStateWhenReady();
        }
    }, [controller, initialState, controller?.ready]);
}
