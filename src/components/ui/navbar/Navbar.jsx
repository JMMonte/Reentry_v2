import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../button';
import {
  Settings2,
  Rocket,
  MessageSquare,
  Rewind,
  FastForward,
  RotateCcw,
  List,
  Pause,
  Play,
  Save,
  Upload,
  Share2
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator
} from '../select';
import { Separator } from '../separator';
import { DraggableModal } from '../modal/DraggableModal';
import SatelliteCreator from '../satellite/SatelliteCreator';
import { cn } from "../../../lib/utils";
import { DateTimePicker } from '../datetime/DateTimePicker';
import { formatBodySelection, getBodyDisplayName, updateCameraTarget, findSatellite, getSatelliteOptions } from '../../../utils/BodySelectionUtils';
import { saveAs } from 'file-saver';
import * as THREE from 'three';
import { Constants } from '../../../utils/Constants.js';
import LZString from 'lz-string';

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

export function Navbar({
  onChatToggle,
  onSatelliteListToggle,
  onDisplayOptionsToggle,
  onSatelliteCreatorToggle,
  isChatVisible,
  isSatelliteListVisible,
  isDisplayOptionsOpen,
  isSatelliteModalOpen,
  selectedBody,
  onBodySelect,
  timeWarp,
  onTimeWarpChange,
  simulatedTime,
  onSimulatedTimeChange,
  app3DRef,
  satellites
}) {
  const [satelliteOptions, setSatelliteOptions] = useState([]);
  const [satelliteModalPosition, setSatelliteModalPosition] = useState({ x: window.innerWidth - 420, y: 80 });
  const [shareCopied, setShareCopied] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

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
      // Format the satellite ID as expected by App3D and update camera
      const formattedValue = formatBodySelection(satellite);
      onBodySelect(formattedValue);
      if (window.app3d) {
        updateCameraTarget(formattedValue, window.app3d, false); // Don't dispatch event since we're already handling selection
      }
    } else {
      // For earth and moon, pass the value directly
      onBodySelect(value);
      if (window.app3d) {
        updateCameraTarget(value, window.app3d, false); // Don't dispatch event since we're already handling selection
      }
    }
  };

  const onCreateSatellite = async (params) => {
    try {
      let satellite;
      if (params.mode === 'latlon') {
        satellite = await app3DRef.current?.createSatelliteLatLon(params);
      } else if (params.mode === 'orbital') {
        satellite = await app3DRef.current?.createSatelliteOrbital(params);
      } else if (params.mode === 'circular') {
        satellite = await app3DRef.current?.createSatelliteCircular(params);
      }

      if (satellite) {
        onSatelliteCreatorToggle(false);
      }
    } catch (error) {
      console.error('Error creating satellite:', error);
    }
  };

  // --- Save/Import/Share Simulation State ---
  const importInputRef = useRef(null);

  const handleImportButtonClick = () => {
    if (importInputRef.current) {
      importInputRef.current.click();
    }
  };

  const handleSaveState = () => {
    const app = app3DRef.current;
    if (!app) return;
    const timeUtils = app.timeUtils;
    const state = {
      simulatedTime: timeUtils?.getSimulatedTime()?.toISOString?.() || null,
      timeWarp: timeUtils?.timeWarp || 1,
      satellites: Object.values(app.satellites || {}).map(sat => ({
        id: sat.id,
        name: sat.name,
        mass: sat.mass,
        size: sat.size,
        color: sat.color,
        position: sat.position ? { x: sat.position.x, y: sat.position.y, z: sat.position.z } : null,
        velocity: sat.velocity ? { x: sat.velocity.x, y: sat.velocity.y, z: sat.velocity.z } : null
      }))
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    saveAs(blob, `simulation-state-${new Date().toISOString()}.json`);
  };

  const handleShareState = () => {
    const app = app3DRef.current;
    if (!app) return;
    const timeUtils = app.timeUtils;
    const state = {
      simulatedTime: timeUtils?.getSimulatedTime()?.toISOString?.() || null,
      timeWarp: timeUtils?.timeWarp || 1,
      satellites: Object.values(app.satellites || {}).map(sat => ({
        id: sat.id,
        name: sat.name,
        mass: sat.mass,
        size: sat.size,
        color: sat.color,
        position: sat.position ? { x: sat.position.x, y: sat.position.y, z: sat.position.z } : null,
        velocity: sat.velocity ? { x: sat.velocity.x, y: sat.velocity.y, z: sat.velocity.z } : null
      }))
    };
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
        console.log('Parsed state:', state);
        const app = app3DRef.current;
        console.log('App3D instance:', app);
        console.log('app.createSatellite:', app && app.createSatellite);
        if (!app) {
          console.log('App3D instance not found');
          return;
        }
        // Set simulation time
        if (state.simulatedTime) {
          app.timeUtils.setSimulatedTime(state.simulatedTime);
        }
        if (typeof state.timeWarp === 'number') {
          app.timeUtils.setTimeWarp(state.timeWarp);
          if (typeof app.updateTimeWarp === 'function') {
            app.updateTimeWarp(state.timeWarp); // Notify worker
          }
        }
        // Remove existing satellites
        Object.keys(app.satellites).forEach(id => app.removeSatellite(id));
        // Add satellites from state
        (state.satellites || []).forEach(sat => {
          // Convert meters to simulation units (km * scale)
          const toSimUnits = (x) => x * Constants.metersToKm * Constants.scale;
          const position = new THREE.Vector3(
            toSimUnits(sat.position.x),
            toSimUnits(sat.position.y),
            toSimUnits(sat.position.z)
          );
          const velocity = new THREE.Vector3(
            toSimUnits(sat.velocity.x),
            toSimUnits(sat.velocity.y),
            toSimUnits(sat.velocity.z)
          );
          // Always use createSatellite for state import
          if (typeof app.createSatellite === 'function') {
            console.log('Creating satellite:', sat);
            app.createSatellite({
              name: sat.name,
              mass: sat.mass,
              size: sat.size,
              color: sat.color,
              position,
              velocity,
              id: sat.id
            });
          }
        });
      } catch (err) {
        alert('Failed to import simulation state: ' + err.message);
        console.error('Import error:', err);
      }
    };
    reader.readAsText(file);
    // Reset input value so the same file can be selected again
    event.target.value = '';
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-[72px] flex items-center justify-between z-20 bg-gradient-to-b from-background/90 to-transparent backdrop-blur-sm px-4">
      <div className="flex items-center space-x-4">
        {/* Chat Toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onChatToggle} className={cn(isChatVisible && "bg-accent")}>
                <MessageSquare className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Chat</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-8" />

        {/* Body Selection */}
        <Select value={selectedBody} onValueChange={handleBodyChange}>
          <SelectTrigger className="w-[100px]">
            <SelectValue placeholder="Select body">
              {getDisplayValue(selectedBody)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="earth">Earth</SelectItem>
            <SelectItem value="moon">Moon</SelectItem>
            {satelliteOptions.length > 0 && (
              <>
                <SelectSeparator />
                {satelliteOptions.map(({ value, text }) => (
                  <SelectItem key={value} value={value}>{text}</SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-8" />

        {/* DateTime Picker */}
        <DateTimePicker
          date={simulatedTime}
          onDateTimeChange={onSimulatedTimeChange}
        />

        <Separator orientation="vertical" className="h-8" />

        {/* Time Controls */}
        <div className="flex items-center space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => onTimeWarpChange(getNextTimeWarp(timeWarp, false))}>
                  <Rewind className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Decrease Time Warp</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => onTimeWarpChange(timeWarp === 0 ? 1 : 0)}>
                  {timeWarp === 0 ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{timeWarp === 0 ? "Resume" : "Pause"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Select
            value={timeWarp.toString()}
            onValueChange={(value) => onTimeWarpChange(parseFloat(value))}
            defaultValue="1"
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Time Warp">
                {timeWarp}x
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {timeWarpOptions.map((option) => (
                <SelectItem key={option} value={option.toString()}>
                  {option === 0 ? "Paused" : `${option}x`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => onTimeWarpChange(getNextTimeWarp(timeWarp, true))}>
                  <FastForward className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Increase Time Warp</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => onTimeWarpChange(1)}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset Time Warp to 1x</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <TooltipProvider>
          {/* Create Satellite Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onSatelliteCreatorToggle}
                className={cn(isSatelliteModalOpen && "bg-accent")}
              >
                <Rocket className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create New Satellite</TooltipContent>
          </Tooltip>

          {/* Display Options Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onDisplayOptionsToggle}
                className={cn(isDisplayOptionsOpen && "bg-accent")}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Display Options</TooltipContent>
          </Tooltip>

          {/* Satellite List Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSatelliteListToggle}
                className={cn(isSatelliteListVisible && "bg-accent")}
              >
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Satellite List</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Save/Import/Share Simulation State Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleSaveState}>
                  <Save className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save State</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleShareState}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Share State</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleImportButtonClick}>
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import State</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <input
            ref={importInputRef}
            id="import-state-input"
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImportState}
          />
        </div>
      </div>

      {/* Satellite Creator Modal */}
      <DraggableModal
        title="Create Satellite"
        isOpen={isSatelliteModalOpen}
        onClose={() => onSatelliteCreatorToggle(false)}
        className="w-[400px]"
      >
        <SatelliteCreator
          onCreateSatellite={onCreateSatellite}
        />
      </DraggableModal>

      {/* Share Modal */}
      <DraggableModal
        title="Share Simulation State"
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        className="w-[480px]"
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
  );
}

export default Navbar;