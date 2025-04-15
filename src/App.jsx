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

function App() {
  const [socket, setSocket] = useState(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSatelliteListVisible, setIsSatelliteListVisible] = useState(false);
  const [debugWindows, setDebugWindows] = useState([]);
  const [satellites, setSatellites] = useState({});
  const [selectedBody, setSelectedBody] = useState('earth');
  const [timeWarp, setTimeWarp] = useState(1);
  const [simulatedTime, setSimulatedTime] = useState(new Date());

  const [displaySettings, setDisplaySettings] = useState(() => {
    const initialSettings = {};
    Object.entries(defaultSettings).forEach(([key, setting]) => {
      initialSettings[key] = setting.value;
    });
    return initialSettings;
  });

  const [isDisplayOptionsOpen, setIsDisplayOptionsOpen] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);

  // --- OOP App3D Controller ---
  const { controller, ready } = useApp3D();
  const app3d = controller?.app3d;

  // --- State from URL hash (reactive to hash changes) ---
  const [importedState, setImportedState] = useState(() => SimulationStateManager.decodeFromUrlHash());
  useEffect(() => {
    const onHashChange = () => {
      setImportedState(SimulationStateManager.decodeFromUrlHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useSimulationState(controller, importedState);

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
        setSatellites(app3d.satellites.getSatellites());
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

  const getNextTimeWarp = (current, increase) => {
    const timeWarpSteps = [0.25, 0.5, 1, 2, 5, 10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000];
    const currentIndex = timeWarpSteps.findIndex(step => step >= current);
    if (increase) {
      if (currentIndex < timeWarpSteps.length - 1) {
        return timeWarpSteps[currentIndex + 1];
      }
      return timeWarpSteps[timeWarpSteps.length - 1];
    } else {
      if (currentIndex > 0) {
        return timeWarpSteps[currentIndex - 1];
      }
      return timeWarpSteps[0];
    }
  };

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

  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <div className="relative h-screen w-screen overflow-hidden">
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
      </div>
    </ThemeProvider>
  );
}

export default App;
