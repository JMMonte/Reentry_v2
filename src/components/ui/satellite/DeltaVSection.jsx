import React from 'react';
import PropTypes from 'prop-types';
import { Input } from '../input';
import { Slider } from '../slider';
import { Button } from '../button';

export function DeltaVSection({ vx, vy, vz, setVx, setVy, setVz, multP, multA, multN, setMultP, setMultA, setMultN, dvMag }) {
    return (
        <div>
            <div className="text-[10px] font-semibold mb-1">Delta-V (m/s)</div>
            {['Prograde', 'Antiradial', 'Normal'].map((axis, idx) => {
                const val = idx === 0 ? vx : idx === 1 ? vy : vz;
                const setter = idx === 0 ? setVx : idx === 1 ? setVy : setVz;
                const mult = idx === 0 ? multP : idx === 1 ? multA : multN;
                const setMult = idx === 0 ? setMultP : idx === 1 ? setMultA : setMultN;
                return (
                    <div key={axis} className="mb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{axis}</span>
                            <div className="flex items-center space-x-1">
                                <Button size="icon" variant="outline" onClick={() => setter(String((parseFloat(val) || 0) - (parseFloat(mult) || 0)))}>-</Button>
                                <Input type="number" value={val} onChange={(e) => setter(e.target.value)} className="w-16" />
                                <Button size="icon" variant="outline" onClick={() => setter(String((parseFloat(val) || 0) + (parseFloat(mult) || 0)))}>+</Button>
                                <Input type="number" value={mult} onChange={(e) => setMult(e.target.value)} className="w-12 ml-2" />
                            </div>
                        </div>
                        <Slider
                            value={[parseFloat(val) || 0]}
                            onValueChange={([v]) => setter(String(v))}
                            min={-1000}
                            max={1000}
                            step={1}
                            className="mt-1"
                        />
                    </div>
                );
            })}
            <div className="text-[10px] font-semibold mt-1">|ΔV|: {dvMag.toFixed(1)} m/s</div>
        </div>
    );
}

DeltaVSection.propTypes = {
    vx: PropTypes.string.isRequired,
    vy: PropTypes.string.isRequired,
    vz: PropTypes.string.isRequired,
    setVx: PropTypes.func.isRequired,
    setVy: PropTypes.func.isRequired,
    setVz: PropTypes.func.isRequired,
    multP: PropTypes.string.isRequired,
    multA: PropTypes.string.isRequired,
    multN: PropTypes.string.isRequired,
    setMultP: PropTypes.func.isRequired,
    setMultA: PropTypes.func.isRequired,
    setMultN: PropTypes.func.isRequired,
    dvMag: PropTypes.number.isRequired
}; 