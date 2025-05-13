import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../supabaseClient';
import LogoMenu from './LogoMenu';
import BodySelector from './BodySelector';
import TimeControls from './TimeControls';
import { saveAs } from 'file-saver';
import LZString from 'lz-string';
import ActionButtons from './ActionButtons';
import UserMenu from './UserMenu';
import { timeWarpOptions } from '../../../utils/timeWarpOptions';

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
  onImportState,
  shareModalOpen,
  setShareModalOpen,
  setShareUrl,
  setIsAuthOpen,
  setAuthMode,
  planetOptions,
  satelliteOptions,
  getDisplayValue
}) {
  const [user, setUser] = useState(null);

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

  // When dropdown changes, update selection
  const handleBodyChange = (eventOrValue) => {
    const value = typeof eventOrValue === 'object'
      ? eventOrValue.target.value
      : eventOrValue;
    onBodySelect(value || 'none');
  };

  // --- Save/Import/Share Simulation State ---
  const importInputRef = useRef(null);

  // Debug: log timewarp changes
  const handleTimeWarpChange = (newWarp) => {
    console.log('[Navbar] handleTimeWarpChange', newWarp);
    onTimeWarpChange(newWarp);
  };

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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 h-[72px] flex items-center justify-between z-20 px-4">
      {/* Hamburger menu for mobile */}
      <div className="lg:hidden flex items-center w-full justify-between">
        {/* Logo always visible */}
        <div className="flex items-center">
          <LogoMenu
            handleSaveState={handleSaveState}
            importInputRef={importInputRef}
            onImportState={onImportState}
          />
        </div>
        <button
          className="p-2 rounded-lg border border-border bg-background/80 backdrop-blur-sm shadow-lg ml-2"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label="Open menu"
        >
          <svg className="w-6 h-6 text-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      {/* Left group: Logo, BodySelector, TimeControls (desktop only) */}
      <div className="hidden lg:flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 bg-background/80 backdrop-blur-sm border rounded-lg shadow-lg px-2 py-1">
          <LogoMenu
            handleSaveState={handleSaveState}
            importInputRef={importInputRef}
            onImportState={onImportState}
          />
          <BodySelector
            selectedBody={selectedBody}
            handleBodyChange={handleBodyChange}
            planetOptions={planetOptions}
            satelliteOptions={satelliteOptions}
            getDisplayValue={getDisplayValue}
          />
          <TimeControls
            timeWarp={timeWarp}
            onTimeWarpChange={handleTimeWarpChange}
            simulatedTime={simulatedTime}
            onSimulatedTimeChange={onSimulatedTimeChange}
            timeWarpOptions={timeWarpOptions}
            getNextTimeWarp={getNextTimeWarp}
          />
        </div>
      </div>
      {/* Right group: ActionButtons, UserMenu (desktop only) */}
      <div className="hidden lg:flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 bg-background/80 backdrop-blur-sm border rounded-lg shadow-lg px-2 py-1">
          <ActionButtons
            onSatelliteCreatorToggle={onSatelliteCreatorToggle}
            onDisplayOptionsToggle={onDisplayOptionsToggle}
            onChatToggle={onChatToggle}
            onSatelliteListToggle={onSatelliteListToggle}
            handleShareToggle={handleShareToggle}
            onSimulationToggle={onSimulationToggle}
            onGroundtrackToggle={onGroundtrackToggle}
          />
          <UserMenu
            user={user}
            handleLogin={handleLogin}
            handleLogout={handleLogout}
            stringToColor={stringToColor}
          />
        </div>
      </div>
      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 flex flex-col lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute top-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-b shadow-lg p-4 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            {/* Logo at the top of the menu */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <LogoMenu
                handleSaveState={handleSaveState}
                importInputRef={importInputRef}
                onImportState={onImportState}
              />
              <button
                className="p-2 rounded-lg border border-border bg-background/80 backdrop-blur-sm shadow-lg"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <svg className="w-6 h-6 text-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <BodySelector
                selectedBody={selectedBody}
                handleBodyChange={handleBodyChange}
                planetOptions={planetOptions}
                satelliteOptions={satelliteOptions}
                getDisplayValue={getDisplayValue}
              />
              <TimeControls
                timeWarp={timeWarp}
                onTimeWarpChange={handleTimeWarpChange}
                simulatedTime={simulatedTime}
                onSimulatedTimeChange={onSimulatedTimeChange}
                timeWarpOptions={timeWarpOptions}
                getNextTimeWarp={getNextTimeWarp}
              />
              <ActionButtons
                onSatelliteCreatorToggle={onSatelliteCreatorToggle}
                onDisplayOptionsToggle={onDisplayOptionsToggle}
                onChatToggle={onChatToggle}
                onSatelliteListToggle={onSatelliteListToggle}
                handleShareToggle={handleShareToggle}
                onSimulationToggle={onSimulationToggle}
                onGroundtrackToggle={onGroundtrackToggle}
              />
              <UserMenu
                user={user}
                handleLogin={handleLogin}
                handleLogout={handleLogout}
                stringToColor={stringToColor}
              />
            </div>
          </div>
        </div>
      )}
    </nav>
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
  app3DRef: PropTypes.shape({ current: PropTypes.object }).isRequired,
  planetOptions: PropTypes.array.isRequired,
  satelliteOptions: PropTypes.array.isRequired,
  getDisplayValue: PropTypes.func.isRequired,
  onImportState: PropTypes.func.isRequired,
  shareModalOpen: PropTypes.bool.isRequired,
  setShareModalOpen: PropTypes.func.isRequired,
  setShareUrl: PropTypes.func.isRequired,
  setIsAuthOpen: PropTypes.func.isRequired,
  setAuthMode: PropTypes.func.isRequired
};

export default Navbar;