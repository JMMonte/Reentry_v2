import { useCallback } from 'react';

/**
 * Hook for time-related operations
 * Extracts time management logic from App.jsx
 */
export function useTimeManagement(app3d, controller, setSimTime) {
  // Time handling callback
  const handleSimulatedTimeChange = useCallback((newTime) => {
    setSimTime(new Date(newTime));
    
    
    if (app3d?.timeUtils) {
      console.log('[TimeManagement] handleSimulatedTimeChange - Using local time management');
      app3d.timeUtils.setSimulatedTime(newTime);
      
      if (app3d.physicsIntegration) {
        app3d.physicsIntegration.setSimulationTime(new Date(newTime));
      }
    } else {
      console.warn('[TimeManagement] handleSimulatedTimeChange - No timeUtils found, cannot update simulation time');
    }
  }, [app3d, controller, setSimTime]);

  return {
    handleSimulatedTimeChange,
  };
}