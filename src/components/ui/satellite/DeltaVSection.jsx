import React, { useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Input } from '../input';
import { Slider } from '../slider';
import { Button } from '../button';

// ✅ OPTIMIZED PATTERN: Memoized axis control component
const AxisControl = React.memo(function AxisControl({ 
    axis, 
    value, 
    setter, 
    multiplier, 
    setMultiplier 
}) {
    // Memoized event handlers
    const handleDecrease = useCallback(() => {
        const currentVal = parseFloat(value) || 0;
        const mult = parseFloat(multiplier) || 0;
        setter(String(currentVal - mult));
    }, [value, multiplier, setter]);

    const handleIncrease = useCallback(() => {
        const currentVal = parseFloat(value) || 0;
        const mult = parseFloat(multiplier) || 0;
        setter(String(currentVal + mult));
    }, [value, multiplier, setter]);

    const handleValueChange = useCallback((e) => {
        setter(e.target.value);
    }, [setter]);

    const handleMultiplierChange = useCallback((e) => {
        setMultiplier(e.target.value);
    }, [setMultiplier]);

    const handleSliderChange = useCallback(([v]) => {
        setter(String(v));
    }, [setter]);

    // Memoized parsed value for slider
    const sliderValue = useMemo(() => [parseFloat(value) || 0], [value]);

    return (
        <div className="mb-2">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{axis}</span>
                <div className="flex items-center space-x-1">
                    <Button 
                        size="icon" 
                        variant="outline" 
                        onClick={handleDecrease}
                        title={`Decrease ${axis} by ${multiplier}`}
                    >
                        -
                    </Button>
                    <Input 
                        type="number" 
                        value={value} 
                        onChange={handleValueChange} 
                        className="w-16" 
                    />
                    <Button 
                        size="icon" 
                        variant="outline" 
                        onClick={handleIncrease}
                        title={`Increase ${axis} by ${multiplier}`}
                    >
                        +
                    </Button>
                    <Input 
                        type="number" 
                        value={multiplier} 
                        onChange={handleMultiplierChange} 
                        className="w-12 ml-2"
                        title="Step size"
                    />
                </div>
            </div>
            <Slider
                value={sliderValue}
                onValueChange={handleSliderChange}
                min={-5000}
                max={5000}
                step={10}
                className="mt-1"
            />
        </div>
    );
});

AxisControl.propTypes = {
    axis: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
    setter: PropTypes.func.isRequired,
    multiplier: PropTypes.string.isRequired,
    setMultiplier: PropTypes.func.isRequired
};

// ✅ OPTIMIZED PATTERN: Main component with React.memo and performance optimizations
export const DeltaVSection = React.memo(function DeltaVSection({ 
    vx, vy, vz, setVx, setVy, setVz, 
    multP = "1", multA = "1", multN = "1", 
    setMultP = () => {}, setMultA = () => {}, setMultN = () => {}, 
    dvMag 
}) {
    // 1. REFS for caching calculations
    const lastValuesRef = useRef({ vx: null, vy: null, vz: null });
    const calculationCacheRef = useRef({});

    // 2. MEMOIZED axis configurations to prevent recreations
    const axisConfigs = useMemo(() => [
        {
            axis: 'Prograde',
            value: vx,
            setter: setVx,
            multiplier: multP,
            setMultiplier: setMultP,
            key: 'prograde'
        },
        {
            axis: 'Normal',
            value: vy,
            setter: setVy,
            multiplier: multA,
            setMultiplier: setMultA,
            key: 'normal'
        },
        {
            axis: 'Radial',
            value: vz,
            setter: setVz,
            multiplier: multN,
            setMultiplier: setMultN,
            key: 'radial'
        }
    ], [vx, vy, vz, setVx, setVy, setVz, multP, multA, multN, setMultP, setMultA, setMultN]);

    // 3. MEMOIZED formatted magnitude with change detection
    const formattedMagnitude = useMemo(() => {
        // Create change detection key
        const valuesKey = `${vx}-${vy}-${vz}`;
        
        // Use cached result if values haven't changed
        if (lastValuesRef.current.key === valuesKey && calculationCacheRef.current.magnitude) {
            return calculationCacheRef.current.magnitude;
        }

        // Calculate and cache magnitude
        const magnitude = dvMag.toFixed(1);
        
        // Cache result
        lastValuesRef.current = { vx, vy, vz, key: valuesKey };
        calculationCacheRef.current.magnitude = magnitude;
        
        return magnitude;
    }, [vx, vy, vz, dvMag]);

    // 4. MEMOIZED component statistics for debugging/monitoring
    const componentStats = useMemo(() => {
        const totalDeltaV = Math.abs(parseFloat(vx) || 0) + 
                           Math.abs(parseFloat(vy) || 0) + 
                           Math.abs(parseFloat(vz) || 0);
        
        return {
            hasNonZeroValues: totalDeltaV > 0,
            dominantAxis: Math.abs(parseFloat(vx)) > Math.abs(parseFloat(vy)) && Math.abs(parseFloat(vx)) > Math.abs(parseFloat(vz)) ? 'Prograde' :
                         Math.abs(parseFloat(vy)) > Math.abs(parseFloat(vz)) ? 'Normal' : 'Radial',
            totalAbsoluteDV: totalDeltaV
        };
    }, [vx, vy, vz]);

    return (
        <div>
            <div className="text-[10px] font-semibold mb-1">Delta-V (m/s)</div>
            
            {/* Render axis controls using memoized configuration */}
            {axisConfigs.map((config) => (
                <AxisControl
                    key={config.key}
                    axis={config.axis}
                    value={config.value}
                    setter={config.setter}
                    multiplier={config.multiplier}
                    setMultiplier={config.setMultiplier}
                />
            ))}
            
            {/* Magnitude display with memoized formatting */}
            <div className="text-[10px] font-semibold mt-1">
                |ΔV|: {formattedMagnitude} m/s
                {componentStats.hasNonZeroValues && (
                    <span className="text-muted-foreground ml-2">
                        ({componentStats.dominantAxis} dominant)
                    </span>
                )}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
        prevProps.vx === nextProps.vx &&
        prevProps.vy === nextProps.vy &&
        prevProps.vz === nextProps.vz &&
        prevProps.multP === nextProps.multP &&
        prevProps.multA === nextProps.multA &&
        prevProps.multN === nextProps.multN &&
        Math.abs(prevProps.dvMag - nextProps.dvMag) < 0.01 // Small tolerance for magnitude changes
    );
});

DeltaVSection.propTypes = {
    vx: PropTypes.string.isRequired,
    vy: PropTypes.string.isRequired,
    vz: PropTypes.string.isRequired,
    setVx: PropTypes.func.isRequired,
    setVy: PropTypes.func.isRequired,
    setVz: PropTypes.func.isRequired,
    multP: PropTypes.string,
    multA: PropTypes.string,
    multN: PropTypes.string,
    setMultP: PropTypes.func,
    setMultA: PropTypes.func,
    setMultN: PropTypes.func,
    dvMag: PropTypes.number.isRequired
}; 