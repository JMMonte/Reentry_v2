import React from 'react';
import { Button } from '../button';
import { 
  MessageSquare, 
  Eye, 
  Satellite, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw 
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';
import PropTypes from 'prop-types';

export function TopControls({ 
  onToggleChat, 
  onToggleDisplay, 
  onToggleSatellite,
  selectedBody,
  onBodyChange,
  timeWarp,
  onDecreaseTimeWarp,
  onIncreaseTimeWarp,
  onResetTimeWarp
}) {
  return (
    <div className="absolute top-0 left-0 p-4 flex items-center space-x-2">
      <Button variant="ghost" size="icon" onClick={onToggleChat}>
        <MessageSquare className="h-4 w-4" />
      </Button>

      <img src="./assets/images/darksun_logo.svg" alt="Logo" className="h-6" />

      <Button variant="ghost" size="icon" onClick={onToggleDisplay}>
        <Eye className="h-4 w-4" />
      </Button>

      <Select value={selectedBody} onValueChange={onBodyChange}>
        <SelectTrigger className="w-24">
          <SelectValue placeholder="Select body" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          <SelectItem value="earth">Earth</SelectItem>
          <SelectItem value="moon">Moon</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="ghost" onClick={onToggleSatellite}>
        <Satellite className="h-4 w-4 mr-2" />
        Add Satellite
      </Button>

      <div className="flex items-center space-x-2">
        <Button variant="ghost" size="icon" onClick={onDecreaseTimeWarp}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onIncreaseTimeWarp}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onResetTimeWarp}>
          <RotateCcw className="h-4 w-4" />
        </Button>
        <span className="text-sm">{timeWarp}x</span>
      </div>
    </div>
  );
}

TopControls.propTypes = {
  onToggleChat: PropTypes.func.isRequired,
  onToggleDisplay: PropTypes.func.isRequired,
  onToggleSatellite: PropTypes.func.isRequired,
  selectedBody: PropTypes.string.isRequired,
  onBodyChange: PropTypes.func.isRequired,
  timeWarp: PropTypes.number.isRequired,
  onDecreaseTimeWarp: PropTypes.func.isRequired,
  onIncreaseTimeWarp: PropTypes.func.isRequired,
  onResetTimeWarp: PropTypes.func.isRequired
};
