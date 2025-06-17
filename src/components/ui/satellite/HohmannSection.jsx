import React, { useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { Input } from '../input';

// ✅ OPTIMIZED PATTERN: Memoized HohmannSection component
export const HohmannSection = React.memo(function HohmannSection({
    targetSmaKm,
    setTargetSmaKm,
    generateHohmann,
    onCancel,
    onComplete
}) {
    // 1. MEMOIZED event handlers
    const handleTargetSmaChange = useCallback((e) => {
        setTargetSmaKm(e.target.value);
    }, [setTargetSmaKm]);

    const handleGenerateManeuver = useCallback(() => {
        generateHohmann();
        onComplete();
    }, [generateHohmann, onComplete]);

    const handleCancel = useCallback(() => {
        onCancel();
    }, [onCancel]);

    // 2. MEMOIZED input validation
    const inputValidation = useMemo(() => {
        const numValue = parseFloat(targetSmaKm);
        const isValid = !isNaN(numValue) && numValue > 0;
        return {
            isValid,
            value: numValue,
            className: isValid ? "w-20" : "w-20 border-red-500"
        };
    }, [targetSmaKm]);

    return (
        <div className="text-[10px] flex flex-col space-y-4">
            {/* Action Buttons */}
            <div className="flex justify-end space-x-2">
                <Button 
                    size="sm" 
                    onClick={handleGenerateManeuver}
                    disabled={!inputValidation.isValid}
                    title={!inputValidation.isValid ? "Please enter a valid SMA value" : "Generate Hohmann transfer maneuver"}
                >
                    Generate Maneuver
                </Button>
                <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={handleCancel}
                    title="Cancel maneuver planning"
                >
                    Cancel
                </Button>
            </div>
            
            {/* Target Orbit: only semi-major axis */}
            <div className="space-y-2">
                <div className="text-[10px] font-semibold mb-1">Target Orbit</div>
                <div className="flex items-center space-x-2">
                    <label className="text-[10px] w-16 text-right">SMA (km):</label>
                    <Input
                        type="number"
                        value={targetSmaKm}
                        onChange={handleTargetSmaChange}
                        className={inputValidation.className}
                        placeholder="Enter SMA"
                        min="6371"
                        step="1"
                        title="Semi-major axis in kilometers (must be > 6371 km)"
                    />
                    {!inputValidation.isValid && targetSmaKm && (
                        <span className="text-xs text-red-500">Invalid</span>
                    )}
                </div>
                {inputValidation.isValid && inputValidation.value > 0 && (
                    <div className="text-xs text-muted-foreground pl-18">
                        Altitude: ~{Math.max(0, inputValidation.value - 6371).toFixed(0)} km
                    </div>
                )}
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
        prevProps.targetSmaKm === nextProps.targetSmaKm &&
        prevProps.setTargetSmaKm === nextProps.setTargetSmaKm &&
        prevProps.generateHohmann === nextProps.generateHohmann &&
        prevProps.onCancel === nextProps.onCancel &&
        prevProps.onComplete === nextProps.onComplete
    );
});

HohmannSection.propTypes = {
    targetSmaKm: PropTypes.string.isRequired,
    setTargetSmaKm: PropTypes.func.isRequired,
    generateHohmann: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    onComplete: PropTypes.func.isRequired
};

export default HohmannSection; 