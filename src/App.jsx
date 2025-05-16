import React, { useState, useEffect, createContext, useRef } from 'react';
import { ThemeProvider } from './components/ui/theme-provider';
import { Layout } from './components/ui/Layout';
import { defaultSettings } from './components/ui/controls/DisplayOptions';
import { useApp3D } from './simulation/useApp3D';
import { useSimulationState } from './simulation/useSimulationState';
import { SimulationStateManager } from './managers/SimulationStateManager';
import './styles/globals.css';
import './styles/animations.css';
import LZString from 'lz-string';
import { SimulationProvider } from './simulation/SimulationContext';
import { useBodySelection } from './hooks/useBodySelection';
import { setSimulationDate, setTimewarp } from './utils/simApi.js';

const ToastContext = createContext({ showToast: () => { } });

const Toast = React.forwardRef((props, ref) => {
  const [visible, setVisible] = React.useState(false);
  const [internalMessage, setInternalMessage] = React.useState('');
  const hideTimeout = React.useRef();
  React.useImperativeHandle(ref, () => ({
    showToast: (msg) => {
      setInternalMessage(msg);
      setVisible(true);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        setVisible(false);
        hideTimeout.current = setTimeout(() => setInternalMessage(''), 500);
      }, 2000);
    }
  }), []);
  React.useEffect(() => {
    return () => hideTimeout.current && clearTimeout(hideTimeout.current);
  }, []);
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 32,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      {internalMessage && (
        <div
          className={`transition-all duration-500 ease-in-out transform ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} shadow-lg`}
          style={{
            background: 'linear-gradient(90deg, #232526 0%, #414345 100%)',
            color: '#fff',
            padding: '14px 36px',
            borderRadius: 12,
            fontSize: 17,
            fontWeight: 500,
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            minWidth: 220,
            textAlign: 'center',
            letterSpacing: 0.2,
            pointerEvents: 'auto',
          }}
        >
          {internalMessage}
        </div>
      )}
    </div>
  );
});
Toast.displayName = 'Toast';

function getInitialDisplaySettings(importedState) {
  const loaded = importedState?.displaySettings || {};
  const initial = {};
  Object.entries(defaultSettings).forEach(([key, setting]) => {
    initial[key] = loaded[key] !== undefined ? loaded[key] : setting.value;
  });
  return initial;
}

function App3DMain() {
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSatelliteListVisible, setIsSatelliteListVisible] = useState(false);
  const [debugWindows, setDebugWindows] = useState([]);
  const [satellites, setSatellites] = useState({});
  const [displaySettings, setDisplaySettings] = useState(() => getInitialDisplaySettings(SimulationStateManager.decodeFromUrlHash()));
  const [isDisplayOptionsOpen, setIsDisplayOptionsOpen] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [isGroundtrackOpen, setIsGroundtrackOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [importedState, setImportedState] = useState(() => SimulationStateManager.decodeFromUrlHash());
  const [simTime, setSimTime] = useState(() => new Date());
  const { controller, ready } = useApp3D(importedState);
  const app3d = controller?.app3d;
  const [checkedInitialState, setCheckedInitialState] = useState(false);
  const ignoreNextHashChange = React.useRef(false);
  const toastRef = useRef();
  const [openPointModals, setOpenPointModals] = useState([]);
  const showToast = (msg) => { toastRef.current?.showToast(msg); };
  useEffect(() => { setCheckedInitialState(true); }, []);
  useEffect(() => {
    const onHashChange = () => {
      if (ignoreNextHashChange.current) {
        ignoreNextHashChange.current = false;
        return;
      }
      setImportedState(SimulationStateManager.decodeFromUrlHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useSimulationState(controller, importedState);
  useEffect(() => {
    if (importedState && importedState.displaySettings) {
      setDisplaySettings(getInitialDisplaySettings(importedState));
    }
  }, [importedState]);
  useEffect(() => {
    const handleSatelliteListUpdate = () => {
      if (app3d && app3d.satellites) {
        const satsMap = app3d.satellites.getSatellites();
        setSatellites({ ...satsMap });
        setDebugWindows(prev =>
          prev.map(w => satsMap[w.id] ? { ...w, satellite: satsMap[w.id] } : null).filter(Boolean)
        );
      }
    };
    document.addEventListener('satelliteListUpdated', handleSatelliteListUpdate);
    handleSatelliteListUpdate();
    return () => document.removeEventListener('satelliteListUpdated', handleSatelliteListUpdate);
  }, [app3d]);
  useEffect(() => {
    if (app3d && app3d.displaySettingsManager && typeof app3d.displaySettingsManager.applyAll === 'function') {
      app3d.displaySettingsManager.applyAll();
    }
  }, [app3d]);
  useEffect(() => {
    if (app3d && app3d.sessionId) {
      // console.log('[App.jsx] sessionId useEffect - sessionId acquired:', app3d.sessionId, 'Initial simTime state for potential sync:', simTime.toISOString());
      // This call ensures that when a session ID first becomes available,
      // the backend is synced with the current simTime established by initialState or defaults.
      // It should NOT run every time simTime changes, only when sessionId becomes available.
      setSimulationDate(app3d.sessionId, simTime.toISOString());
    }
  }, [app3d?.sessionId]);
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.simulatedTime) {
        setSimTime(new Date(e.detail.simulatedTime));
      }
    };
    document.addEventListener('timeUpdate', handler);
    if (app3d?.timeUtils?.getSimulatedTime) {
      setSimTime(app3d.timeUtils.getSimulatedTime());
    }
    return () => document.removeEventListener('timeUpdate', handler);
  }, [app3d]);
  const handleSimulatedTimeChange = (newTime) => {
    console.log('[App.jsx] handleSimulatedTimeChange called with newTime:', newTime);
    setSimTime(new Date(newTime));
    const sessionId = app3d?.sessionId || controller?.sessionId;
    console.log('[App.jsx] handleSimulatedTimeChange - sessionId:', sessionId);
    if (sessionId) {
      console.log('[App.jsx] handleSimulatedTimeChange - Calling setSimulationDate for backend.');
      setSimulationDate(sessionId, new Date(newTime).toISOString());
    } else {
      console.warn('[App.jsx] handleSimulatedTimeChange - No sessionId found, backend will not be updated.');
    }
  };
  const {
    selectedBody,
    handleBodyChange,
    planetOptions,
    satelliteOptions,
    getDisplayValue
  } = useBodySelection({
    app3dRef: { current: app3d },
    satellites: Object.values(satellites),
    importedState,
    ready
  });
  useEffect(() => {
    if (controller?.app3d?.updateSelectedBody && ready) {
      controller.app3d.updateSelectedBody(selectedBody);
    }
  }, [selectedBody, controller, ready]);
  const onCreateSatellite = async (params) => {
    try {
      let satellite;
      if (params.mode === 'latlon') {
        satellite = await app3d?.createSatelliteFromLatLon(params);
      } else if (params.mode === 'orbital') {
        satellite = await app3d?.createSatelliteFromOrbitalElements(params);
      } else if (params.mode === 'circular') {
        satellite = await app3d?.createSatelliteFromLatLonCircular(params);
      }
      if (satellite) {
        setIsSatelliteModalOpen(false);
      }
    } catch (error) {
      console.error('Error creating satellite:', error);
    }
  };
  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      alert('Failed to copy URL: ' + err.message);
    }
  };
  const handleShareViaEmail = () => {
    const subject = encodeURIComponent('Check out this simulation state!');
    const body = encodeURIComponent(`Open this link to load the simulation state:
${shareUrl}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!app3d) return;
        const state = app3d.exportSimulationState();
        const json = JSON.stringify(state);
        const compressed = LZString.compressToEncodedURIComponent(json);
        ignoreNextHashChange.current = true;
        window.location.hash = `state=${compressed}`;
        showToast('Sim saved');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [app3d, showToast]);
  const handleImportState = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target.result);
        const app = app3d;
        if (!app) return;
        if (typeof app.importSimulationState === 'function') {
          app.importSimulationState(state);
        }
        if (state.displaySettings) {
          setDisplaySettings(getInitialDisplaySettings(state));
        }
        // Update imported state so the body-selection hook can restore focus
        setImportedState(state);
        const json = JSON.stringify(state);
        const compressed = LZString.compressToEncodedURIComponent(json);
        ignoreNextHashChange.current = true;
        window.location.hash = `state=${compressed}`;
        showToast('Sim saved');
      } catch (err) {
        alert('Failed to import simulation state: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  // Toggle modals on point click: open or close per feature & category
  useEffect(() => {
    const onPointClick = (e) => {
      const { feature, category } = e.detail;
      setOpenPointModals(prev => {
        const isSame = prev.length === 1 && prev[0].feature === feature && prev[0].category === category;
        // toggle off if clicking the same, else open only the new one
        return isSame ? [] : [{ feature, category }];
      });
    };
    window.addEventListener('earthPointClick', onPointClick);
    return () => window.removeEventListener('earthPointClick', onPointClick);
  }, []);
  // Notify App3D when a POI modal is open/closed
  useEffect(() => {
    const open = openPointModals.length > 0;
    const feature = openPointModals[0]?.feature;
    const category = openPointModals[0]?.category;
    window.dispatchEvent(new CustomEvent('poiModal', {
      detail: { open, feature, category }
    }));
  }, [openPointModals]);
  // Make the 3D app globally available for UI components
  useEffect(() => {
    if (app3d) {
      window.app3d = app3d;
    }
  }, [app3d]);
  if (!checkedInitialState) return null;
  // Build props for Layout
  const navbarProps = {
    onChatToggle: () => setIsChatVisible(!isChatVisible),
    onSatelliteListToggle: () => setIsSatelliteListVisible(!isSatelliteListVisible),
    onDisplayOptionsToggle: () => setIsDisplayOptionsOpen(!isDisplayOptionsOpen),
    onSatelliteCreatorToggle: () => setIsSatelliteModalOpen(!isSatelliteModalOpen),
    onSimulationToggle: () => setIsSimulationOpen(!isSimulationOpen),
    onGroundtrackToggle: () => setIsGroundtrackOpen(!isGroundtrackOpen),
    isChatVisible,
    isSatelliteListVisible,
    isDisplayOptionsOpen,
    isSatelliteModalOpen,
    selectedBody,
    onBodySelect: handleBodyChange,
    timeWarp: app3d?.timeUtils?.getTimeWarp() ?? 1,
    onTimeWarpChange: (newWarp) => {
      // Only send to backend
      const sessionId = app3d?.sessionId || controller?.sessionId;
      if (sessionId && app3d?.simSocket) setTimewarp(sessionId, newWarp, app3d.simSocket);
    },
    simulatedTime: simTime,
    onSimulatedTimeChange: handleSimulatedTimeChange,
    app3DRef: { current: app3d },
    satellites: Object.values(satellites),
    onShareState: undefined,
    onImportState: handleImportState,
    shareModalOpen,
    setShareModalOpen,
    setShareUrl,
    isAuthOpen,
    setIsAuthOpen,
    setAuthMode,
    simulationOpen: isSimulationOpen,
    setSimulationOpen: setIsSimulationOpen,
    planetOptions,
    satelliteOptions,
    getDisplayValue
  };
  const chatModalProps = {
    isOpen: isChatVisible,
    onClose: () => setIsChatVisible(false),
    socket: controller?.app3d?.socketManager?.socket
  };
  const displayOptionsProps = {
    settings: displaySettings,
    onSettingChange: (key, value) => {
      if (app3d) {
        app3d.updateDisplaySetting(key, value);
        setDisplaySettings(prev => ({ ...prev, [key]: value }));
      }
    },
    isOpen: isDisplayOptionsOpen,
    onOpenChange: setIsDisplayOptionsOpen,
    app3DRef: { current: app3d }
  };
  const satelliteListWindowProps = {
    satellites,
    isOpen: isSatelliteListVisible,
    setIsOpen: setIsSatelliteListVisible,
    onBodySelect: handleBodyChange,
    debugWindows,
    app3d
  };
  const satelliteCreatorModalProps = {
    isOpen: isSatelliteModalOpen,
    onClose: () => setIsSatelliteModalOpen(false),
    onCreate: onCreateSatellite
  };
  const shareModalProps = {
    isOpen: shareModalOpen,
    onClose: () => setShareModalOpen(false),
    shareUrl,
    shareCopied,
    onCopy: handleCopyShareUrl,
    onShareEmail: handleShareViaEmail
  };
  const authModalProps = {
    isOpen: isAuthOpen,
    onClose: () => setIsAuthOpen(false),
    mode: authMode,
    setMode: setAuthMode,
    onSignupSuccess: showToast
  };
  const earthPointModalProps = {
    openModals: openPointModals,
    onToggle: (feature, category) => {
      setOpenPointModals(prev => {
        const isSame = prev.length === 1 && prev[0].feature === feature && prev[0].category === category;
        // toggle off if clicking the same, else open only the new one
        return isSame ? [] : [{ feature, category }];
      });
    }
  };
  const groundTrackWindowProps = { isOpen: isGroundtrackOpen, onClose: () => setIsGroundtrackOpen(false) };
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <ToastContext.Provider value={{ showToast }}>
        <SimulationProvider timeUtils={app3d?.timeUtils} displaySettings={displaySettings} simulatedTime={app3d?.timeUtils?.getSimulatedTime() ?? new Date()} timeWarp={app3d?.timeUtils?.getTimeWarp() ?? 1}>
          <Layout
            navbarProps={navbarProps}
            chatModalProps={chatModalProps}
            displayOptionsProps={displayOptionsProps}
            debugWindows={debugWindows}
            satelliteListWindowProps={satelliteListWindowProps}
            satelliteCreatorModalProps={satelliteCreatorModalProps}
            shareModalProps={shareModalProps}
            authModalProps={authModalProps}
            simulationWindowProps={{ isOpen: isSimulationOpen, onClose: () => setIsSimulationOpen(false), satellites: Object.values(satellites) }}
            groundTrackWindowProps={groundTrackWindowProps}
            earthPointModalProps={earthPointModalProps}
          >
            {/* Main app content (canvas, etc.) */}
            <canvas id="three-canvas" className="absolute inset-0 z-0" />
          </Layout>
        </SimulationProvider>
        <Toast ref={toastRef} />
      </ToastContext.Provider>
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
        {canvasReady && <App3DMain />}
      </div>
    </ThemeProvider>
  );
}

export default AppWithCanvas;
export { ToastContext };
