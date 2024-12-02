import React, { useState } from 'react';
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
  app3DRef
}) {
  const [satelliteOptions, setSatelliteOptions] = React.useState([]);

  React.useEffect(() => {
    const handleBodyOptionsUpdate = (event) => {
      if (event.detail?.satellites) {
        setSatelliteOptions(event.detail.satellites.map(satellite => ({
          value: satellite.id,
          text: satellite.name || `Satellite ${satellite.id}`
        })));
      }
    };

    document.addEventListener('updateBodyOptions', handleBodyOptionsUpdate);
    return () => document.removeEventListener('updateBodyOptions', handleBodyOptionsUpdate);
  }, []);

  // Update satellite options when app3DRef changes
  React.useEffect(() => {
    if (app3DRef?.current?.satellites) {
      const updateSatelliteOptions = () => {
        const satellites = app3DRef.current.satellites;
        setSatelliteOptions(Object.values(satellites).map(satellite => ({
          value: satellite.id,
          text: satellite.name || `Satellite ${satellite.id}`
        })));
      };

      // Initial update
      updateSatelliteOptions();

      // Listen for satellite changes
      app3DRef.current.addEventListener('satellitesChanged', updateSatelliteOptions);
      return () => {
        if (app3DRef.current) {
          app3DRef.current.removeEventListener('satellitesChanged', updateSatelliteOptions);
        }
      };
    }
  }, [app3DRef?.current]);

  const [satelliteModalPosition, setSatelliteModalPosition] = useState({ x: window.innerWidth - 420, y: 80 });

  const handleBodyChange = (value) => {
    onBodySelect(value);
    
    // Focus camera on selected satellite
    if (value !== 'none' && value !== 'earth' && value !== 'moon') {
      const satellite = app3DRef?.current?.satellites[value];
      if (satellite && window.app3d?.cameraControls) {
        window.app3d.cameraControls.updateCameraTarget(satellite);
      }
    }
    
    document.dispatchEvent(new CustomEvent('bodySelected', {
      detail: { body: value }
    }));
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
            <SelectValue>
              {selectedBody === 'none' ? 'None' : 
               selectedBody === 'earth' ? 'Earth' :
               selectedBody === 'moon' ? 'Moon' :
               satelliteOptions.find(opt => opt.value.toString() === selectedBody)?.text || selectedBody}
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
                  <SelectItem key={value} value={value.toString()}>{text}</SelectItem>
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
          onCreateSatellite={(data) => {
            if (app3DRef.current) {
              let newSatellite;
              switch (data.mode) {
                case 'latlon':
                  newSatellite = app3DRef.current.createSatelliteLatLon(data);
                  break;
                case 'orbital':
                  newSatellite = app3DRef.current.createSatelliteOrbital(data);
                  break;
                case 'circular':
                  newSatellite = app3DRef.current.createSatelliteCircular(data);
                  break;
              }
              // Trigger satellites changed event
              app3DRef.current.dispatchEvent(new Event('satellitesChanged'));
              // Auto-select the new satellite
              if (newSatellite) {
                handleBodyChange(newSatellite.id.toString());
              }
              onSatelliteCreatorToggle(false);
            }
          }}
        />
      </DraggableModal>
    </div>
  );
}
