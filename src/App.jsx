import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import { ThemeProvider } from './components/theme-provider';
import { Navbar } from './components/ui/navbar/Navbar';
import { ChatModal } from './components/ui/chat/ChatModal';
import { SatelliteDebugWindow } from './components/ui/satellite/SatelliteDebugWindow';
import { SatelliteListWindow } from './components/ui/satellite/SatelliteListWindow';
import { DisplayOptions } from './components/ui/controls/DisplayOptions';
import { defaultSettings } from './components/ui/controls/DisplayOptions';
import { useApp3D } from './simulation/useApp3D';
import { useSimulationState } from './simulation/useSimulationState';
import { SimulationStateManager } from './simulation/SimulationStateManager';
import './styles/globals.css';
import './styles/animations.css';
import SatelliteCreator from './components/ui/satellite/SatelliteCreator';
import { DraggableModal } from './components/ui/modal/DraggableModal';
import LZString from 'lz-string';
import { Button } from './components/ui/button';

function App3DMain() {
  const [socket, setSocket] = useState(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSatelliteListVisible, setIsSatelliteListVisible] = useState(false);
  const [debugWindows, setDebugWindows] = useState([]);
  const [satellites, setSatellites] = useState({});
  const [selectedBody, setSelectedBody] = useState('earth');
  const [timeWarp, setTimeWarp] = useState(1);
  const [simulatedTime, setSimulatedTime] = useState(new Date());
  const [toast, setToast] = useState(null);

  const [displaySettings, setDisplaySettings] = useState(() => {
    const initialSettings = {};
    Object.entries(defaultSettings).forEach(([key, setting]) => {
      initialSettings[key] = setting.value;
    });
    return initialSettings;
  });

  const [isDisplayOptionsOpen, setIsDisplayOptionsOpen] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  // --- OOP App3D Controller ---
  const [importedState, setImportedState] = useState(() => SimulationStateManager.decodeFromUrlHash());
  const { controller, ready } = useApp3D(importedState);
  const app3d = controller?.app3d;

  // --- State from URL hash (reactive to hash changes) ---
  const [checkedInitialState, setCheckedInitialState] = useState(false);
  // Add a ref to ignore the next hashchange if triggered by save
  const ignoreNextHashChange = React.useRef(false);
  useEffect(() => {
    setCheckedInitialState(true);
  }, []);
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

  // Update displaySettings state when importedState.displaySettings changes (URL import)
  useEffect(() => {
    if (importedState && importedState.displaySettings) {
      // Merge with defaults to ensure all keys are present
      setDisplaySettings(prev => {
        const merged = { ...prev };
        Object.entries(defaultSettings).forEach(([key, setting]) => {
          merged[key] =
            importedState.displaySettings[key] !== undefined
              ? importedState.displaySettings[key]
              : setting.value;
        });
        return merged;
      });
    }
    // Update selectedBody from importedState.camera.focusedBody if present
    if (importedState && importedState.camera && typeof importedState.camera.focusedBody !== 'undefined') {
      setSelectedBody(importedState.camera.focusedBody || 'earth');
    }
  }, [importedState]);

  // Socket connection effect
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

  // Handle satellite list updates
  useEffect(() => {
    const handleSatelliteListUpdate = () => {
      if (app3d && app3d.satellites) {
        const satellites = app3d.satellites.getSatellites();
        setSatellites(satellites);
        // Update debug windows to use the latest satellite references
        setDebugWindows(prev =>
          prev
            .map(w => satellites[w.id] ? { ...w, satellite: satellites[w.id] } : null)
            .filter(Boolean)
        );
      }
    };
    document.addEventListener('satelliteListUpdated', handleSatelliteListUpdate);
    return () => document.removeEventListener('satelliteListUpdated', handleSatelliteListUpdate);
  }, [app3d]);

  // Display settings effect
  useEffect(() => {
    if (app3d && app3d.displaySettingsManager && typeof app3d.displaySettingsManager.applyAll === 'function') {
      app3d.displaySettingsManager.applyAll();
    }
  }, [app3d]);

  // Time update effect
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
    document.dispatchEvent(new CustomEvent('updateTimeWarp', {
      detail: { value: timeWarp }
    }));
  }, [timeWarp, app3d]);

  // --- Debug window helpers ---
  useEffect(() => {
    if (!app3d) return;
    app3d.createDebugWindow = (satellite) => {
      setDebugWindows(prev => {
        if (prev.some(w => w.id === satellite.id)) return prev;
        return [...prev, { id: satellite.id, satellite }];
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
      console.log('[App.jsx] satelliteDeleted event received:', event.detail?.id);
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
      document.dispatchEvent(new CustomEvent('bodySelected', {
        detail: { body: value }
      }));
      window.handlingBodySelectedEvent = false;
    }
  };

  const navbarSatellites = useMemo(() => satellites, [satellites]);

  // Satellite Creator handler
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

  // Share modal handlers
  const handleShareState = () => {
    if (!app3d) return;
    const state = app3d.exportSimulationState();
    const json = JSON.stringify(state);
    const compressed = LZString.compressToEncodedURIComponent(json);
    const url = `${window.location.origin}${window.location.pathname}#state=${compressed}`;
    setShareUrl(url);
    setShareModalOpen(true);
    setShareCopied(false);
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

  // Show toast for a short time
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  // Cmd+S / Ctrl+S save shortcut
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!app3d) return;
        const state = app3d.exportSimulationState();
        const json = JSON.stringify(state);
        const compressed = LZString.compressToEncodedURIComponent(json);
        const url = `${window.location.origin}${window.location.pathname}#state=${compressed}`;
        // Set flag to ignore the next hashchange event
        ignoreNextHashChange.current = true;
        window.location.hash = `state=${compressed}`;
        showToast('Sim saved');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [app3d]);

  // Import state handler (for completeness, pass to Navbar if needed)
  const handleImportState = (event) => {
    const file = event.target.files[0];
    if (!file) {
      console.log('No file selected');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target.result);
        const app = app3d;
        if (!app) return;
        // Use unified import logic
        if (typeof app.importSimulationState === 'function') {
          app.importSimulationState(state);
        }
        // Update displaySettings state if present in imported file
        if (state.displaySettings) {
          setDisplaySettings(prev => {
            const merged = { ...prev };
            Object.entries(defaultSettings).forEach(([key, setting]) => {
              merged[key] =
                state.displaySettings[key] !== undefined
                  ? state.displaySettings[key]
                  : setting.value;
            });
            return merged;
          });
        }
        // Update selectedBody if present in imported file
        if (state.camera && typeof state.camera.focusedBody !== 'undefined') {
          setSelectedBody(state.camera.focusedBody || 'earth');
        }
        // Update URL to match imported state
        const json = JSON.stringify(state);
        const compressed = LZString.compressToEncodedURIComponent(json);
        window.location.hash = `state=${compressed}`;
      } catch (err) {
        alert('Failed to import simulation state: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  if (!checkedInitialState) return null;

  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <div className="relative overflow-hidden">
        <canvas id="three-canvas" className="absolute inset-0 z-0" />
        <Navbar
          onChatToggle={() => setIsChatVisible(!isChatVisible)}
          onSatelliteListToggle={() => setIsSatelliteListVisible(!isSatelliteListVisible)}
          onDisplayOptionsToggle={() => setIsDisplayOptionsOpen(!isDisplayOptionsOpen)}
          onSatelliteCreatorToggle={() => setIsSatelliteModalOpen(!isSatelliteModalOpen)}
          isChatVisible={isChatVisible}
          isSatelliteListVisible={isSatelliteListVisible}
          isDisplayOptionsOpen={isDisplayOptionsOpen}
          isSatelliteModalOpen={isSatelliteModalOpen}
          selectedBody={selectedBody}
          onBodySelect={handleBodySelect}
          timeWarp={timeWarp}
          onTimeWarpChange={setTimeWarp}
          simulatedTime={simulatedTime}
          onSimulatedTimeChange={handleSimulatedTimeChange}
          app3DRef={{ current: app3d }}
          satellites={navbarSatellites}
          onShareState={undefined}
          onImportState={handleImportState}
          shareModalOpen={shareModalOpen}
          setShareModalOpen={setShareModalOpen}
          setShareUrl={setShareUrl}
        />
        <ChatModal
          isOpen={isChatVisible}
          onClose={() => setIsChatVisible(false)}
          socket={socket}
        />
        <DisplayOptions
          settings={displaySettings}
          onSettingChange={(key, value) => {
            if (app3d) {
              app3d.updateDisplaySetting(key, value);
              setDisplaySettings(prev => ({ ...prev, [key]: value }));
            }
          }}
          isOpen={isDisplayOptionsOpen}
          onOpenChange={setIsDisplayOptionsOpen}
          app3DRef={{ current: app3d }}
        />
        {debugWindows.map(({ id, satellite }) => (
          <SatelliteDebugWindow
            key={id}
            satellite={satellite}
            earth={app3d?.earth}
            onBodySelect={handleBodySelect}
            onClose={() => setDebugWindows(prev => prev.filter(w => w.id !== id))}
          />
        ))}
        <SatelliteListWindow
          satellites={satellites}
          isOpen={isSatelliteListVisible}
          setIsOpen={setIsSatelliteListVisible}
          onBodySelect={handleBodySelect}
        />
        {/* Satellite Creator Modal */}
        <DraggableModal
          title="Create Satellite"
          isOpen={isSatelliteModalOpen}
          onClose={() => setIsSatelliteModalOpen(false)}
          className="w-[400px]"
        >
          <SatelliteCreator onCreateSatellite={onCreateSatellite} />
        </DraggableModal>
        {/* Share Modal */}
        <DraggableModal
          title="Share Simulation State"
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          className="w-[480px]"
          key={shareModalOpen ? 'share-modal-open' : 'share-modal-closed'}
          defaultPosition={{ x: window.innerWidth / 2 - 240, y: 120 }}
        >
          <div className="flex flex-col gap-4">
            <label htmlFor="share-url" className="font-medium">Shareable URL:</label>
            <input
              id="share-url"
              type="text"
              value={shareUrl}
              readOnly
              className="w-full px-2 py-1 border rounded bg-muted text-xs font-mono"
              onFocus={e => e.target.select()}
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyShareUrl}>
                {shareCopied ? 'Copied!' : 'Copy to Clipboard'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleShareViaEmail}>
                Share via Email
              </Button>
            </div>
          </div>
        </DraggableModal>
      </div>
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 32,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'rgba(30,30,30,0.95)',
            color: 'white',
            padding: '12px 32px',
            borderRadius: 8,
            fontSize: 16,
            boxShadow: '0 2px 16px rgba(0,0,0,0.2)'
          }}>{toast}</div>
        </div>
      )}
    </ThemeProvider>
  );
}

function AppWithCanvas() {
  const [canvasReady, setCanvasReady] = useState(false);
  const [checkedInitialState, setCheckedInitialState] = useState(false);

  useEffect(() => {
    setCheckedInitialState(true);
  }, []);

  useEffect(() => {
    // Wait for the canvas to be in the DOM
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
