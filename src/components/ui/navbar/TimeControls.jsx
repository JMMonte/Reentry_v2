import React, { useState, useEffect } from 'react';
import { Button } from '../button';
import { Rewind, FastForward, RotateCcw, Pause, Play, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';
import { Separator } from '../separator';
import { DateTimePicker } from '../datetime/DateTimePicker';
import PropTypes from 'prop-types';

function TimeControls({ timeWarp, onTimeWarpChange, simulatedTime, onSimulatedTimeChange, timeWarpOptions, getNextTimeWarp, timeWarpLoading }) {
    const [isLagging, setIsLagging] = useState(false);
    
    // Listen for time warp lag warnings
    useEffect(() => {
        const handleLag = (e) => {
            setIsLagging(true);
            // Clear warning after 2 seconds
            setTimeout(() => setIsLagging(false), 2000);
        };
        
        document.addEventListener('timeWarpLagging', handleLag);
        return () => document.removeEventListener('timeWarpLagging', handleLag);
    }, []);
    
    // Get precision indicator based on time warp
    const getPrecisionIndicator = (warp) => {
        if (warp >= 100000) return { 
            tooltip: 'Very Low Precision - 20-100s timesteps', 
            color: 'bg-red-500',
            borderColor: 'border-red-600'
        };
        if (warp >= 10000) return { 
            tooltip: 'Low Precision - 5s timesteps', 
            color: 'bg-orange-500',
            borderColor: 'border-orange-600'
        };
        if (warp >= 1000) return { 
            tooltip: 'Medium Precision - 1s timesteps', 
            color: 'bg-yellow-500',
            borderColor: 'border-yellow-600'
        };
        if (warp >= 100) return { 
            tooltip: 'High Precision - 0.2s timesteps', 
            color: 'bg-green-500',
            borderColor: 'border-green-600'
        };
        return { 
            tooltip: 'Maximum Precision - 60Hz physics', 
            color: 'bg-blue-500',
            borderColor: 'border-blue-600'
        };
    };
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
                
                {/* Precision/Lag Indicator - Fixed size dot with larger hover area */}
                {timeWarp > 0 && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center p-2 -m-2 cursor-pointer hover:opacity-80 transition-opacity">
                                    {isLagging ? (
                                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse ring-2 ring-orange-400 ring-offset-1 ring-offset-background" />
                                    ) : (
                                        <div className={`w-2 h-2 rounded-full border ${getPrecisionIndicator(timeWarp).color} ${getPrecisionIndicator(timeWarp).borderColor}`} />
                                    )}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isLagging ? 'Simulation lagging - reduce time warp' : getPrecisionIndicator(timeWarp).tooltip}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
                
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