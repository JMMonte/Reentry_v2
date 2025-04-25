import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { Input } from '../input';

export function HohmannSection({
    targetSmaKm,
    setTargetSmaKm,
    targetEcc,
    setTargetEcc,
    manualBurnTime,
    setManualBurnTime,
    findBestBurnTime,
    findNextPeriapsis,
    findNextApoapsis,
    generateHohmann,
    onCancel,
    onComplete
}) {
    const [burnTimeInput, setBurnTimeInput] = useState(manualBurnTime ? manualBurnTime.toISOString().slice(0, 19) : '');

    // Handler for manual time input
    const handleBurnTimeChange = (e) => {
        setBurnTimeInput(e.target.value);
        setManualBurnTime(e.target.value ? new Date(e.target.value) : null);
    };

    // Handler for "Best Time" (e.g., optimal burn time)
    const handleBestTime = () => {
        const best = findBestBurnTime();
        if (best) {
            setManualBurnTime(best);
            setBurnTimeInput(best.toISOString().slice(0, 19));
        }
    };

    // Handler for next periapsis
    const handleNextPeriapsis = () => {
        const t = findNextPeriapsis();
        setManualBurnTime(t);
        setBurnTimeInput(t.toISOString().slice(0, 19));
    };

    // Handler for next apoapsis
    const handleNextApoapsis = () => {
        const t = findNextApoapsis();
        setManualBurnTime(t);
        setBurnTimeInput(t.toISOString().slice(0, 19));
    };

    return (
        <div className="text-[10px] flex flex-col space-y-4">
            {/* Action Buttons */}
            <div className="flex justify-end space-x-2">
                <Button size="sm" onClick={() => { generateHohmann(); onComplete(); }}>
                    Generate Maneuver
                </Button>
                <Button variant="secondary" size="sm" onClick={onCancel}>
                    Cancel
                </Button>
            </div>

            {/* Orbital Elements: semi-major axis and eccentricity */}
            <div className="space-y-2">
                <div className="text-[10px] font-semibold mb-1">Target Orbit</div>
                <div className="flex items-center space-x-2">
                    <span className="text-sm">a (km):</span>
                    <Input
                        type="number"
                        value={targetSmaKm}
                        onChange={e => setTargetSmaKm(e.target.value)}
                        className="w-20"
                    />
                    <span className="text-sm">e:</span>
                    <Input
                        type="number"
                        value={targetEcc}
                        onChange={e => setTargetEcc(e.target.value)}
                        className="w-16"
                        step="any"
                    />
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-sm">Burn Time (UTC):</span>
                    <Input
                        type="datetime-local"
                        value={burnTimeInput}
                        onChange={handleBurnTimeChange}
                        className="w-56"
                    />
                    <Button size="sm" variant="outline" onClick={handleBestTime}>
                        Best Time
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleNextPeriapsis}>
                        Next Periapsis
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleNextApoapsis}>
                        Next Apoapsis
                    </Button>
                </div>
            </div>
        </div>
    );
}

HohmannSection.propTypes = {
    targetSmaKm: PropTypes.string.isRequired,
    setTargetSmaKm: PropTypes.func.isRequired,
    targetEcc: PropTypes.string.isRequired,
    setTargetEcc: PropTypes.func.isRequired,
    manualBurnTime: PropTypes.instanceOf(Date),
    setManualBurnTime: PropTypes.func.isRequired,
    findBestBurnTime: PropTypes.func.isRequired,
    findNextPeriapsis: PropTypes.func.isRequired,
    findNextApoapsis: PropTypes.func.isRequired,
    generateHohmann: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    onComplete: PropTypes.func.isRequired
};

export default HohmannSection; 