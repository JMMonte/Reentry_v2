import React, { useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs';
import { Input } from '../input';
import { Button } from '../button';

// ✅ OPTIMIZED PATTERN: Memoized time field component
const TimeField = React.memo(function TimeField({ 
    label, 
    value, 
    setter, 
    multiplier, 
    setMultiplier, 
    min, 
    max 
}) {
    // Memoized event handlers
    const handleDecrease = useCallback(() => {
        const current = parseInt(value) || 0;
        const mult = parseInt(multiplier) || 0;
        const newValue = Math.max(min, Math.min(max, current - mult));
        setter(newValue);
    }, [value, multiplier, min, max, setter]);

    const handleIncrease = useCallback(() => {
        const current = parseInt(value) || 0;
        const mult = parseInt(multiplier) || 0;
        const newValue = Math.max(min, Math.min(max, current + mult));
        setter(newValue);
    }, [value, multiplier, min, max, setter]);

    const handleValueChange = useCallback((e) => {
        let newValue = parseInt(e.target.value) || 0;
        newValue = Math.max(min, Math.min(max, newValue));
        setter(newValue);
    }, [setter, min, max]);

    const handleMultiplierChange = useCallback((e) => {
        setMultiplier(e.target.value);
    }, [setMultiplier]);

    // Memoized formatted value with proper padding
    const formattedValue = useMemo(() => {
        return String(value).padStart(label === 'MS' ? 3 : 2, '0');
    }, [value, label]);

    return (
        <div className="flex items-center space-x-3 text-[10px]">
            <span>{label}</span>
            <Button 
                size="icon" 
                variant="outline" 
                onClick={handleDecrease}
                title={`Decrease ${label} by ${multiplier}`}
            >
                -
            </Button>
            <Input
                type="number"
                value={formattedValue}
                onChange={handleValueChange}
                className="w-[5ch]"
                min={min}
                max={max}
            />
            <Button 
                size="icon" 
                variant="outline" 
                onClick={handleIncrease}
                title={`Increase ${label} by ${multiplier}`}
            >
                +
            </Button>
            <Input 
                type="number" 
                value={multiplier} 
                onChange={handleMultiplierChange} 
                className="w-16" 
                title="Step size"
            />
        </div>
    );
});

TimeField.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.number.isRequired,
    setter: PropTypes.func.isRequired,
    multiplier: PropTypes.string.isRequired,
    setMultiplier: PropTypes.func.isRequired,
    min: PropTypes.number.isRequired,
    max: PropTypes.number.isRequired
};

// ✅ OPTIMIZED PATTERN: Main component with React.memo and performance optimizations
export const ExecutionTimeSection = React.memo(function ExecutionTimeSection({
    simTime,
    timeMode,
    setTimeMode,
    offsetSec,
    setOffsetSec,
    hours,
    setHours,
    minutes,
    setMinutes,
    seconds,
    setSeconds,
    milliseconds,
    setMilliseconds,
    multOffset,
    setMultOffset,
    multH,
    setMultH,
    multMin,
    setMultMin,
    multSVal,
    setMultSVal,
    multMsVal,
    setMultMsVal,
    computeNextPeriapsis,
    computeNextApoapsis,
}) {
    // 1. REFS for caching calculations
    const calculationCacheRef = useRef({});
    const lastSimTimeRef = useRef(null);

    // 2. MEMOIZED time field configurations to prevent recreations
    const timeFieldConfigs = useMemo(() => [
        { 
            label: 'HH', 
            value: hours, 
            setter: setHours, 
            multiplier: multH, 
            setMultiplier: setMultH, 
            min: 0, 
            max: 23,
            key: 'hours'
        },
        { 
            label: 'MM', 
            value: minutes, 
            setter: setMinutes, 
            multiplier: multMin, 
            setMultiplier: setMultMin, 
            min: 0, 
            max: 59,
            key: 'minutes'
        },
        { 
            label: 'SS', 
            value: seconds, 
            setter: setSeconds, 
            multiplier: multSVal, 
            setMultiplier: setMultSVal, 
            min: 0, 
            max: 59,
            key: 'seconds'
        },
        { 
            label: 'MS', 
            value: milliseconds, 
            setter: setMilliseconds, 
            multiplier: multMsVal, 
            setMultiplier: setMultMsVal, 
            min: 0, 
            max: 999,
            key: 'milliseconds'
        }
    ], [
        hours, setHours, multH, setMultH,
        minutes, setMinutes, multMin, setMultMin,
        seconds, setSeconds, multSVal, setMultSVal,
        milliseconds, setMilliseconds, multMsVal, setMultMsVal
    ]);

    // 3. MEMOIZED offset control handlers
    const handleOffsetDecrease = useCallback(() => {
        const current = parseFloat(offsetSec) || 0;
        const mult = parseFloat(multOffset) || 0;
        setOffsetSec(String(current - mult));
    }, [offsetSec, multOffset, setOffsetSec]);

    const handleOffsetIncrease = useCallback(() => {
        const current = parseFloat(offsetSec) || 0;
        const mult = parseFloat(multOffset) || 0;
        setOffsetSec(String(current + mult));
    }, [offsetSec, multOffset, setOffsetSec]);

    const handleOffsetChange = useCallback((e) => {
        setOffsetSec(e.target.value);
    }, [setOffsetSec]);

    const handleMultOffsetChange = useCallback((e) => {
        setMultOffset(e.target.value);
    }, [setMultOffset]);

    // 4. MEMOIZED calculated dates with change detection
    const calculatedDates = useMemo(() => {
        // Create change detection key for computation inputs
        const computationKey = simTime ? simTime.getTime() : 0;
        
        // Use cached results if inputs haven't changed
        if (lastSimTimeRef.current === computationKey && calculationCacheRef.current.dates) {
            return calculationCacheRef.current.dates;
        }

        const dates = {
            offsetExecution: null,
            nextPeriapsis: null,
            nextApoapsis: null
        };

        try {
            // Calculate offset execution time
            if (simTime) {
                dates.offsetExecution = new Date(simTime.getTime() + (parseFloat(offsetSec) || 0) * 1000);
            }

            // Calculate next periapsis with error handling
            try {
                const periapsis = computeNextPeriapsis();
                dates.nextPeriapsis = periapsis && !isNaN(periapsis.getTime()) ? periapsis : null;
            } catch (error) {
                console.warn('Error computing next periapsis:', error);
                dates.nextPeriapsis = null;
            }

            // Calculate next apoapsis with error handling
            try {
                const apoapsis = computeNextApoapsis();
                dates.nextApoapsis = apoapsis && !isNaN(apoapsis.getTime()) ? apoapsis : null;
            } catch (error) {
                console.warn('Error computing next apoapsis:', error);
                dates.nextApoapsis = null;
            }
        } catch (error) {
            console.warn('Error in date calculations:', error);
        }

        // Cache results
        lastSimTimeRef.current = computationKey;
        calculationCacheRef.current.dates = dates;
        
        return dates;
    }, [simTime, offsetSec, computeNextPeriapsis, computeNextApoapsis]);

    // 5. MEMOIZED formatted display strings
    const formattedDisplays = useMemo(() => {
        return {
            offsetDisplay: calculatedDates.offsetExecution 
                ? `Executes at: ${calculatedDates.offsetExecution.toISOString()}`
                : 'Invalid time calculation',
            
            periapsisDisplay: calculatedDates.nextPeriapsis
                ? `Executes at next periapsis: ${calculatedDates.nextPeriapsis.toISOString()}`
                : 'Unable to calculate next periapsis',
            
            apoapsisDisplay: calculatedDates.nextApoapsis
                ? `Executes at next apoapsis: ${calculatedDates.nextApoapsis.toISOString()}`
                : 'Unable to calculate next apoapsis'
        };
    }, [calculatedDates]);

    // 6. MEMOIZED tab change handler
    const handleTabChange = useCallback((newMode) => {
        setTimeMode(newMode);
    }, [setTimeMode]);

    return (
        <div className="mb-2">
            <Tabs value={timeMode} onValueChange={handleTabChange}>
                <div className="flex items-center space-x-2 mb-1 text-[10px] text-muted-foreground">
                    <TabsList className="space-x-1">
                        <TabsTrigger value="offset">Offset (s)</TabsTrigger>
                        <TabsTrigger value="datetime">Date/Time</TabsTrigger>
                        <TabsTrigger value="nextPeriapsis">Next Periapsis</TabsTrigger>
                        <TabsTrigger value="nextApoapsis">Next Apoapsis</TabsTrigger>
                    </TabsList>
                </div>
                
                {/* Offset Mode */}
                <TabsContent value="offset">
                    <div className="flex items-center space-x-1">
                        <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={handleOffsetDecrease}
                            title={`Decrease offset by ${multOffset}s`}
                        >
                            -
                        </Button>
                        <Input 
                            type="number" 
                            value={offsetSec} 
                            onChange={handleOffsetChange} 
                            className="w-20" 
                        />
                        <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={handleOffsetIncrease}
                            title={`Increase offset by ${multOffset}s`}
                        >
                            +
                        </Button>
                        <Input 
                            type="number" 
                            value={multOffset} 
                            onChange={handleMultOffsetChange} 
                            className="w-12" 
                            title="Step size"
                        />
                        <span className="text-[10px]">s</span>
                    </div>
                    <div className="text-[10px] mt-1">
                        {formattedDisplays.offsetDisplay}
                    </div>
                </TabsContent>
                
                {/* DateTime Mode */}
                <TabsContent value="datetime">
                    {timeFieldConfigs.map((config) => (
                        <TimeField
                            key={config.key}
                            label={config.label}
                            value={config.value}
                            setter={config.setter}
                            multiplier={config.multiplier}
                            setMultiplier={config.setMultiplier}
                            min={config.min}
                            max={config.max}
                        />
                    ))}
                </TabsContent>
                
                {/* Next Periapsis Mode */}
                <TabsContent value="nextPeriapsis">
                    <div className="text-[10px]">
                        {formattedDisplays.periapsisDisplay}
                    </div>
                </TabsContent>
                
                {/* Next Apoapsis Mode */}
                <TabsContent value="nextApoapsis">
                    <div className="text-[10px]">
                        {formattedDisplays.apoapsisDisplay}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
        prevProps.timeMode === nextProps.timeMode &&
        prevProps.offsetSec === nextProps.offsetSec &&
        prevProps.hours === nextProps.hours &&
        prevProps.minutes === nextProps.minutes &&
        prevProps.seconds === nextProps.seconds &&
        prevProps.milliseconds === nextProps.milliseconds &&
        prevProps.multOffset === nextProps.multOffset &&
        prevProps.multH === nextProps.multH &&
        prevProps.multMin === nextProps.multMin &&
        prevProps.multSVal === nextProps.multSVal &&
        prevProps.multMsVal === nextProps.multMsVal &&
        prevProps.simTime?.getTime() === nextProps.simTime?.getTime()
    );
});

ExecutionTimeSection.propTypes = {
    simTime: PropTypes.instanceOf(Date).isRequired,
    timeMode: PropTypes.string.isRequired,
    setTimeMode: PropTypes.func.isRequired,
    offsetSec: PropTypes.string.isRequired,
    setOffsetSec: PropTypes.func.isRequired,
    hours: PropTypes.number.isRequired,
    setHours: PropTypes.func.isRequired,
    minutes: PropTypes.number.isRequired,
    setMinutes: PropTypes.func.isRequired,
    seconds: PropTypes.number.isRequired,
    setSeconds: PropTypes.func.isRequired,
    milliseconds: PropTypes.number.isRequired,
    setMilliseconds: PropTypes.func.isRequired,
    multOffset: PropTypes.string.isRequired,
    setMultOffset: PropTypes.func.isRequired,
    multH: PropTypes.string.isRequired,
    setMultH: PropTypes.func.isRequired,
    multMin: PropTypes.string.isRequired,
    setMultMin: PropTypes.func.isRequired,
    multSVal: PropTypes.string.isRequired,
    setMultSVal: PropTypes.func.isRequired,
    multMsVal: PropTypes.string.isRequired,
    setMultMsVal: PropTypes.func.isRequired,
    computeNextPeriapsis: PropTypes.func.isRequired,
    computeNextApoapsis: PropTypes.func.isRequired
}; 