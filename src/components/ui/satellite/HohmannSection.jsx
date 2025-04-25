import React from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { Input } from '../input';

export function HohmannSection({
    targetSmaKm,
    setTargetSmaKm,
    generateHohmann,
    onCancel,
    onComplete
}) {
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
            
            {/* Target Orbit: only semi-major axis */}
            <div className="space-y-2">
                <div className="text-[10px] font-semibold mb-1">Target Orbit</div>
                <div className="flex items-center space-x-2">
                    <label className="text-[10px] w-16 text-right">SMA (km):</label>
                    <Input
                        type="number"
                        value={targetSmaKm}
                        onChange={e => setTargetSmaKm(e.target.value)}
                        className="w-20"
                    />
                </div>
            </div>
        </div>
    );
}

HohmannSection.propTypes = {
    targetSmaKm: PropTypes.string.isRequired,
    setTargetSmaKm: PropTypes.func.isRequired,
    generateHohmann: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    onComplete: PropTypes.func.isRequired
};

export default HohmannSection; 