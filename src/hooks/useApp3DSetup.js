import { useEffect } from 'react';

/**
 * Hook for App3D setup and complex event management
 * Extracts the complex useEffect logic from App.jsx
 */
export function useApp3DSetup(app3d, modalState, handleBodyChange, showToast) {
  
  // Setup app3D global reference and debug window management
  useEffect(() => {
    if (!app3d) return;
    
    // Global app3d reference
    window.app3d = app3d;
    
    // Debug window management
    app3d.createDebugWindow = (satellite) => {
      if (!satellite || satellite.id === undefined || satellite.id === null) {
        console.error("createDebugWindow called with invalid satellite or satellite.id", satellite);
        return;
      }
      modalState.setDebugWindows(prev => {
        if (prev.some(w => w.id === satellite.id)) return prev;
        console.log(`Creating debug window for satellite ${satellite.id}`);
        return [
          ...prev,
          {
            id: satellite.id,
            satellite,
            earth: app3d.earth,
            onBodySelect: handleBodyChange,
            onClose: () => app3d.removeDebugWindow(satellite.id),
            app3d
          }
        ];
      });
    };
    
    app3d.removeDebugWindow = (id) => {
      modalState.setDebugWindows(prev => prev.filter(w => w.id !== id));
    };
    
    return () => {
      delete window.app3d;
      delete app3d.createDebugWindow;
      delete app3d.removeDebugWindow;
    };
  }, [app3d, handleBodyChange, modalState]);

  // Connection status toasts
  useEffect(() => {
    function handleLost() {
      showToast('Simulation connection lost');
    }
    function handleRestored() {
      showToast('Simulation connection restored');
    }
    window.addEventListener('sim-connection-lost', handleLost);
    window.addEventListener('sim-connection-restored', handleRestored);
    return () => {
      window.removeEventListener('sim-connection-lost', handleLost);
      window.removeEventListener('sim-connection-restored', handleRestored);
    };
  }, [showToast]);

  // POI modal handling
  useEffect(() => {
    const open = modalState.openPointModals.length > 0;
    const feature = modalState.openPointModals[0]?.feature;
    const category = modalState.openPointModals[0]?.category;
    window.dispatchEvent(new CustomEvent('poiModal', {
      detail: { open, feature, category }
    }));
  }, [modalState.openPointModals]);

}