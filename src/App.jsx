import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from './components/ui/theme-provider';
import { Layout } from './components/ui/Layout';
import { useApp3D } from './hooks/useApp3D';
import { useSimulationState } from './hooks/useSimulationState';
import { SimulationStateManager } from './managers/SimulationStateManager';
import './styles/globals.css';
import './styles/animations.css';
import { SimulationProvider } from './simulation/SimulationContext.jsx';
import { useBodySelection } from './hooks/useBodySelection';
import { useSimulationSharing } from './hooks/useSimulationSharing';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

import { ToastProvider, useToast } from './components/ui/Toast';
import { buildNavbarProps, buildModalProps } from './utils/propsBuilder';
import { useSatelliteOperations } from './hooks/useSatelliteOperations';

// New consolidated hooks
import { useAppStateConsolidated } from './hooks/useAppStateConsolidated.js';
import { useApp3DSetup } from './hooks/useApp3DSetup';



// Physics data manager that decouples physics updates from React re-renders
const usePhysicsDataDecoupled = () => {
  // React state only for UI-relevant changes (satellite creation/deletion, time warp changes)
  const [uiState, setUIState] = useState({
    satelliteCount: 0,
    timeWarp: 1,
    currentTime: new Date(),
    satelliteList: {} // Only IDs and UI properties
  });

  // Physics data stored in refs (doesn't trigger re-renders)
  const physicsDataRef = useRef({
    satellites: {},
    celestialBodies: {},
    currentTime: new Date(),
    timeWarp: 1
  });

  // Get current physics data (called during render)
  const getCurrentPhysicsData = useCallback(() => {
    // Try to get fresh data from physics engine
    try {
      if (window.app3d?.physicsIntegration?.physicsEngine) {
        const physicsState = window.app3d.physicsIntegration.physicsEngine.getSimulationState();
        if (physicsState) {
          physicsDataRef.current = {
            satellites: physicsState.satellites || {},
            celestialBodies: physicsState.bodies || {},
            currentTime: physicsState.time || physicsDataRef.current.currentTime,
            timeWarp: physicsDataRef.current.timeWarp
          };
        }
      }
         } catch {
       // Fallback to cached data if physics engine not available
    }

    return physicsDataRef.current;
  }, []);

  // Update only UI-relevant state changes
  const updateUIState = useCallback((updates) => {
    setUIState(prev => {
      let hasUIChanges = false;
      const newState = { ...prev };

      // Only update React state for UI-relevant changes
      if (updates.timeWarp !== undefined && updates.timeWarp !== prev.timeWarp) {
        newState.timeWarp = updates.timeWarp;
        physicsDataRef.current.timeWarp = updates.timeWarp;
        hasUIChanges = true;
      }

      if (updates.currentTime && updates.currentTime.getTime() !== prev.currentTime.getTime()) {
        // Update UI time for any change - the DateTimePicker needs real-time updates
        newState.currentTime = updates.currentTime;
        hasUIChanges = true;
        // Always update physics ref
        physicsDataRef.current.currentTime = updates.currentTime;
      }

      if (updates.satellites) {
        // Update physics ref immediately (no React re-render)
        physicsDataRef.current.satellites = updates.satellites;

        // Only update React state if satellite count changed (creation/deletion)
        const newCount = Object.keys(updates.satellites).length;
        if (newCount !== prev.satelliteCount) {
          newState.satelliteCount = newCount;
          // Update satellite list with UI-relevant properties only
          newState.satelliteList = Object.fromEntries(
            Object.entries(updates.satellites).map(([id, sat]) => [
              id,
              {
                id: sat.id,
                name: sat.name,
                color: sat.color,
                centralBodyNaifId: sat.centralBodyNaifId
              }
            ])
          );
          hasUIChanges = true;
        }
      }

      if (updates.celestialBodies) {
        physicsDataRef.current.celestialBodies = updates.celestialBodies;
        // Celestial bodies rarely change, so no UI state update needed
      }

      return hasUIChanges ? newState : prev;
    });
  }, []);

  return {
    uiState,
    getCurrentPhysicsData,
    updateUIState,
    physicsDataRef
  };
};

// Memoized satellite creation function to prevent recreation
const createSatelliteCreationHandler = (modalState) => {
  return async (params) => {
    try {
      if (!window.api) {
        console.error('External API not available for satellite creation');
        return null;
      }

      console.log('[App.jsx] Starting satellite creation with params:', params);

      // Convert UI params to API params format
      const apiParams = {
        mode: params.mode,
        name: params.name,
        mass: params.mass,
        size: params.size,
        ballisticCoefficient: params.ballisticCoefficient,
        centralBodyNaifId: params.planetNaifId,
        commsConfig: params.commsConfig
      };

      if (params.mode === 'latlon') {
        Object.assign(apiParams, {
          latitude: params.latitude,
          longitude: params.longitude,
          altitude: params.altitude,
          azimuth: params.azimuth,
          velocity: params.velocity,
          angleOfAttack: params.angleOfAttack,
          circular: params.circular
        });
      } else if (params.mode === 'orbital') {
        Object.assign(apiParams, {
          semiMajorAxis: params.semiMajorAxis,
          eccentricity: params.eccentricity,
          inclination: params.inclination,
          raan: params.raan,
          argumentOfPeriapsis: params.argumentOfPeriapsis,
          trueAnomaly: params.trueAnomaly,
          referenceFrame: params.referenceFrame
        });
      }

      console.log('[App.jsx] Calling window.api.createSatellite with:', apiParams);
      const result = await window.api.createSatellite(apiParams);
      console.log('[App.jsx] API result:', result);

      if (result.success) {
        console.log('[App.jsx] Satellite creation successful:', result.satellite);

        // Check physics engine immediately after creation
        if (window.app3d?.physicsIntegration?.physicsEngine) {
          const physicsEngine = window.app3d.physicsIntegration.physicsEngine;
          const allSatellites = physicsEngine.satelliteEngine?.getSatelliteStates?.();
          console.log('[App.jsx] Physics engine state after creation:', {
            totalSatellites: Object.keys(allSatellites || {}).length,
            newSatelliteExists: !!(allSatellites?.[result.satellite.id]),
            satelliteIds: Object.keys(allSatellites || {})
          });
        }

        // PROPER SATELLITE CREATION FLOW:
        // 1. Close the satellite creation window
        modalState.setIsSatelliteModalOpen(false);

        // 2. Open the satellite list window to show all satellites
        modalState.setIsSatelliteListVisible(true);

        // 3. Open the debug window for the newly created satellite immediately
        if (result.satellite && result.satellite.id) {
          const newSatellite = {
            id: result.satellite.id,
            name: result.satellite.name || params.name || `Satellite ${result.satellite.id}`,
            color: result.satellite.color || 0xffff00,
            centralBodyNaifId: apiParams.centralBodyNaifId
          };

          console.log('[App.jsx] Opening debug window for satellite:', newSatellite);

          // Add to debug windows immediately - the debug window will handle missing physics data gracefully
          modalState.setDebugWindows(prev => {
            const exists = prev.some(w => w.id === newSatellite.id);
            if (!exists) {
              return [...prev, {
                id: newSatellite.id,
                satellite: newSatellite,
                onClose: () => modalState.setDebugWindows(windows =>
                  windows.filter(w => w.id !== newSatellite.id)
                )
              }];
            }
            return prev;
          });
        }

        return result;
      } else {
        throw new Error(result.error || 'Failed to create satellite');
      }
    } catch (error) {
      console.error('Error creating satellite:', error);
      throw error;
    }
  };
};

const App3DMain = React.memo(function App3DMain() {
  const toastRef = useRef(null);

  // Consolidated app state management
  const appState = useAppStateConsolidated();

  // App3D controller and readiness
  const { controller, ready } = useApp3D(appState.importedState);
  const app3d = controller?.app3d;

  // Sharing and import/export functionality
  const sharingHooks = useSimulationSharing(app3d, toastRef);
  const { showToast } = useToast();

  // Decoupled physics data system - physics runs at 60fps, React only re-renders for UI changes
  const { uiState, getCurrentPhysicsData, updateUIState } = usePhysicsDataDecoupled();

  // Consolidated physics event handler with debouncing
  useEffect(() => {
    const handleTimeUpdate = (event) => {
      const { simulatedTime, timeWarp } = event.detail || {};

      if (simulatedTime || timeWarp !== undefined) {
        updateUIState({
          currentTime: simulatedTime instanceof Date ? simulatedTime : new Date(simulatedTime),
          timeWarp: timeWarp
        });
      }
    };

    const handlePhysicsUpdate = (event) => {
      const { state } = event.detail || {};

      if (state?.satellites) {
        updateUIState({ satellites: state.satellites });
      }
    };

    // Only listen to essential events - physics engine already throttles appropriately
    document.addEventListener('timeUpdate', handleTimeUpdate);
    window.addEventListener('physicsUpdate', handlePhysicsUpdate);

    // Get initial physics data once
    const getInitialPhysicsData = () => {
      try {
        if (window.app3d?.physicsIntegration?.physicsEngine) {
          const physicsState = window.app3d.physicsIntegration.physicsEngine.getSimulationState();
          if (physicsState?.satellites) {
            updateUIState({ satellites: physicsState.satellites });
          }
          if (physicsState?.time) {
            updateUIState({ currentTime: physicsState.time });
          }
        }
      } catch {
        // Silent fallback for physics data
      }
    };

    getInitialPhysicsData();

    return () => {
      document.removeEventListener('timeUpdate', handleTimeUpdate);
      window.removeEventListener('physicsUpdate', handlePhysicsUpdate);
    };
  }, [updateUIState]);

  // Initialize physics data from app3d when available
  useEffect(() => {
    if (app3d?.timeUtils && ready) {
      const currentTime = app3d.timeUtils.getSimulatedTime?.();
      const timeWarp = app3d.timeUtils.getTimeWarp?.();

      if (currentTime || timeWarp !== undefined) {
        updateUIState({
          currentTime: currentTime || uiState.currentTime,
          timeWarp: timeWarp !== undefined ? timeWarp : uiState.timeWarp
        });
      }
    }
  }, [app3d?.timeUtils, ready, updateUIState]);

  // Memoize the satellite creation handler to prevent recreation
  const onCreateSatellite = useMemo(() => createSatelliteCreationHandler(appState.modalState), [appState.modalState]);

  // Stable references that don't trigger re-renders
  const celestialBodiesArray = useMemo(() => {
    const physicsData = getCurrentPhysicsData();
    return Object.values(physicsData.celestialBodies || {});
  }, [getCurrentPhysicsData, uiState.satelliteCount]); // Only depend on satellite count, not physics data

  const satellitesPhysicsObject = useMemo(() => {
    const physicsData = getCurrentPhysicsData();
    return physicsData.satellites || {};
  }, [getCurrentPhysicsData, uiState.satelliteCount]); // Only depend on satellite count, not physics data

  // Body selection with optimized dependencies
  const bodySelectionDeps = useMemo(() => ({
    app3dRef: { current: app3d },
    satelliteMap: uiState.satelliteList, // Use UI state instead of physics data
    importedState: appState.importedState,
    ready,
    centralizedBodies: {} // Don't pass physics data to avoid re-renders
  }), [app3d, uiState.satelliteList, appState.importedState, ready]);

  const bodySelection = useBodySelection(bodySelectionDeps);

  // Satellite operations - only depends on UI state
  const { satellites: richSatellites } = useSatelliteOperations(
    app3d,
    appState.modalState,
    bodySelection.handleBodyChange,
    uiState.satelliteList // Use UI state instead of physics data
  );

  // Get available bodies from existing data sources
  const availableBodies = useMemo(() => {
    if (!app3d?.celestialBodies) {
      return [{ name: 'Earth', naifId: 399, type: 'planet' }];
    }

    const celestialBodiesArray = Array.isArray(app3d.celestialBodies)
      ? app3d.celestialBodies
      : Object.values(app3d.celestialBodies);

    return celestialBodiesArray
      .filter(body => body && body.name && (body.naifId || body.naif_id))
      .map(body => ({
        name: body.name,
        naifId: body.naifId || body.naif_id,
        type: body.type || 'planet'
      }));
  }, [app3d?.celestialBodies]);

  // UI-stable satellite data based on UI state (not physics data)
  const satellitesUIStable = useMemo(() => {
    const uiStable = {};

    for (const [id, satellite] of Object.entries(uiState.satelliteList)) {
      uiStable[id] = {
        ...satellite,
        // Add the methods from richSatellites if available
        setColor: Array.isArray(richSatellites) ? richSatellites.find(s => s.id === satellite.id)?.setColor : undefined,
        delete: Array.isArray(richSatellites) ? richSatellites.find(s => s.id === satellite.id)?.delete : undefined
      };
    }

    return uiStable;
  }, [uiState.satelliteList, richSatellites]);

  // Time management functions - optimized for UI responsiveness
  const handleSimulatedTimeChange = useCallback(async (newTime) => {
    const timeToSet = typeof newTime === 'string' ? new Date(newTime) : newTime;

    // Update UI state immediately for responsive feedback
    updateUIState({ currentTime: timeToSet });

    // Update physics asynchronously
    setTimeout(async () => {
      try {
        if (app3d?.physicsIntegration?.physicsEngine?.setTime) {
          await app3d.physicsIntegration.physicsEngine.setTime(timeToSet);
        }

        if (app3d?.timeUtils?.updateFromPhysics) {
          app3d.timeUtils.updateFromPhysics(timeToSet);
        } else if (app3d?.timeUtils?.setSimulatedTime) {
          app3d.timeUtils.setSimulatedTime(timeToSet);
        }
      } catch (error) {
        console.warn('[App.jsx] Physics time update failed:', error);
      }
    }, 0);
  }, [app3d?.timeUtils, app3d?.physicsIntegration, updateUIState]);

  const handleTimeWarpChange = useCallback((newTimeWarp) => {
    // Update UI state immediately
    updateUIState({ timeWarp: newTimeWarp });

    // Update physics asynchronously
    setTimeout(() => {
      try {
        if (app3d?.timeUtils?.setLocalTimeWarp) {
          app3d.timeUtils.setLocalTimeWarp(newTimeWarp);
        } else if (app3d?.physicsIntegration?.setTimeWarpValue) {
          app3d.physicsIntegration.setTimeWarpValue(newTimeWarp);
        }
      } catch (error) {
        console.warn('[App.jsx] Time warp update failed:', error);
      }
    }, 0);
  }, [app3d?.timeUtils, app3d?.physicsIntegration, updateUIState]);

  // Existing event and keyboard hooks
  useKeyboardShortcuts(app3d, sharingHooks.saveSimulationState);

  // App3D setup and complex event management
  useApp3DSetup(app3d, appState.modalState, bodySelection.handleBodyChange, showToast);

  // Optimized props builders - only depend on UI state
  const navbarProps = useMemo(() => buildNavbarProps({
    modalState: appState.modalState,
    selectedBody: bodySelection.selectedBody || 'none',
    handleBodyChange: bodySelection.handleBodyChange,
    groupedPlanetOptions: bodySelection.groupedPlanetOptions,
    satelliteOptions: bodySelection.satelliteOptions,
    getDisplayValue: bodySelection.getDisplayValue,
    app3d,
    timeWarpLoading: appState.timeWarpLoading,
    simTime: uiState.currentTime,
    timeWarp: uiState.timeWarp,
    handleSimulatedTimeChange,
    onTimeWarpChange: handleTimeWarpChange,
    satellites: richSatellites,
    handleImportState: (event) => sharingHooks.handleImportState(
      event, appState.setDisplaySettings, appState.setImportedState, (state) => state?.displaySettings || {}
    ),
    shareModalOpen: appState.modalState.shareModalOpen,
    setShareModalOpen: appState.modalState.setShareModalOpen,
    setShareUrl: sharingHooks.setShareUrl,
    isAuthOpen: appState.modalState.isAuthOpen,
    setIsAuthOpen: appState.modalState.setIsAuthOpen,
    setAuthMode: appState.setAuthMode,
    isSimulationOpen: appState.modalState.isSimulationOpen,
    setIsSimulationOpen: appState.modalState.setIsSimulationOpen,
    planetOptions: bodySelection.planetOptions
  }), [
    appState.modalState,
    bodySelection,
    app3d,
    appState.timeWarpLoading,
    uiState.currentTime,
    uiState.timeWarp,
    handleSimulatedTimeChange,
    handleTimeWarpChange,
    richSatellites,
    sharingHooks,
    appState.setDisplaySettings,
    appState.setImportedState,
    appState.setAuthMode
  ]);

  // Modal props that need physics data use the getCurrentPhysicsData function
  const modalProps = useMemo(() => buildModalProps({
    modalState: appState.modalState,
    displaySettings: appState.displaySettings,
    setDisplaySettings: appState.setDisplaySettings,
    app3d,
    onCreateSatellite,
    availableBodies: availableBodies,
    selectedBody: bodySelection.selectedBody || 'none',
    satellites: satellitesUIStable,
    satellitesPhysics: satellitesPhysicsObject,
    simTime: uiState.currentTime.getTime(),
    centralizedBodies: app3d?.physicsIntegration?.physicsEngine?.getSimulationState() || celestialBodiesArray,
    handleBodyChange: bodySelection.handleBodyChange,
    debugWindows: appState.modalState.debugWindows || [],
    shareUrl: sharingHooks.shareUrl || '',
    shareCopied: sharingHooks.shareCopied || false,
    handleCopyShareUrl: sharingHooks.handleCopyShareUrl || (() => { }),
    handleShareViaEmail: sharingHooks.handleShareViaEmail || (() => { }),
    authMode: appState.authMode || 'login',
    setAuthMode: appState.setAuthMode,
    showToast,
    planetOptions: bodySelection.planetOptions || [],
    groupedPlanetOptions: bodySelection.groupedPlanetOptions || [],
    // Pass the physics data getter for real-time updates in debug windows
    getCurrentPhysicsData
  }), [
    appState.modalState,
    appState.displaySettings,
    appState.setDisplaySettings,
    app3d,
    onCreateSatellite,
    availableBodies,
    bodySelection.groupedPlanetOptions,
    bodySelection.planetOptions,
    bodySelection.selectedBody,
    bodySelection.handleBodyChange,
    satellitesUIStable,
    satellitesPhysicsObject,
    uiState.currentTime,
    celestialBodiesArray,
    sharingHooks,
    appState.authMode,
    appState.setAuthMode,
    showToast,
    getCurrentPhysicsData
  ]);

  // One-time initialization
  useEffect(() => {
    appState.setCheckedInitialState(true);
  }, [appState.setCheckedInitialState]);

  // Hash change handling
  useEffect(() => {
    const onHashChange = () => {
      if (sharingHooks.ignoreNextHashChange.current) {
        sharingHooks.ignoreNextHashChange.current = false;
        return;
      }
      appState.setImportedState(SimulationStateManager.decodeFromUrlHash());
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [sharingHooks.ignoreNextHashChange, appState.setImportedState]);

  // Simulation state management
  useSimulationState(controller, appState.importedState);

  // Display settings sync
  const displaySettingsEffect = useCallback(() => {
    if (appState.importedState && appState.importedState.displaySettings) {
      const loaded = appState.importedState.displaySettings || {};
      const initial = {};
      Object.entries(appState.displaySettings).forEach(([key, setting]) => {
        initial[key] = loaded[key] !== undefined ? loaded[key] : setting.value;
      });
      appState.setDisplaySettings(initial);
    }

    if (app3d && app3d.displaySettingsManager && typeof app3d.displaySettingsManager.applyAll === 'function') {
      app3d.displaySettingsManager.applyAll();
    }
  }, [appState.importedState, app3d, appState.setDisplaySettings, appState.displaySettings]);

  useEffect(() => {
    displaySettingsEffect();
  }, [displaySettingsEffect]);

  // Sync app state with UI state (not physics data)
  useEffect(() => {
    appState.setSimTime(uiState.currentTime);
  }, [uiState.currentTime, appState.setSimTime]);

  // Satellite deletion handling
  const satelliteDeletionHandler = useCallback((e) => {
    const deletedSatelliteId = e.detail?.id;
    if (deletedSatelliteId) {
      appState.modalState.setDebugWindows(prev => prev.filter(w => w.id !== deletedSatelliteId));

      if (bodySelection.selectedBody) {
        if (bodySelection.selectedBody.id === deletedSatelliteId ||
          (typeof bodySelection.selectedBody === 'string' && bodySelection.selectedBody.includes(deletedSatelliteId))) {
          bodySelection.handleBodyChange('none');
        }
      }
    }
  }, [bodySelection.selectedBody, bodySelection.handleBodyChange, appState.modalState]);

  useEffect(() => {
    document.addEventListener('satelliteDeleted', satelliteDeletionHandler);
    return () => document.removeEventListener('satelliteDeleted', satelliteDeletionHandler);
  }, [satelliteDeletionHandler]);

  // Update app state based on satellite count
  useEffect(() => {
    if (uiState.currentTime && uiState.timeWarp !== undefined) {
      appState.setIsAssetsLoaded(true);
      appState.setIsSimReady(true);
    }
  }, [
    uiState.currentTime,
    uiState.timeWarp,
    appState.setIsAssetsLoaded,
    appState.setIsSimReady
  ]);

  if (!appState.checkedInitialState) return null;

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <ToastProvider ref={toastRef}>
        <SimulationProvider
          app3d={app3d}
          controller={controller}
          ready={ready}
          timeUtils={app3d?.timeUtils || {
            formatTime: (time) => time?.toISOString?.() || new Date().toISOString(),
            parseTime: (timeStr) => new Date(timeStr)
          }}
          displaySettings={appState.displaySettings || {
            showGrid: { value: true },
            enableFXAA: { value: true },
            showOrbits: { value: true }
          }}
          simulatedTime={uiState.currentTime || new Date()}
          timeWarp={uiState.timeWarp || 1}
        >
          <Layout
            navbarProps={navbarProps}
            chatModalProps={modalProps.chatModal}
            displayOptionsProps={modalProps.displayOptions}
            debugWindows={appState.modalState.debugWindows || []}
            satelliteListWindowProps={modalProps.satelliteListWindow}
            satelliteCreatorModalProps={modalProps.satelliteCreatorModal}
            shareModalProps={modalProps.shareModal}
            authModalProps={modalProps.authModal}
            simulationWindowProps={modalProps.simulationWindow}
            groundTrackWindowProps={modalProps.groundTrackWindow}
            earthPointModalProps={modalProps.earthPointModal}
            satellitesPhysics={satellitesPhysicsObject}
            groundTrackData={appState.modalState.groundTrackData}
            celestialBodies={celestialBodiesArray}
          >
          </Layout>
        </SimulationProvider>
      </ToastProvider>
      <Analytics />
    </ThemeProvider>
  );
});

const AppWithCanvas = React.memo(function AppWithCanvas() {
  const [canvasReady, setCanvasReady] = useState(false);
  const [checkedInitialState, setCheckedInitialState] = useState(false);

  useEffect(() => {
    setCheckedInitialState(true);
  }, []);

  // Wait for canvas to be available before initializing 3D
  useEffect(() => {
    let timeoutId = null;
    let attempts = 0;
    const maxAttempts = 100; // Prevent infinite checking

    const check = () => {
      const canvas = document.getElementById('three-canvas');
      if (canvas && canvas.getContext) {
        try {
          // Test that we can actually get a context
          const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
          if (ctx) {
            setCanvasReady(true);
            return;
          }
        } catch (err) {
          console.warn('Canvas context not ready:', err);
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        timeoutId = setTimeout(check, 100); // Reduced from 10ms to 100ms to prevent CPU burn
      } else {
        console.error('Canvas failed to initialize after maximum attempts');
      }
    };

    check();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  if (!checkedInitialState) return null;

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <div className="relative h-screen w-screen overflow-hidden">
        <canvas id="three-canvas" className="absolute inset-0 z-0" />
        {canvasReady && (
          <ToastProvider>
            <App3DMain />
          </ToastProvider>
        )}
        <Analytics />
      </div>
    </ThemeProvider>
  );
});

export default AppWithCanvas;