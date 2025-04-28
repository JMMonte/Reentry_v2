import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../supabaseClient';
import LogoMenu from './LogoMenu';
import BodySelector from './BodySelector';
import TimeControls from './TimeControls';
import { getBodyDisplayName, getSatelliteOptions } from '../../../utils/BodySelectionUtils';
import { saveAs } from 'file-saver';
import LZString from 'lz-string';
import ActionButtons from './ActionButtons';
import UserMenu from './UserMenu';

// Time warp options
const timeWarpOptions = [0, 0.25, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000];

// Function to get next time warp value
const getNextTimeWarp = (currentTimeWarp, increase) => {
  const currentIndex = timeWarpOptions.indexOf(currentTimeWarp);
  if (currentIndex === -1) {
    return increase ? timeWarpOptions[1] : timeWarpOptions[0];
  }
  const nextIndex = increase ?
    Math.min(currentIndex + 1, timeWarpOptions.length - 1) :
    Math.max(currentIndex - 1, 0);
  return timeWarpOptions[nextIndex];
};

// Helper to generate a color from a string
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = `hsl(${hash % 360}, 70%, 55%)`;
  return color;
}

export function Navbar({
  onChatToggle,
  onSatelliteListToggle,
  onDisplayOptionsToggle,
  onSatelliteCreatorToggle,
  onSimulationToggle,
  onGroundtrackToggle,
  selectedBody,
  onBodySelect,
  timeWarp,
  onTimeWarpChange,
  simulatedTime,
  onSimulatedTimeChange,
  app3DRef,
  satellites,
  onImportState,
  shareModalOpen,
  setShareModalOpen,
  setShareUrl,
  setIsAuthOpen,
  setAuthMode
}) {
  // Satellite dropdown options state, updated from props and fallback events
  const [satelliteOptions, setSatelliteOptions] = useState(() => getSatelliteOptions(satellites));
  // Update when satellites prop changes
  useEffect(() => {
    setSatelliteOptions(getSatelliteOptions(satellites));
  }, [satellites]);
  // Fallback update on SatelliteManager events
  useEffect(() => {
    const handleListUpdated = (e) => {
      const satsMap = e.detail?.satellites;
      if (satsMap) {
        const arr = Object.values(satsMap);
        setSatelliteOptions(getSatelliteOptions(arr));
      }
    };
    document.addEventListener('satelliteListUpdated', handleListUpdated);
    return () => document.removeEventListener('satelliteListUpdated', handleListUpdated);
  }, []);
  const [planetOptions, setPlanetOptions] = useState([]);
  const [user, setUser] = useState(null);

  // Helper function to get the display value
  const getDisplayValue = (value) => {
    return getBodyDisplayName(value, satellites);
  };

  // Listen for satellite deletion events
  useEffect(() => {
    const handleSatelliteDeleted = (event) => {
      // reset selection if deleted body matches
      if (selectedBody === `satellite-${event.detail.id}`) {
        onBodySelect('none');
      }
    };

    document.addEventListener('satelliteDeleted', handleSatelliteDeleted);
    return () => document.removeEventListener('satelliteDeleted', handleSatelliteDeleted);
  }, [selectedBody, onBodySelect]);

  // Fetch user on mount and listen for auth state changes
  useEffect(() => {
    let ignore = false;
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!ignore) setUser(user);
    }
    getUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => {
      ignore = true;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  // When dropdown changes, update React state and directly drive cameraControls
  const handleBodyChange = (eventOrValue) => {
    const value = typeof eventOrValue === 'object'
      ? eventOrValue.target.value
      : eventOrValue;
    const selected = value || 'none';
    // update application state
    onBodySelect(selected);
    // directly follow in 3D camera controls
    const app = app3DRef.current;
    if (app?.cameraControls?.follow) {
      app.cameraControls.follow(selected, app);
    }
  };

  // --- Save/Import/Share Simulation State ---
  const importInputRef = useRef(null);

  const handleSaveState = () => {
    const app = app3DRef.current;
    if (!app) return;
    const state = app.exportSimulationState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    saveAs(blob, `simulation-state-${new Date().toISOString()}.json`);
  };

  const handleShareToggle = () => {
    if (!shareModalOpen) {
      // Opening: update URL and open modal
      const app = app3DRef.current;
      if (!app) return;
      const state = app.exportSimulationState();
      const json = JSON.stringify(state);
      const compressed = LZString.compressToEncodedURIComponent(json);
      const url = `${window.location.origin}${window.location.pathname}#state=${compressed}`;
      setShareUrl(url);
      setShareModalOpen(true);
      window.history.replaceState(null, '', url);
    } else {
      // Closing: just close modal
      setShareModalOpen(false);
    }
  };

  const handleLogin = () => {
    setAuthMode && setAuthMode('signin');
    setIsAuthOpen(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  // Update planet options when scene is ready
  useEffect(() => {
    const handleSceneReady = () => {
      const app = app3DRef.current;
      const planets = app?.planets || [];
      const options = planets.map(p => ({
        value: p.name,
        text: p.name.charAt(0).toUpperCase() + p.name.slice(1),
      }));
      setPlanetOptions(options);
    };
    document.addEventListener('sceneReady', handleSceneReady);
    // Also update once on mount in case scene is already ready
    handleSceneReady();
    return () => document.removeEventListener('sceneReady', handleSceneReady);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-[72px] flex items-center justify-between z-20 bg-gradient-to-b from-background/90 to-transparent backdrop-blur-sm px-4">
      <div className="flex items-center gap-1.5">
        {/* Darksun Logo as Dropdown Trigger */}
        <LogoMenu
          handleSaveState={handleSaveState}
          importInputRef={importInputRef}
          onImportState={onImportState}
        />
        {/* Body Selection */}
        <BodySelector
          selectedBody={selectedBody}
          handleBodyChange={handleBodyChange}
          planetOptions={planetOptions}
          satelliteOptions={satelliteOptions}
          getDisplayValue={getDisplayValue}
        />
        <TimeControls
          timeWarp={timeWarp}
          onTimeWarpChange={onTimeWarpChange}
          simulatedTime={simulatedTime}
          onSimulatedTimeChange={onSimulatedTimeChange}
          timeWarpOptions={timeWarpOptions}
          getNextTimeWarp={getNextTimeWarp}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <ActionButtons
          onSatelliteCreatorToggle={onSatelliteCreatorToggle}
          onDisplayOptionsToggle={onDisplayOptionsToggle}
          onChatToggle={onChatToggle}
          onSatelliteListToggle={onSatelliteListToggle}
          handleShareToggle={handleShareToggle}
          onSimulationToggle={onSimulationToggle}
          onGroundtrackToggle={onGroundtrackToggle}
        />
        {/* Login/Profile Button */}
        <UserMenu
          user={user}
          handleLogin={handleLogin}
          handleLogout={handleLogout}
          stringToColor={stringToColor}
        />
      </div>
    </div>
  );
}

Navbar.propTypes = {
  onChatToggle: PropTypes.func.isRequired,
  onSatelliteListToggle: PropTypes.func.isRequired,
  onDisplayOptionsToggle: PropTypes.func.isRequired,
  onSatelliteCreatorToggle: PropTypes.func.isRequired,
  onSimulationToggle: PropTypes.func.isRequired,
  onGroundtrackToggle: PropTypes.func.isRequired,
  selectedBody: PropTypes.string.isRequired,
  onBodySelect: PropTypes.func.isRequired,
  timeWarp: PropTypes.number.isRequired,
  onTimeWarpChange: PropTypes.func.isRequired,
  simulatedTime: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.instanceOf(Date)
  ]).isRequired,
  onSimulatedTimeChange: PropTypes.func.isRequired,
  app3DRef: PropTypes.shape({ current: PropTypes.object }),
  satellites: PropTypes.array.isRequired,
  onImportState: PropTypes.func.isRequired,
  shareModalOpen: PropTypes.bool.isRequired,
  setShareModalOpen: PropTypes.func.isRequired,
  setShareUrl: PropTypes.func.isRequired,
  setIsAuthOpen: PropTypes.func.isRequired,
  setAuthMode: PropTypes.func.isRequired
};

export default Navbar;