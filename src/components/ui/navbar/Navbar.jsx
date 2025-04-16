import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../supabaseClient';
import LogoMenu from './LogoMenu';
import BodySelector from './BodySelector';
import TimeControls from './TimeControls';
import { formatBodySelection, getBodyDisplayName, findSatellite, getSatelliteOptions } from '../../../utils/BodySelectionUtils';
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
  const [satelliteOptions, setSatelliteOptions] = useState([]);
  const [user, setUser] = useState(null);

  // Helper function to get the display value
  const getDisplayValue = (value) => {
    return getBodyDisplayName(value, satellites);
  };

  // Update satellite options when satellites prop changes
  useEffect(() => {
    // Get satellite options using utility function
    const options = getSatelliteOptions(satellites);
    setSatelliteOptions(options);

    // If the currently selected satellite is not in the new options, reset selection
    if (selectedBody && selectedBody !== 'none' && selectedBody !== 'earth' && selectedBody !== 'moon') {
      const satellite = findSatellite(selectedBody, satellites);
      if (!satellite) {
        onBodySelect('none');
      }
    }
  }, [satellites, selectedBody, onBodySelect]);

  // Listen for satellite deletion events
  useEffect(() => {
    const handleSatelliteDeleted = (event) => {
      const satellite = findSatellite(selectedBody, satellites);
      if (satellite?.id === event.detail.id) {
        onBodySelect('none');
      }
    };

    document.addEventListener('satelliteDeleted', handleSatelliteDeleted);
    return () => document.removeEventListener('satelliteDeleted', handleSatelliteDeleted);
  }, [selectedBody, onBodySelect, satellites]);

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

  const handleBodyChange = (eventOrValue) => {
    // Handle both direct value calls and event calls
    const value = typeof eventOrValue === 'object' ? eventOrValue.target.value : eventOrValue;

    if (!value || value === 'none') {
      onBodySelect('none');
      return;
    }

    // Find the satellite by name in the satellites array
    const satellite = findSatellite(value, satellites);
    if (satellite) {
      // Format the satellite ID as expected by App3D
      const formattedValue = formatBodySelection(satellite);
      onBodySelect(formattedValue);
      // No direct camera update here
    } else {
      // For earth and moon, pass the value directly
      onBodySelect(value);
      // No direct camera update here
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