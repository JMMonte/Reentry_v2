import React, { useState, useEffect, useRef } from 'react';
import { ThemeProvider } from './components/ui/theme-provider';
import { Layout } from './components/ui/Layout';
import { defaultSettings } from './components/ui/controls/DisplayOptions';
import { useApp3D } from './simulation/useApp3D';
import { useSimulationState } from './simulation/useSimulationState';
import { SimulationStateManager } from './managers/SimulationStateManager';
import './styles/globals.css';
import './styles/animations.css';
import { SimulationProvider } from './simulation/SimulationContext';
import { useBodySelection } from './hooks/useBodySelection';
import { usePhysicsSatellites } from './hooks/usePhysicsSatellites';
import { PhysicsStateProvider } from './providers/PhysicsStateContext.jsx';
import { CelestialBodiesProvider } from './providers/CelestialBodiesContext.jsx';

// Custom hooks
import { useModalState } from './hooks/useAppState';
import { useSimulationSharing } from './hooks/useSimulationSharing';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSimulationEvents } from './hooks/useSimulationEvents';
import { ToastProvider, useToast } from './components/ui/Toast';
import { buildNavbarProps, buildModalProps } from './utils/propsBuilder';

function getInitialDisplaySettings(importedState) {
  const loaded = importedState?.displaySettings || {};
  const initial = {};
  Object.entries(defaultSettings).forEach(([key, setting]) => {
    initial[key] = loaded[key] !== undefined ? loaded[key] : setting.value;
  });
  return initial;
}

function App3DMain() {
  // Core state
  const [displaySettings, setDisplaySettings] = useState(() => 
    getInitialDisplaySettings(SimulationStateManager.decodeFromUrlHash())
  );
  const [authMode, setAuthMode] = useState('signin');
  const [importedState, setImportedState] = useState(() => 
    SimulationStateManager.decodeFromUrlHash()
  );
  const [simTime, setSimTime] = useState(() => new Date());
  const [checkedInitialState, setCheckedInitialState] = useState(false);
  const [isAssetsLoaded, setIsAssetsLoaded] = useState(false);
  const [isSimReady, setIsSimReady] = useState(false);
  const [timeWarpLoading, setTimeWarpLoading] = useState(false);
  
  // Refs
  const toastRef = useRef();
  
  // Custom hooks for state management
  const modalState = useModalState();
  const { controller, ready } = useApp3D(importedState);
  const app3d = controller?.app3d;
  
  // Custom hooks for business logic
  const sharingHooks = useSimulationSharing(app3d, toastRef);
  const { showToast } = useToast();
  
  // Satellite data
  const satellitesPhysics = usePhysicsSatellites(app3d);
  const satellitesUI = app3d?.satellites?.getSatellitesMap?.() || new Map();
  const satellites = Object.values(satellitesPhysics)
    .map(satState => {
      const satUI = satellitesUI.get(satState.id);
      if (!satUI) return null;
      return {
        ...satState,
        color: satUI.color,
        name: satUI.name,
        setColor: satUI.setColor?.bind(satUI),
        delete: satUI.delete?.bind(satUI)
      };
    })
    .filter(Boolean);

  // Body selection
  const {
    selectedBody,
    handleBodyChange,
    planetOptions,
    satelliteOptions,
    getDisplayValue,
    groupedPlanetOptions
  } = useBodySelection({
    app3dRef: { current: app3d },
    satellites: Object.values(satellites),
    importedState,
    ready
  });

  // Custom hooks for events and shortcuts
  useKeyboardShortcuts(app3d, sharingHooks.saveSimulationState);
  useSimulationEvents({
    setSimTime,
    setTimeWarpLoading,
    setIsSimReady,
    setIsAssetsLoaded,
    setOpenPointModals: modalState.setOpenPointModals,
    app3d
  });

  // One-time initialization
  useEffect(() => { setCheckedInitialState(true); }, []);

  // Hash change handling
  useEffect(() => {
    const onHashChange = () => {
      if (sharingHooks.ignoreNextHashChange.current) {
        sharingHooks.ignoreNextHashChange.current = false;
        return;
      }
      setImportedState(SimulationStateManager.decodeFromUrlHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [sharingHooks.ignoreNextHashChange]);

  // Simulation state management
  useSimulationState(controller, importedState);

  // Display settings sync
  useEffect(() => {
    if (importedState && importedState.displaySettings) {
      setDisplaySettings(getInitialDisplaySettings(importedState));
    }
  }, [importedState]);

  useEffect(() => {
    if (app3d && app3d.displaySettingsManager && typeof app3d.displaySettingsManager.applyAll === 'function') {
      app3d.displaySettingsManager.applyAll();
    }
  }, [app3d]);

  // Session sync
  useEffect(() => {
    if (app3d && app3d.sessionId) {
      setSimTime(app3d.timeUtils.getSimulatedTime());
    }
  }, [app3d?.sessionId]);

  // Time handling
  const handleSimulatedTimeChange = (newTime) => {
    setSimTime(new Date(newTime));
    
    const sessionId = app3d?.sessionId || controller?.sessionId;
    const physicsProviderType = app3d?.physicsProviderType;
    
    if (sessionId && physicsProviderType === 'remote') {
      console.log('[App.jsx] handleSimulatedTimeChange - Using backend API for remote physics');
      setSimTime(new Date(newTime));
    } else if (app3d?.timeUtils) {
      console.log('[App.jsx] handleSimulatedTimeChange - Using local time management');
      app3d.timeUtils.setSimulatedTime(newTime);
      
      if (app3d.physicsIntegration) {
        app3d.physicsIntegration.setSimulationTime(new Date(newTime));
      }
    } else {
      console.warn('[App.jsx] handleSimulatedTimeChange - No timeUtils found, cannot update simulation time');
    }
  };

  // Satellite deletion handling
  useEffect(() => {
    const handleSatelliteDeleted = (e) => {
      const deletedSatelliteId = e.detail?.id;
      if (deletedSatelliteId) {
        modalState.setDebugWindows(prev => prev.filter(w => w.id !== deletedSatelliteId));
        
        if (selectedBody) {
          if (selectedBody.id === deletedSatelliteId || 
              (typeof selectedBody === 'string' && selectedBody.includes(deletedSatelliteId))) {
            handleBodyChange('none');
          }
        }
      }
    };
    
    document.addEventListener('satelliteDeleted', handleSatelliteDeleted);
    return () => document.removeEventListener('satelliteDeleted', handleSatelliteDeleted);
  }, [selectedBody, handleBodyChange, modalState]);

  // Selected body updates
  useEffect(() => {
    if (
      controller?.app3d?.updateSelectedBody &&
      ready &&
      Array.isArray(controller.app3d.celestialBodies) &&
      controller.app3d.celestialBodies.length > 0
    ) {
      controller.app3d.updateSelectedBody(selectedBody, false);
    }
  }, [selectedBody, controller, ready]);

  // Satellite creation
  const onCreateSatellite = async (params) => {
    try {
      let result;
      if (params.mode === 'latlon') {
        result = await app3d?.createSatelliteFromLatLon(params);
      } else if (params.mode === 'orbital') {
        result = await app3d?.createSatelliteFromOrbitalElements(params);
      } else if (params.mode === 'circular') {
        result = await app3d?.createSatelliteFromLatLonCircular(params);
      }
      
      const satellite = result?.satellite || result;
      if (satellite) {
        modalState.setIsSatelliteModalOpen(false);
        handleBodyChange(satellite);
        app3d?.createDebugWindow?.(satellite);
      }
    } catch (error) {
      console.error('Error creating satellite:', error);
    }
  };

  // POI modal handling
  useEffect(() => {
    const open = modalState.openPointModals.length > 0;
    const feature = modalState.openPointModals[0]?.feature;
    const category = modalState.openPointModals[0]?.category;
    window.dispatchEvent(new CustomEvent('poiModal', {
      detail: { open, feature, category }
    }));
  }, [modalState.openPointModals]);

  // Global app3d reference
  useEffect(() => {
    if (app3d) {
      window.app3d = app3d;
    }
  }, [app3d]);

  // Debug window management
  useEffect(() => {
    if (!app3d) return;
    
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
            sessionId: app3d.sessionId,
            app3d
          }
        ];
      });
    };
    
    app3d.removeDebugWindow = (id) => {
      modalState.setDebugWindows(prev => prev.filter(w => w.id !== id));
    };
    
    return () => {
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

  if (!checkedInitialState) return null;

  // Build available bodies
  let availableBodies = [];
  if (Array.isArray(app3d?.celestialBodies)) {
    availableBodies = app3d.celestialBodies
      .filter(b => b && (b.naifId !== undefined && b.naifId !== null))
      .map(b => ({ ...b, naifId: b.naifId ?? b.naif_id }));
  }
  if (availableBodies.length === 0) {
    availableBodies = [{ name: 'Earth', naifId: 399, type: 'planet' }];
  }

  const isLoadingInitialData = !isAssetsLoaded || !isSimReady;

  // Build props using utility functions
  const navbarProps = buildNavbarProps({
    modalState,
    selectedBody,
    handleBodyChange,
    groupedPlanetOptions,
    satelliteOptions,
    getDisplayValue,
    app3d,
    timeWarpLoading,
    simTime,
    handleSimulatedTimeChange,
    satellites,
    handleImportState: (event) => sharingHooks.handleImportState(
      event, setDisplaySettings, setImportedState, getInitialDisplaySettings
    ),
    shareModalOpen: modalState.shareModalOpen,
    setShareModalOpen: modalState.setShareModalOpen,
    setShareUrl: sharingHooks.setShareUrl,
    isAuthOpen: modalState.isAuthOpen,
    setIsAuthOpen: modalState.setIsAuthOpen,
    setAuthMode,
    isSimulationOpen: modalState.isSimulationOpen,
    setIsSimulationOpen: modalState.setIsSimulationOpen,
    planetOptions
  });

  const modalProps = buildModalProps({
    modalState,
    controller,
    displaySettings,
    setDisplaySettings,
    app3d,
    satellites,
    handleBodyChange,
    debugWindows: modalState.debugWindows,
    onCreateSatellite,
    availableBodies,
    shareUrl: sharingHooks.shareUrl,
    shareCopied: sharingHooks.shareCopied,
    handleCopyShareUrl: sharingHooks.handleCopyShareUrl,
    handleShareViaEmail: sharingHooks.handleShareViaEmail,
    authMode,
    setAuthMode,
    showToast,
    satellitesPhysics
  });

  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <SimulationProvider 
        timeUtils={app3d?.timeUtils} 
        displaySettings={displaySettings} 
        simulatedTime={app3d?.timeUtils?.getSimulatedTime() ?? new Date()} 
        timeWarp={app3d?.timeUtils?.getTimeWarp() ?? 1}
      >
        <CelestialBodiesProvider>
          <PhysicsStateProvider>
            <Layout
              navbarProps={navbarProps}
              chatModalProps={modalProps.chatModal}
              displayOptionsProps={modalProps.displayOptions}
              debugWindows={modalState.debugWindows}
              satelliteListWindowProps={modalProps.satelliteListWindow}
              satelliteCreatorModalProps={modalProps.satelliteCreatorModal}
              shareModalProps={modalProps.shareModal}
              authModalProps={modalProps.authModal}
              simulationWindowProps={modalProps.simulationWindow}
              groundTrackWindowProps={modalProps.groundTrackWindow}
              earthPointModalProps={modalProps.earthPointModal}
              isLoadingInitialData={isLoadingInitialData}
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