import React, { useState } from 'react';
import { Button } from '../button';
import { Separator } from '../separator';
import { DateTimePicker } from '../datetime/DateTimePicker';
import { 
  Rocket,
  Radio,
  MessageSquare,
  Rewind,
  FastForward,
  RotateCcw,
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
} from '../select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import SatelliteModal from '../satellite/SatelliteModal';

// Time warp options
const timeWarpOptions = [0, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000];

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
  onToggleChat,
  selectedBody,
  onBodySelect,
  timeWarp,
  onTimeWarpChange,
  onCreateSatellite,
  simulatedTime,
  onSimulatedTimeChange
}) {
  const [satelliteOptions, setSatelliteOptions] = React.useState([]);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = React.useState(false);

  const handleCreateSatellite = (data) => {
    // We'll implement this in app3d.js
    if (window.app3d) {
      switch (data.mode) {
        case 'latlon':
          window.app3d.createSatelliteLatLon(data);
          break;
        case 'orbital':
          window.app3d.createSatelliteOrbital(data);
          break;
        case 'circular':
          window.app3d.createSatelliteCircular(data);
          break;
      }
    }
  };

  React.useEffect(() => {
    const handleBodyOptionsUpdate = (event) => {
      setSatelliteOptions(event.detail.satellites);
    };

    document.addEventListener('updateBodyOptions', handleBodyOptionsUpdate);
    return () => document.removeEventListener('updateBodyOptions', handleBodyOptionsUpdate);
  }, []);

  const handleBodyChange = (value) => {
    onBodySelect(value);
    document.dispatchEvent(new CustomEvent('bodySelected', {
      detail: { body: value }
    }));
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-[72px] flex items-center justify-between z-20 bg-gradient-to-b from-background/90 to-transparent backdrop-blur-sm px-4">
      <div className="flex items-center space-x-4">
        {/* Chat Toggle */}
        <Button variant="ghost" size="icon" onClick={onToggleChat}>
          <MessageSquare className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-8" />

        {/* DateTime Picker */}
        <DateTimePicker 
          date={simulatedTime} 
          onDateTimeChange={onSimulatedTimeChange} 
        />

        <Separator orientation="vertical" className="h-8" />

        {/* Body Selection */}
        <Select value={selectedBody} onValueChange={handleBodyChange}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Select body" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="earth">Earth</SelectItem>
            <SelectItem value="moon">Moon</SelectItem>
            {satelliteOptions.map(({ value, text }) => (
              <SelectItem key={value} value={value}>{text}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-8" />

        {/* Time Warp Controls */}
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" onClick={() => onTimeWarpChange(current => getNextTimeWarp(current, false))}>
            <Rewind className="h-4 w-4" />
          </Button>
          <div className="w-24 text-center font-mono">
            {timeWarp >= 1000 ? `${(timeWarp/1000).toLocaleString()}k` : timeWarp}x
          </div>
          <Button variant="ghost" size="icon" onClick={() => onTimeWarpChange(current => getNextTimeWarp(current, true))}>
            <FastForward className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onTimeWarpChange(1)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-8" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setIsSatelliteModalOpen(true)}>
                <Rocket className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Create New Satellite</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <SatelliteModal
        isOpen={isSatelliteModalOpen}
        onClose={() => setIsSatelliteModalOpen(false)}
        onCreateSatellite={handleCreateSatellite}
      />
    </div>
  );
}
