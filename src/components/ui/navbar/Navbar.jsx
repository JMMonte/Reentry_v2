import React, { useState, useEffect } from 'react';
import { Button } from '../button';
import { Switch } from '../switch';
import { 
  Settings2,
  Grid,
  Move,
  Circle,
  Mountain,
  LineChart,
  MapPin,
  Building2,
  Plane,
  Rocket,
  Telescope,
  Radio,
  Map,
  Moon,
  Link,
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

  // Update satellite options when satellites prop changes or when a new satellite is created
  useEffect(() => {
    const satelliteArray = Object.values(satellites);
    
    if (satelliteArray.length > 0) {
      const options = satelliteArray
        .filter(satellite => satellite && satellite.id != null && satellite.name)
        .map(satellite => ({
          value: satellite.id.toString(),
          text: satellite.name
        }));
      setSatelliteOptions(options);
    } else {
      setSatelliteOptions([]);
    }
  }, [satellites]);

  // Listen for satellite creation events
  useEffect(() => {
    const handleSatelliteCreated = (event) => {
      const { id, name, mode } = event.detail;
      
      // Validate that we have an id
      if (typeof id === 'undefined') {
        console.error('Invalid satellite data received:', event.detail);
        return;
      }

      // Use a default name if none provided
      const satelliteName = name || `Satellite ${id}`;

      // Add the new satellite to the options
      setSatelliteOptions(prev => [
        ...prev,
        {
          value: id.toString(),
          text: satelliteName
        }
      ]);

      // Update the selected body without focusing the camera
      handleBodyChange(id.toString(), false);
    };

    document.addEventListener('satelliteCreated', handleSatelliteCreated);
    return () => document.removeEventListener('satelliteCreated', handleSatelliteCreated);
  }, []);

  // Helper function to get the display value
  const getDisplayValue = (value) => {
    if (!value) return 'None';
    if (value === 'none') return 'None';
    if (value === 'earth') return 'Earth';
    if (value === 'moon') return 'Moon';
    
    // Try to find the satellite in options first
    const option = satelliteOptions.find(opt => opt.value === value.toString());
    if (option) {
      return option.text;
    }
    
    // Try to find in satellites object
    const satellite = satellites[value];
    if (satellite && satellite.name) {
      return satellite.name;
    }
    
    return `Satellite ${value}`;
  };

  const handleBodyChange = (value, focusCamera = true) => {
    // For non-satellite values, pass them directly
    if (!value || value === 'none' || value === 'earth' || value === 'moon') {
      onBodySelect(value);
    } else {
      // For satellites, pass the ID directly
      onBodySelect(value);
      
      // Focus camera on selected satellite only if focusCamera is true
      if (focusCamera && app3DRef?.current?.satellites) {
        const satellite = app3DRef.current.satellites[value];
        if (satellite && window.app3d?.cameraControls) {
          window.app3d.cameraControls.updateCameraTarget(satellite);
        }
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
        // For manual creation, always focus the camera
        handleBodyChange(satellite.id.toString(), true);
        onSatelliteCreatorToggle(false);
      }
    } catch (error) {
      console.error('Error creating satellite:', error);
    }
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
