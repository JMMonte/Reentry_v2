import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '../button';
import { Rewind, FastForward, RotateCcw, Pause, Play } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';
import { Separator } from '../separator';
import { DateTimePicker } from '../datetime/DateTimePicker';
import PropTypes from 'prop-types';

// Memoized precision indicator component
const PrecisionIndicator = React.memo(function PrecisionIndicator({ timeWarp, isLagging }) {
    const precisionData = useMemo(() => {
        if (timeWarp >= 100000) return { 
            tooltip: 'Very Low Precision - Large timesteps', 
            color: 'bg-red-500',
            borderColor: 'border-red-600'
        };
        if (timeWarp >= 10000) return { 
            tooltip: 'Low Precision - Medium timesteps', 
            color: 'bg-orange-500',
            borderColor: 'border-orange-600'
        };
        if (timeWarp >= 1000) return { 
            tooltip: 'Medium Precision', 
            color: 'bg-yellow-500',
            borderColor: 'border-yellow-600'
        };
        if (timeWarp >= 100) return { 
            tooltip: 'High Precision', 
            color: 'bg-green-500',
            borderColor: 'border-green-600'
        };
        return { 
            tooltip: 'Maximum Precision', 
            color: 'bg-blue-500',
            borderColor: 'border-blue-600'
        };
    }, [timeWarp]);

    if (timeWarp <= 0) return null;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center p-2 -m-2 cursor-pointer hover:opacity-80 transition-opacity">
                        {isLagging ? (
                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse ring-2 ring-orange-400 ring-offset-1 ring-offset-background" />
                        ) : (
                            <div className={`w-2 h-2 rounded-full border ${precisionData.color} ${precisionData.borderColor}`} />
                        )}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    {isLagging ? 'Simulation lagging - reduce time warp' : precisionData.tooltip}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
});

PrecisionIndicator.propTypes = {
    timeWarp: PropTypes.number.isRequired,
    isLagging: PropTypes.bool.isRequired
};

// Memoized play/pause button component
const PlayPauseButton = React.memo(function PlayPauseButton({ timeWarp, onTimeWarpChange }) {
    const handleToggle = useCallback(() => {
        onTimeWarpChange(timeWarp === 0 ? 1 : 0);
    }, [timeWarp, onTimeWarpChange]);

    const isPaused = timeWarp === 0;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleToggle}>
                        {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{isPaused ? "Resume" : "Pause"}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
});

PlayPauseButton.propTypes = {
    timeWarp: PropTypes.number.isRequired,
    onTimeWarpChange: PropTypes.func.isRequired
};

// Memoized time warp controls component
const TimeWarpControls = React.memo(function TimeWarpControls({ 
    timeWarp, 
    onTimeWarpChange, 
    timeWarpOptions, 
    getNextTimeWarp, 
    timeWarpLoading 
}) {
    const handleDecrease = useCallback(() => {
        onTimeWarpChange(getNextTimeWarp(timeWarp, false));
    }, [timeWarp, onTimeWarpChange, getNextTimeWarp]);

    const handleIncrease = useCallback(() => {
        onTimeWarpChange(getNextTimeWarp(timeWarp, true));
    }, [timeWarp, onTimeWarpChange, getNextTimeWarp]);

    const handleReset = useCallback(() => {
        onTimeWarpChange(1);
    }, [onTimeWarpChange]);

    const handleSelectChange = useCallback((value) => {
        onTimeWarpChange(parseFloat(value));
    }, [onTimeWarpChange]);

    // Memoized loading spinner style
    const loadingSpinnerStyle = useMemo(() => ({
        display: 'inline-block',
        width: 16,
        height: 16,
        border: '2px solid #ccc',
        borderTop: '2px solid #333',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        verticalAlign: 'middle'
    }), []);

    return (
        <>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleDecrease}>
                            <Rewind className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Decrease Time Warp</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <PlayPauseButton timeWarp={timeWarp} onTimeWarpChange={onTimeWarpChange} />

            <Select
                value={timeWarp.toString()}
                onValueChange={handleSelectChange}
                defaultValue="1"
            >
                <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Time Warp">
                        {timeWarpLoading ? (
                            <span style={loadingSpinnerStyle} />
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
                        <Button variant="ghost" size="icon" onClick={handleIncrease}>
                            <FastForward className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Increase Time Warp</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleReset}>
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset Time Warp to 1x</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </>
    );
});

TimeWarpControls.propTypes = {
    timeWarp: PropTypes.number.isRequired,
    onTimeWarpChange: PropTypes.func.isRequired,
    timeWarpOptions: PropTypes.array.isRequired,
    getNextTimeWarp: PropTypes.func.isRequired,
    timeWarpLoading: PropTypes.bool
};

// Main component without memoization to ensure time updates work properly
const TimeControls = function TimeControls({ 
    timeWarp, 
    onTimeWarpChange, 
    simulatedTime, 
    onSimulatedTimeChange, 
    timeWarpOptions, 
    getNextTimeWarp, 
    timeWarpLoading 
}) {
    const [isLagging, setIsLagging] = useState(false);
    
    // Listen for time warp lag warnings with optimized cleanup
    useEffect(() => {
        let lagTimeoutId = null;
        
        const lagHandler = () => {
            setIsLagging(true);
            // Clear any existing timeout
            if (lagTimeoutId) clearTimeout(lagTimeoutId);
            // Clear warning after 2 seconds
            lagTimeoutId = setTimeout(() => setIsLagging(false), 2000);
        };
        
        document.addEventListener('timeWarpLagging', lagHandler);
        return () => {
            document.removeEventListener('timeWarpLagging', lagHandler);
            if (lagTimeoutId) clearTimeout(lagTimeoutId);
        };
    }, []);

    // Memoized CSS for spinner animation to prevent recreation
    const spinnerCSS = useMemo(() => 
        '@keyframes spin { to { transform: rotate(360deg); } }',
        []
    );

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
                <TimeWarpControls
                    timeWarp={timeWarp}
                    onTimeWarpChange={onTimeWarpChange}
                    timeWarpOptions={timeWarpOptions}
                    getNextTimeWarp={getNextTimeWarp}
                    timeWarpLoading={timeWarpLoading}
                />
                
                <PrecisionIndicator timeWarp={timeWarp} isLagging={isLagging} />
                
                <style>{spinnerCSS}</style>
            </div>
        </>
    );
};

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