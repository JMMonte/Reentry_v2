import React from 'react';
import { Button } from '../button';
import { Separator } from '../separator';
import { 
  Globe2,
  Grid,
  Move,
  Circle,
  LineChart,
  MapPin,
  Building2,
  Plane,
  Rocket,
  Telescope,
  Radio,
  Map,
  Moon,
  Link2,
  MessageSquare,
  Rewind,
  FastForward,
  RotateCcw,
  Settings2,
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

export function Navbar({ 
  onToggleChat,
  selectedBody,
  onBodyChange,
  timeWarp,
  onDecreaseTimeWarp,
  onIncreaseTimeWarp,
  onResetTimeWarp,
  onCreateSatellite
}) {
  return (
    <div className="fixed top-0 left-0 right-0 h-[72px] flex items-center justify-between z-20 bg-gradient-to-b from-background/90 to-transparent backdrop-blur-sm px-4">
      <div className="flex items-center space-x-4">
        {/* Chat Toggle */}
        <Button variant="ghost" size="icon" onClick={onToggleChat}>
          <MessageSquare className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-8" />

        {/* Body Selection */}
        <Select value={selectedBody} onValueChange={onBodyChange}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Select body" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="earth">Earth</SelectItem>
            <SelectItem value="moon">Moon</SelectItem>
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-8" />

        {/* Time Warp Controls */}
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" onClick={onDecreaseTimeWarp}>
            <Rewind className="h-4 w-4" />
          </Button>
          <div className="w-16 text-center font-mono">
            {timeWarp}x
          </div>
          <Button variant="ghost" size="icon" onClick={onIncreaseTimeWarp}>
            <FastForward className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onResetTimeWarp}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Create Satellite Button */}
      <div className="flex items-center space-x-2">
        <Button variant="ghost" size="icon" onClick={onCreateSatellite}>
          <Rocket className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
