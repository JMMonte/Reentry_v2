import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import { ThemeProvider } from './components/theme-provider';
import { ChatSidebar } from './components/ui/chat/ChatSidebar';
import { Navbar } from './components/ui/navbar/Navbar';
import { SatelliteCreationPanel } from './components/ui/satellite/SatelliteCreationPanel';
import { DisplayOptions } from './components/ui/controls/DisplayOptions';
import { defaultSettings } from './components/ui/controls/DisplayOptions';
import App3D from './app3d.js';
import './styles/globals.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSatelliteCreationVisible, setIsSatelliteCreationVisible] = useState(false);
  const [selectedBody, setSelectedBody] = useState('earth');
  const [timeWarp, setTimeWarp] = useState(1);
  const [displaySettings, setDisplaySettings] = useState(defaultSettings);
  const app3DRef = useRef(null);
  const gridHelperRef = useRef(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3000', {
      reconnectionDelayMax: 10000,
      transports: ['websocket']
    });
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
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
      console.log(`[App] Initializing setting ${key}=${value}`);
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
      console.log(`[App] Applying setting ${key}=${value}`);
      app3d.updateDisplaySetting(key, value);
    });
  }, [displaySettings]);

  const handleDisplaySettingChange = (key, value) => {
    console.log(`[App] Display setting change: ${key}=${value}`);
    setDisplaySettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleTimeWarpChange = (action) => {
    switch (action) {
      case 'increase':
        setTimeWarp(prev => {
          const newValue = prev * 2;
          if (app3DRef.current) {
            app3DRef.current.timeUtils?.setTimeWarp(newValue);
          }
          return newValue;
        });
        break;
      case 'decrease':
        setTimeWarp(prev => {
          const newValue = prev / 2;
          if (app3DRef.current) {
            app3DRef.current.timeUtils?.setTimeWarp(newValue);
          }
          return newValue;
        });
        break;
      case 'reset':
        setTimeWarp(1);
        if (app3DRef.current) {
          app3DRef.current.timeUtils?.setTimeWarp(1);
        }
        break;
    }
  };

  const handleBodyChange = (body) => {
    setSelectedBody(body);
    if (app3DRef.current) {
      app3DRef.current.cameraControls?.setTarget(body);
    }
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="relative w-screen h-screen">
        <canvas id="three-canvas" className="absolute inset-0 z-0" />
        <Navbar
          displaySettings={displaySettings}
          onDisplaySettingChange={handleDisplaySettingChange}
          onToggleChat={() => setIsChatVisible(!isChatVisible)}
          selectedBody={selectedBody}
          onBodyChange={handleBodyChange}
          timeWarp={timeWarp}
          onDecreaseTimeWarp={() => handleTimeWarpChange('decrease')}
          onIncreaseTimeWarp={() => handleTimeWarpChange('increase')}
          onResetTimeWarp={() => handleTimeWarpChange('reset')}
          onCreateSatellite={() => setIsSatelliteCreationVisible(true)}
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
      </div>
    </ThemeProvider>
  );
}

export default App;
