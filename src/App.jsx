import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { ThemeProvider } from './components/theme-provider';
import { Navbar } from './components/ui/navbar/Navbar';
import { ChatSidebar } from './components/ui/chat/ChatSidebar';
import { SatelliteCreationPanel } from './components/ui/satellite/SatelliteCreationPanel';
import { DisplayOptions } from './components/ui/controls/DisplayOptions';
import { defaultSettings } from './components/ui/controls/DisplayOptions';
import { SatelliteDebugWindow } from './components/ui/satellite/SatelliteDebugWindow';
import App3D from './app3d.js';
import './styles/globals.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSatelliteCreationVisible, setIsSatelliteCreationVisible] = useState(false);
  const [debugWindows, setDebugWindows] = useState([]);
  const [selectedBody, setSelectedBody] = useState('earth');
  const [timeWarp, setTimeWarp] = useState(1);
  const [simulatedTime, setSimulatedTime] = useState(new Date().toISOString());
  const [displaySettings, setDisplaySettings] = useState(defaultSettings);
  const app3DRef = useRef(null);
  const gridHelperRef = useRef(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      reconnectionDelayMax: 10000,
      transports: ['websocket']
    });
    
    newSocket.on('connect', () => {
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    const app = new App3D();
    app3DRef.current = app;

    // Add method to create debug windows
    app.createDebugWindow = (satellite) => {
      setDebugWindows(prev => {
        // Check if window already exists for this satellite
        if (prev.some(w => w.id === satellite.id)) {
          return prev;
        }
        return [...prev, { id: satellite.id, satellite }];
      });
    };

    // Add method to remove debug windows
    app.removeDebugWindow = (satelliteId) => {
      setDebugWindows(prev => prev.filter(w => w.id !== satelliteId));
    };

    // Initialize grid helper
    const helper = app.scene.getObjectByName('gridHelper');
    if (!helper) {
      const newHelper = new THREE.GridHelper(1000000, 10);
      newHelper.name = 'gridHelper';
      newHelper.visible = displaySettings.showGrid;
      app.scene.add(newHelper);
      gridHelperRef.current = newHelper;
    } else {
      gridHelperRef.current = helper;
      helper.visible = displaySettings.showGrid;
    }

    // Apply initial display settings
    Object.entries(displaySettings).forEach(([key, value]) => {
      app.updateDisplaySetting(key, value);
    });

    return () => {
      if (app) {
        app.dispose();
      }
    };
  }, []); // Empty dependency array since we only want to initialize once

  useEffect(() => {
    if (!app3DRef.current) return;
    const app3d = app3DRef.current;

    // Apply display settings changes
    Object.entries(displaySettings).forEach(([key, value]) => {
      app3d.updateDisplaySetting(key, value);
    });
  }, [displaySettings]);

  useEffect(() => {
    // Listen for time updates from the simulation
    const handleTimeUpdate = (event) => {
      const { simulatedTime, timeWarp } = event.detail;
      setSimulatedTime(simulatedTime);
      setTimeWarp(timeWarp);
    };

    document.addEventListener('timeUpdate', handleTimeUpdate);
    return () => document.removeEventListener('timeUpdate', handleTimeUpdate);
  }, []);

  useEffect(() => {
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
    if (app3DRef.current?.timeUtils) {
      app3DRef.current.timeUtils.setSimulatedTime(newTime);
    }
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="flex flex-col min-h-screen">
        <canvas id="three-canvas" className="absolute inset-0 z-0" />
        <Navbar 
          onToggleChat={() => setIsChatVisible(!isChatVisible)}
          onToggleSatelliteCreation={() => setIsSatelliteCreationVisible(!isSatelliteCreationVisible)}
          selectedBody={selectedBody}
          onBodySelect={setSelectedBody}
          timeWarp={timeWarp}
          onTimeWarpChange={setTimeWarp}
          simulatedTime={simulatedTime}
          onSimulatedTimeChange={setSimulatedTime}
        />

        <DisplayOptions />

        {isChatVisible && (
          <ChatSidebar
            socket={socket}
            onClose={() => setIsChatVisible(false)}
          />
        )}

        {isSatelliteCreationVisible && (
          <SatelliteCreationPanel
            onClose={() => setIsSatelliteCreationVisible(false)}
          />
        )}

        {/* Debug Windows */}
        <div className="fixed bottom-4 right-4 space-y-2 z-10">
          {debugWindows.map(window => (
            <SatelliteDebugWindow
              key={window.id}
              satellite={window.satellite}
              earth={app3DRef.current?.earth}
              onClose={() => app3DRef.current?.removeDebugWindow(window.id)}
            />
          ))}
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
