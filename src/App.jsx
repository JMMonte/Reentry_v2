import React, { useState, useEffect, useMemo, createContext, useRef } from 'react';
import { io } from 'socket.io-client';
import { ThemeProvider } from './components/theme-provider';
import { Layout } from './components/Layout';
import { defaultSettings } from './components/ui/controls/DisplayOptions';
import { useApp3D } from './simulation/useApp3D';
import { useSimulationState } from './simulation/useSimulationState';
import { SimulationStateManager } from './simulation/SimulationStateManager';
import './styles/globals.css';
import './styles/animations.css';
import LZString from 'lz-string';

const ToastContext = createContext({ showToast: () => {} });

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
  const [socket, setSocket] = useState(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSatelliteListVisible, setIsSatelliteListVisible] = useState(false);
  const [debugWindows, setDebugWindows] = useState([]);
  const [satellites, setSatellites] = useState({});
  const [selectedBody, setSelectedBody] = useState('earth');
  const [timeWarp, setTimeWarp] = useState(1);
  const [simulatedTime, setSimulatedTime] = useState(new Date());
  const [displaySettings, setDisplaySettings] = useState(() => getInitialDisplaySettings(SimulationStateManager.decodeFromUrlHash()));
  const [isDisplayOptionsOpen, setIsDisplayOptionsOpen] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [importedState, setImportedState] = useState(() => SimulationStateManager.decodeFromUrlHash());
  const { controller } = useApp3D(importedState);
  const app3d = controller?.app3d;
  const [checkedInitialState, setCheckedInitialState] = useState(false);
  const ignoreNextHashChange = React.useRef(false);
  const toastRef = useRef();
  const showToast = (msg) => {
    toastRef.current?.showToast(msg);
  };
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
    if (importedState && importedState.camera && typeof importedState.camera.focusedBody !== 'undefined') {
      setSelectedBody(importedState.camera.focusedBody || 'earth');
    }
  }, [importedState]);
  useEffect(() => {
    const socketServerUrl = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3000';
    const newSocket = io(socketServerUrl, {
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      secure: socketServerUrl.startsWith('https'),
      withCredentials: true
    });
    newSocket.on('connect', () => { });
    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
    setSocket(newSocket);
    return () => { if (newSocket) newSocket.close(); };
  }, []);
  useEffect(() => {
    const handleSatelliteListUpdate = () => {
      if (app3d && app3d.satellites) {
        const satellites = app3d.satellites.getSatellites();
        setSatellites(satellites);
        setDebugWindows(prev =>
          prev.map(w => satellites[w.id] ? { ...w, satellite: satellites[w.id] } : null).filter(Boolean)
        );
      }
    };
    document.addEventListener('satelliteListUpdated', handleSatelliteListUpdate);
    return () => document.removeEventListener('satelliteListUpdated', handleSatelliteListUpdate);
  }, [app3d]);
  useEffect(() => {
    if (app3d && app3d.displaySettingsManager && typeof app3d.displaySettingsManager.applyAll === 'function') {
      app3d.displaySettingsManager.applyAll();
    }
  }, [app3d]);
  useEffect(() => {
    const handleTimeUpdate = (event) => {
      const { simulatedTime, timeWarp } = event.detail;
      setSimulatedTime(simulatedTime);
      setTimeWarp(timeWarp);
    };
    document.addEventListener('timeUpdate', handleTimeUpdate);
    return () => document.removeEventListener('timeUpdate', handleTimeUpdate);
  }, []);
  useEffect(() => {
    if (!app3d) return;
    document.dispatchEvent(new CustomEvent('updateTimeWarp', { detail: { value: timeWarp } }));
  }, [timeWarp, app3d]);
  useEffect(() => {
    if (!app3d) return;
    app3d.createDebugWindow = (satellite) => {
      setDebugWindows(prev => {
        if (prev.some(w => w.id === satellite.id)) return prev;
        return [
          ...prev,
          {
            id: satellite.id,
            satellite,
            onBodySelect: handleBodySelect,
            onClose: () => app3d.removeDebugWindow(satellite.id)
          }
        ];
      });
    };
    app3d.updateSatelliteList = () => {
      setSatellites(app3d.satellites.getSatellites());
    };
    app3d.removeDebugWindow = (satelliteId) => {
      setDebugWindows(prev => prev.filter(w => w.id !== satelliteId));
    };
  }, [app3d]);
  useEffect(() => {
    const handleSatelliteDeleted = (event) => {
      setDebugWindows(prev => prev.filter(w => w.id !== event.detail.id));
    };
    document.addEventListener('satelliteDeleted', handleSatelliteDeleted);
    return () => document.removeEventListener('satelliteDeleted', handleSatelliteDeleted);
  }, []);
  const handleSimulatedTimeChange = (newTime) => {
    if (app3d?.timeUtils) {
      app3d.timeUtils.setSimulatedTime(newTime);
    }
  };
  const handleBodySelect = (value) => {
    setSelectedBody(value);
    if (!window.handlingBodySelectedEvent) {
      window.handlingBodySelectedEvent = true;
      document.dispatchEvent(new CustomEvent('bodySelected', { detail: { body: value } }));
      window.handlingBodySelectedEvent = false;
    }
  };
  const navbarSatellites = useMemo(() => satellites, [satellites]);
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
    const body = encodeURIComponent(`Open this link to load the simulation state:\n${shareUrl}`);
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
        if (state.camera && typeof state.camera.focusedBody !== 'undefined') {
          setSelectedBody(state.camera.focusedBody || 'earth');
        }
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
  if (!checkedInitialState) return null;
  // Build props for Layout
  const navbarProps = {
    onChatToggle: () => setIsChatVisible(!isChatVisible),
    onSatelliteListToggle: () => setIsSatelliteListVisible(!isSatelliteListVisible),
    onDisplayOptionsToggle: () => setIsDisplayOptionsOpen(!isDisplayOptionsOpen),
    onSatelliteCreatorToggle: () => setIsSatelliteModalOpen(!isSatelliteModalOpen),
    isChatVisible,
    isSatelliteListVisible,
    isDisplayOptionsOpen,
    isSatelliteModalOpen,
    selectedBody,
    onBodySelect: handleBodySelect,
    timeWarp,
    onTimeWarpChange: setTimeWarp,
    simulatedTime,
    onSimulatedTimeChange: handleSimulatedTimeChange,
    app3DRef: { current: app3d },
    satellites: Object.values(navbarSatellites),
    onShareState: undefined,
    onImportState: handleImportState,
    shareModalOpen,
    setShareModalOpen,
    setShareUrl,
    isAuthOpen,
    setIsAuthOpen,
    setAuthMode
  };
  const chatModalProps = {
    isOpen: isChatVisible,
    onClose: () => setIsChatVisible(false),
    socket
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
    onBodySelect: handleBodySelect,
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
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <ToastContext.Provider value={{ showToast }}>
        <Layout
          navbarProps={navbarProps}
          chatModalProps={chatModalProps}
          displayOptionsProps={displayOptionsProps}
          debugWindows={debugWindows}
          satelliteListWindowProps={satelliteListWindowProps}
          satelliteCreatorModalProps={satelliteCreatorModalProps}
          shareModalProps={shareModalProps}
          authModalProps={authModalProps}
        >
          {/* Main app content (canvas, etc.) */}
          <canvas id="three-canvas" className="absolute inset-0 z-0" />
        </Layout>
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
