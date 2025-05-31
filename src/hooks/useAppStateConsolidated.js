import { useState } from 'react';
import { useModalState } from './useAppState.js';
import { SimulationStateManager } from '../managers/SimulationStateManager.js';
import { defaultSettings } from '../components/ui/controls/DisplayOptions.jsx';

/**
 * Consolidated app state management hook
 * Consolidates all the scattered state from App.jsx into organized groups
 */
export function useAppStateConsolidated() {
  // Modal state (already well organized)
  const modalState = useModalState();

  // Auth state
  const [authMode, setAuthMode] = useState('signin');

  // Simulation timing state
  const [simTime, setSimTime] = useState(() => new Date());
  const [timeWarpLoading, setTimeWarpLoading] = useState(false);

  // Initialization state
  const [checkedInitialState, setCheckedInitialState] = useState(false);
  const [isAssetsLoaded, setIsAssetsLoaded] = useState(false);
  const [isSimReady, setIsSimReady] = useState(false);

  // Import/Export state
  const [importedState, setImportedState] = useState(() => 
    SimulationStateManager.decodeFromUrlHash()
  );

  // Display settings state
  const [displaySettings, setDisplaySettings] = useState(() => 
    getInitialDisplaySettings(SimulationStateManager.decodeFromUrlHash())
  );

  return {
    // Modal state (all modal-related state and togglers)
    modalState,

    // Auth state
    authMode,
    setAuthMode,

    // Simulation timing
    simTime,
    setSimTime,
    timeWarpLoading,
    setTimeWarpLoading,

    // Initialization state
    checkedInitialState,
    setCheckedInitialState,
    isAssetsLoaded,
    setIsAssetsLoaded,
    isSimReady,
    setIsSimReady,

    // Import/Export state
    importedState,
    setImportedState,

    // Display settings
    displaySettings,
    setDisplaySettings,

    // Computed state
    isLoadingInitialData: !isAssetsLoaded || !isSimReady,
  };
}

// Helper function extracted from App.jsx
function getInitialDisplaySettings(importedState) {
  const loaded = importedState?.displaySettings || {};
  const initial = {};
  Object.entries(defaultSettings).forEach(([key, setting]) => {
    initial[key] = loaded[key] !== undefined ? loaded[key] : setting.value;
  });
  return initial;
}