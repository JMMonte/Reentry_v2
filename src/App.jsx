import React, { useEffect, useRef, useMemo, useState } from 'react';
import { ThemeProvider } from './components/ui/theme-provider';
import { Layout } from './components/ui/Layout';
import { useApp3D } from './hooks/useApp3D';
import { useSimulationState } from './hooks/useSimulationState';
import { SimulationStateManager } from './managers/SimulationStateManager';
import './styles/globals.css';
import './styles/animations.css';
import { SimulationProvider } from './simulation/SimulationContext.jsx';
import { useBodySelection } from './hooks/useBodySelection';
import { PhysicsStateProvider } from './providers/PhysicsStateContext.jsx';
import { CelestialBodiesProvider } from './providers/CelestialBodiesContext.jsx';

// New consolidated hooks
import { useAppStateConsolidated } from './hooks/useAppStateConsolidated.js';
import { useSatelliteOperations } from './hooks/useSatelliteOperations.js';
import { useTimeManagement } from './hooks/useTimeManagement.js';
import { useApp3DSetup } from './hooks/useApp3DSetup.js';

// Existing hooks
import { useSimulationSharing } from './hooks/useSimulationSharing';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSimulationEvents } from './hooks/useSimulationEvents';
import { ToastProvider, useToast } from './components/ui/Toast';
import { buildNavbarProps, buildModalProps } from './utils/propsBuilder';

function App3DMain() {
  // Refs
  const toastRef = useRef();
  
  // Consolidated app state (replaces 15+ useState calls)
  const appState = useAppStateConsolidated();
  
  // Core 3D setup
  const { controller, ready } = useApp3D(appState.importedState);
  const app3d = controller?.app3d;
  
  // Business logic hooks
  const sharingHooks = useSimulationSharing(app3d, toastRef);
  const { showToast } = useToast();
  
  // Satellite operations (extracted from App.jsx)
  const { satellites, satellitesPhysics, availableBodies } = useSatelliteOperations(app3d, appState.modalState, null, ready);
  
  // Body selection (depends on satellite data)
  const bodySelection = useBodySelection({
    app3dRef: { current: app3d },
    satellites: Object.values(satellites),
    importedState: appState.importedState,
    ready
  });
  
  // Satellite creation with proper handleBodyChange
  const { onCreateSatellite } = useSatelliteOperations(app3d, appState.modalState, bodySelection.handleBodyChange, ready);
  
  // Time management (extracted from App.jsx)
  const timeManagement = useTimeManagement(app3d, controller, appState.setSimTime);
  
  // Existing event and keyboard hooks
  useKeyboardShortcuts(app3d, sharingHooks.saveSimulationState);
  useSimulationEvents({
    setSimTime: appState.setSimTime,
    setTimeWarpLoading: appState.setTimeWarpLoading,
    setIsSimReady: appState.setIsSimReady,
    setIsAssetsLoaded: appState.setIsAssetsLoaded,
    setOpenPointModals: appState.modalState.setOpenPointModals,
    setLoadingProgress: appState.setLoadingProgress,
    setLoadingStage: appState.setLoadingStage,
    app3d
  });
  
  // App3D setup and complex event management (extracted from App.jsx)
  useApp3DSetup(app3d, appState.modalState, bodySelection.handleBodyChange, showToast);
  
  // Memoized props builders (moved to correct position)
  const navbarProps = useMemo(() => buildNavbarProps({
    modalState: appState.modalState,
    selectedBody: bodySelection.selectedBody,
    handleBodyChange: bodySelection.handleBodyChange,
    groupedPlanetOptions: bodySelection.groupedPlanetOptions,
    satelliteOptions: bodySelection.satelliteOptions,
    getDisplayValue: bodySelection.getDisplayValue,
    app3d,
    timeWarpLoading: appState.timeWarpLoading,
    simTime: appState.simTime,
    handleSimulatedTimeChange: timeManagement.handleSimulatedTimeChange,
    satellites: satellites,
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
  }), [appState, bodySelection, app3d, timeManagement, satellites, sharingHooks]);

  const modalProps = useMemo(() => buildModalProps({
    modalState: appState.modalState,
    controller,
    displaySettings: appState.displaySettings,
    setDisplaySettings: appState.setDisplaySettings,
    app3d,
    satellites: satellites,
    selectedBody: bodySelection.selectedBody,
    handleBodyChange: bodySelection.handleBodyChange,
    debugWindows: appState.modalState.debugWindows,
    onCreateSatellite: onCreateSatellite,
    availableBodies: availableBodies,
    shareUrl: sharingHooks.shareUrl,
    shareCopied: sharingHooks.shareCopied,
    handleCopyShareUrl: sharingHooks.handleCopyShareUrl,
    handleShareViaEmail: sharingHooks.handleShareViaEmail,
    authMode: appState.authMode,
    setAuthMode: appState.setAuthMode,
    showToast,
    satellitesPhysics: satellitesPhysics
  }), [appState, controller, app3d, satellites, bodySelection.selectedBody, onCreateSatellite, availableBodies, satellitesPhysics, bodySelection.handleBodyChange, sharingHooks, showToast]);

  // Simplified useEffect hooks (most complex logic moved to custom hooks)
  
  // One-time initialization
  useEffect(() => { appState.setCheckedInitialState(true); }, [appState.setCheckedInitialState]);
  
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

  // Display settings sync (consolidated)
  useEffect(() => {
    if (appState.importedState && appState.importedState.displaySettings) {
      // Move getInitialDisplaySettings logic to the consolidated hook
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

  // Session sync
  useEffect(() => {
    if (app3d && app3d.sessionId) {
      appState.setSimTime(app3d.timeUtils.getSimulatedTime());
    }
  }, [app3d?.sessionId, appState.setSimTime]);

  // Satellite deletion handling
  useEffect(() => {
    const handleSatelliteDeleted = (e) => {
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
    };
    
    document.addEventListener('satelliteDeleted', handleSatelliteDeleted);
    return () => document.removeEventListener('satelliteDeleted', handleSatelliteDeleted);
  }, [bodySelection.selectedBody, bodySelection.handleBodyChange, appState.modalState]);

  // Selected body updates
  useEffect(() => {
    if (
      controller?.app3d?.updateSelectedBody &&
      ready &&
      Array.isArray(controller.app3d.celestialBodies) &&
      controller.app3d.celestialBodies.length > 0
    ) {
      controller.app3d.updateSelectedBody(bodySelection.selectedBody, false);
    }
  }, [bodySelection.selectedBody, controller, ready]);

  if (!appState.checkedInitialState) return null;

  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <SimulationProvider 
        timeUtils={app3d?.timeUtils} 
        displaySettings={appState.displaySettings} 
        simulatedTime={app3d?.timeUtils?.getSimulatedTime() ?? new Date()} 
        timeWarp={app3d?.timeUtils?.getTimeWarp() ?? 1}
      >
        <CelestialBodiesProvider>
          <PhysicsStateProvider>
            <Layout
              navbarProps={navbarProps}
              chatModalProps={modalProps.chatModal}
              displayOptionsProps={modalProps.displayOptions}
              debugWindows={appState.modalState.debugWindows}
              satelliteListWindowProps={modalProps.satelliteListWindow}
              satelliteCreatorModalProps={modalProps.satelliteCreatorModal}
              shareModalProps={modalProps.shareModal}
              authModalProps={modalProps.authModal}
              simulationWindowProps={modalProps.simulationWindow}
              groundTrackWindowProps={modalProps.groundTrackWindow}
              earthPointModalProps={modalProps.earthPointModal}
              isLoadingInitialData={appState.isLoadingInitialData}
              loadingProgress={appState.loadingProgress}
              loadingStage={appState.loadingStage}
              satellitesPhysics={satellitesPhysics}
            >
              <canvas id="three-canvas" className="absolute inset-0 z-0" />
            </Layout>
          </PhysicsStateProvider>
        </CelestialBodiesProvider>
      </SimulationProvider>
    </ThemeProvider>
  );
}

function AppWithCanvas() {
  const [canvasReady, setCanvasReady] = useState(false);
  const [checkedInitialState, setCheckedInitialState] = useState(false);
  
  useEffect(() => { setCheckedInitialState(true); }, []);
  
  useEffect(() => {
    const check = () => {
      if (document.getElementById('three-canvas')) {
        setCanvasReady(true);
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  }, []);
  
  if (!checkedInitialState) return null;
  
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <div className="relative h-screen w-screen overflow-hidden">
        <canvas id="three-canvas" className="absolute inset-0 z-0" />
        {canvasReady && (
          <ToastProvider>
            <App3DMain />
          </ToastProvider>
        )}
      </div>
    </ThemeProvider>
  );
}

export default AppWithCanvas;