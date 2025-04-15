import { useEffect } from 'react';
import { SimulationStateManager } from './SimulationStateManager';

export function useSimulationState(controller, initialState) {
    useEffect(() => {
        if (controller && controller.ready && initialState) {
            const manager = new SimulationStateManager(controller.app3d);
            manager.importState(initialState);
        }
    }, [controller, initialState, controller?.ready]);
} 