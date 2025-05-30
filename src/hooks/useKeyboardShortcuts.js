import { useEffect } from 'react';

/**
 * Custom hook to handle keyboard shortcuts
 */
export function useKeyboardShortcuts(app3d, saveSimulationState) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveSimulationState();
      }
    };
    
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [app3d, saveSimulationState]);
}