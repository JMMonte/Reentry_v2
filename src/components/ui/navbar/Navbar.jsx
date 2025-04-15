import React, { useState, useEffect } from 'react';
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
  Play
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

  // --- Save/Import Simulation State ---
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

  const handleImportState = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const state = JSON.parse(e.target.result);
        const app = app3DRef.current;
        if (!app) return;
        // Set simulation time
        if (state.simulatedTime) {
          app.timeUtils.setSimulatedTime(state.simulatedTime);
        }
        if (typeof state.timeWarp === 'number') {
          app.timeUtils.setTimeWarp(state.timeWarp);
        }
        // Remove existing satellites
        Object.keys(app.satellites).forEach(id => app.removeSatellite(id));
        // Add satellites from state
        (state.satellites || []).forEach(sat => {
          app.createSatelliteOrbital({
            name: sat.name,
            mass: sat.mass,
            size: sat.size,
            color: sat.color,
            position: new window.THREE.Vector3(sat.position.x, sat.position.y, sat.position.z),
            velocity: new window.THREE.Vector3(sat.velocity.x, sat.velocity.y, sat.velocity.z),
            id: sat.id
          });
        });
      } catch (err) {
        alert('Failed to import simulation state: ' + err.message);
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

        {/* Save/Import Simulation State Buttons */}
        <Button variant="outline" size="sm" onClick={handleSaveState} style={{ minWidth: 90 }}>
          Save State
        </Button>
        <label htmlFor="import-state-input" style={{ margin: 0 }}>
          <Button as="span" variant="outline" size="sm" style={{ minWidth: 90 }}>
            Import State
          </Button>
          <input
            id="import-state-input"
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImportState}
          />
        </label>
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
    </div>
  );
}

export default Navbar;