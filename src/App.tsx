import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { ThemeProvider } from './components/theme-provider';
import { Navbar } from './components/ui/navbar/Navbar';
import { ChatModal } from './components/ui/chat/ChatModal';
import { SatelliteDebugWindow } from './components/ui/satellite/SatelliteDebugWindow';
import { SatelliteListWindow } from './components/ui/satellite/SatelliteListWindow';
import { DisplayOptions } from './components/ui/controls/DisplayOptions';
import App3D from './app3d.js';
import './styles/globals.css';
import './styles/animations.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSatelliteListVisible, setIsSatelliteListVisible] = useState(false);
  const [debugWindows, setDebugWindows] = useState([]);
  const [satellites, setSatellites] = useState({});  // Initialize as empty object
  const [selectedBody, setSelectedBody] = useState('earth');
  const [timeWarp, setTimeWarp] = useState(1);
  const [simulatedTime, setSimulatedTime] = useState(new Date());
  const [displaySettings, setDisplaySettings] = useState({});
  const [app3dInstance, setApp3dInstance] = useState(null);
  const [isDisplayOptionsOpen, setIsDisplayOptionsOpen] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const app3dRef = useRef(null);
  const gridHelperRef = useRef(null);
  const initializingRef = useRef(false);

  // Socket connection effect
  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      reconnectionDelayMax: 10000,
      transports: ['websocket']
    });
    
    newSocket.on('connect', () => {
      console.log('Socket connected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.close();
      }
    };
  }, []);

  // Handle satellite list updates
  useEffect(() => {
    const handleSatelliteListUpdate = (event) => {
      console.log('App: Received satellite list update:', event.detail);
      if (event.detail?.satellites) {
        // Convert satellites to array if needed
        const satelliteArray = Array.isArray(event.detail.satellites) 
          ? event.detail.satellites 
          : Object.values(event.detail.satellites);
        
        // Filter out invalid satellites and ensure unique entries
        const validSatellites = satelliteArray
          .filter(sat => sat && sat.id != null && sat.name)
          .reduce((acc, sat) => {
            acc[sat.id] = sat;
            return acc;
          }, {});
        
        console.log('App: Setting satellites state with:', validSatellites);
        setSatellites(validSatellites);
      }
    };

    document.addEventListener('satelliteListUpdated', handleSatelliteListUpdate);
    return () => document.removeEventListener('satelliteListUpdated', handleSatelliteListUpdate);
  }, []);

  // Handle body selection events
  useEffect(() => {
    const handleBodySelected = (event) => {
      if (event.detail?.body) {
        // Set a flag to prevent re-dispatching the event
        window.handlingBodySelectedEvent = true;
        handleBodySelect(event.detail.body);
        window.handlingBodySelectedEvent = false;
      }
    };

    document.addEventListener('bodySelected', handleBodySelected);
    return () => document.removeEventListener('bodySelected', handleBodySelected);
  }, []);

  // App3D initialization effect
  useEffect(() => {
    // Prevent double initialization in strict mode
    if (initializingRef.current || app3dInstance) {
      return;
    }

    initializingRef.current = true;

    try {
      const app = new App3D();
      app3dRef.current = app;
      setApp3dInstance(app);

      // Add method to create debug windows
      app.createDebugWindow = (satellite) => {
        setDebugWindows(prev => {
          if (prev.some(w => w.id === satellite.id)) {
            return prev;
          }
          return [...prev, { id: satellite.id, satellite }];
        });
      };

      // Add method to update satellites list
      app.updateSatelliteList = () => {
        setSatellites(app.satellites);
      };

      // Add method to remove debug windows
      app.removeDebugWindow = (satelliteId) => {
        setDebugWindows(prev => prev.filter(w => w.id !== satelliteId));
      };

      // Initialize display settings after scene is ready
      app.addEventListener('sceneReady', () => {
        console.log('Scene is ready');
        // Initialize display settings from DisplayManager
        if (app.displayManager) {
          const props = app.displayManager.collectDisplayProperties();
          const initialSettings = {};
          Object.entries(props).forEach(([category, settings]) => {
            Object.entries(settings).forEach(([key, setting]) => {
              initialSettings[key] = setting.value;
            });
          });
          setDisplaySettings(initialSettings);
        }
      });
    } catch (error) {
      console.error('Error initializing App3D:', error);
    }

    return () => {
      if (app3dRef.current) {
        console.log('Cleaning up App3D...');
        app3dRef.current.dispose();
        app3dRef.current = null;
        setApp3dInstance(null);
      }
      initializingRef.current = false;
    };
  }, []); // Empty dependency array since we only want to initialize once

  // Display settings effect
  useEffect(() => {
    const app = app3dRef.current;
    if (!app || typeof app.updateDisplaySetting !== 'function') return;

    Object.entries(displaySettings).forEach(([key, value]) => {
      app.updateDisplaySetting(key, value);
    });
  }, [displaySettings]);

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
    const app = app3dRef.current;
    if (!app) return;

    document.dispatchEvent(new CustomEvent('updateTimeWarp', {
      detail: { value: timeWarp }
    }));
  }, [timeWarp]);

  const getNextTimeWarp = (current, increase) => {
    const timeWarpSteps = [0.25, 0.5, 1, 2, 5, 10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000];
    const currentIndex = timeWarpSteps.findIndex(step => step >= current);
    
    if (increase) {
      // Going up
      if (currentIndex < timeWarpSteps.length - 1) {
        return timeWarpSteps[currentIndex + 1];
      }
      return timeWarpSteps[timeWarpSteps.length - 1]; // Max value
    } else {
      // Going down
      if (currentIndex > 0) {
        return timeWarpSteps[currentIndex - 1];
      }
      return timeWarpSteps[0]; // Min value
    }
  };

  const handleSimulatedTimeChange = (newTime) => {
    const app = app3dRef.current;
    if (app?.timeUtils) {
      app.timeUtils.setSimulatedTime(newTime);
    }
  };

  const handleBodySelect = (value) => {
    setSelectedBody(value);
    // Only dispatch the event if it wasn't triggered by an event
    if (!window.handlingBodySelectedEvent) {
      document.dispatchEvent(new CustomEvent('bodySelected', {
        detail: { body: value }
      }));
    }
  };

  // Pass satellites to Navbar
  const navbarSatellites = useMemo(() => {
    return satellites;
  }, [satellites]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <div className="relative h-screen w-screen overflow-hidden">
        <canvas id="three-canvas" ref={app3dRef} className="absolute inset-0 z-0" />
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
          app3DRef={app3dRef}
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
            if (app3dInstance?.displayManager) {
              app3dInstance.displayManager.updateSetting(key, value);
              setDisplaySettings(prev => ({ ...prev, [key]: value }));
            }
          }}
          isOpen={isDisplayOptionsOpen}
          onOpenChange={setIsDisplayOptionsOpen}
          app3DRef={app3dRef}
        />
        {debugWindows.map(({ id, satellite }) => (
          <SatelliteDebugWindow
            key={id}
            satellite={satellite}
            earth={app3dRef.current?.earth}
          />
        ))}
        <SatelliteListWindow 
          satellites={satellites} 
          isOpen={isSatelliteListVisible}
          setIsOpen={setIsSatelliteListVisible}
        />
      </div>
    </ThemeProvider>
  );
}

export default App;
