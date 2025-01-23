import React, { useState, useMemo } from 'react';
import { Navbar } from './components/ui/navbar/Navbar';
import { ChatModal } from './components/ui/chat/ChatModal';
import { SatelliteDebugWindow } from './components/ui/satellite/SatelliteDebugWindow';
import { SatelliteListWindow } from './components/ui/satellite/SatelliteListWindow';
import { DisplayOptions } from './components/ui/controls/DisplayOptions';
import './styles/globals.css';
import './styles/animations.css';

// Custom hooks
import { useSocket } from './hooks/useSocket';
import { useSatellites } from './hooks/useSatellites';
import { useTimeControl } from './hooks/useTimeControl';
import { useDisplaySettings } from './hooks/useDisplaySettings';
import { useApp3D } from './hooks/useApp3D';

function App() {
  // UI State
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [isSatelliteListVisible, setIsSatelliteListVisible] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [selectedBody, setSelectedBody] = useState('earth');

  // Initialize hooks
  const { app3dInstance, app3dRef } = useApp3D();
  const socket = useSocket();
  const { satellites, debugWindows } = useSatellites();
  const {
    timeWarp,
    setTimeWarp,
    simulatedTime,
    handleSimulatedTimeChange,
    getNextTimeWarp
  } = useTimeControl(app3dRef);
  const {
    displaySettings,
    isDisplayOptionsOpen,
    setIsDisplayOptionsOpen,
    updateSetting
  } = useDisplaySettings(app3dRef);

  const handleBodySelect = (value) => {
    setSelectedBody(value);
    if (!window.handlingBodySelectedEvent) {
      document.dispatchEvent(new CustomEvent('bodySelected', {
        detail: { body: value }
      }));
    }
  };

  // Memoize satellites for Navbar
  const navbarSatellites = useMemo(() => satellites, [satellites]);

  return (
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
        onSettingChange={updateSetting}
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
  );
}

export default App;
