import React from 'react';
import { Button } from '../button';
import { Rewind, FastForward, RotateCcw, Pause, Play } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';
import { Separator } from '../separator';
import { DateTimePicker } from '../datetime/DateTimePicker';
import PropTypes from 'prop-types';

function TimeControls({ timeWarp, onTimeWarpChange, simulatedTime, onSimulatedTimeChange, timeWarpOptions, getNextTimeWarp, timeWarpLoading }) {
    return (
        <>
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
                            <Button variant="ghost" size="icon" onClick={() => { console.log('[TimeControls] Decrease Time Warp'); onTimeWarpChange(getNextTimeWarp(timeWarp, false)); }}>
                                <Rewind className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Decrease Time Warp</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => { console.log('[TimeControls] Toggle Pause/Resume'); onTimeWarpChange(timeWarp === 0 ? 1 : 0); }}>
                                {timeWarp === 0 ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{timeWarp === 0 ? "Resume" : "Pause"}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <Select
                    value={timeWarp.toString()}
                    onValueChange={(value) => { console.log('[TimeControls] Select Time Warp', value); onTimeWarpChange(parseFloat(value)); }}
                    defaultValue="1"
                >
                    <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="Time Warp">
                            {timeWarpLoading ? (
                                <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #ccc', borderTop: '2px solid #333', borderRadius: '50%', animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />
                            ) : (
                                `${timeWarp}x`
                            )}
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
                            <Button variant="ghost" size="icon" onClick={() => { console.log('[TimeControls] Increase Time Warp'); onTimeWarpChange(getNextTimeWarp(timeWarp, true)); }}>
                                <FastForward className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Increase Time Warp</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => { console.log('[TimeControls] Reset Time Warp'); onTimeWarpChange(1); }}>
                                <RotateCcw className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Reset Time Warp to 1x</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </>
    );
}

TimeControls.propTypes = {
    timeWarp: PropTypes.number.isRequired,
    onTimeWarpChange: PropTypes.func.isRequired,
    simulatedTime: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.instanceOf(Date)
    ]).isRequired,
    onSimulatedTimeChange: PropTypes.func.isRequired,
    timeWarpOptions: PropTypes.array.isRequired,
    getNextTimeWarp: PropTypes.func.isRequired,
    timeWarpLoading: PropTypes.bool
};

export default TimeControls; 