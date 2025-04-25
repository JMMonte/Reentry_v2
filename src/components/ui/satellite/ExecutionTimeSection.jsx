import React from 'react';
import PropTypes from 'prop-types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs';
import { Input } from '../input';
import { Button } from '../button';

export function ExecutionTimeSection({
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
    return (
        <div className="mb-2">
            <Tabs value={timeMode} onValueChange={setTimeMode}>
                <div className="flex items-center space-x-2 mb-1 text-[10px] text-muted-foreground">
                    <TabsList className="space-x-1">
                        <TabsTrigger value="offset">Offset (s)</TabsTrigger>
                        <TabsTrigger value="datetime">Date/Time</TabsTrigger>
                        <TabsTrigger value="nextPeriapsis">Next Periapsis</TabsTrigger>
                        <TabsTrigger value="nextApoapsis">Next Apoapsis</TabsTrigger>
                    </TabsList>
                </div>
                <TabsContent value="offset">
                    <div className="flex items-center space-x-1">
                        <Button size="icon" variant="outline" onClick={() => setOffsetSec(String((parseFloat(offsetSec) || 0) - (parseFloat(multOffset) || 0)))}>-</Button>
                        <Input type="number" value={offsetSec} onChange={(e) => setOffsetSec(e.target.value)} className="w-20" />
                        <Button size="icon" variant="outline" onClick={() => setOffsetSec(String((parseFloat(offsetSec) || 0) + (parseFloat(multOffset) || 0)))}>+</Button>
                        <Input type="number" value={multOffset} onChange={(e) => setMultOffset(e.target.value)} className="w-12" />
                        <span className="text-[10px]">s</span>
                    </div>
                    <div className="text-[10px] mt-1">
                        Executes at: {new Date(simTime.getTime() + (parseFloat(offsetSec) || 0) * 1000).toISOString()}
                    </div>
                </TabsContent>
                <TabsContent value="datetime">
                    {[
                        { label: 'HH', val: hours, setter: setHours, mult: multH, setMult: setMultH, min: 0, max: 23 },
                        { label: 'MM', val: minutes, setter: setMinutes, mult: multMin, setMult: setMultMin, min: 0, max: 59 },
                        { label: 'SS', val: seconds, setter: setSeconds, mult: multSVal, setMult: setMultSVal, min: 0, max: 59 },
                        { label: 'MS', val: milliseconds, setter: setMilliseconds, mult: multMsVal, setMult: setMultMsVal, min: 0, max: 999 },
                    ].map(({ label, val, setter, mult, setMult, min, max }) => (
                        <div key={label} className="flex items-center space-x-3 text-[10px]">
                            <span>{label}</span>
                            <Button size="icon" variant="outline" onClick={() => { const n = (parseInt(val) || 0) - (parseInt(mult) || 0); setter(Math.max(min, Math.min(max, n))); }}>-</Button>
                            <Input
                                type="number"
                                value={String(val).padStart(label === 'MS' ? 3 : 2, '0')}
                                onChange={(e) => { let n = parseInt(e.target.value) || 0; n = Math.max(min, Math.min(max, n)); setter(n); }}
                                className="w-[5ch]"
                                min={min}
                                max={max}
                            />
                            <Button size="icon" variant="outline" onClick={() => { const n = (parseInt(val) || 0) + (parseInt(mult) || 0); setter(Math.max(min, Math.min(max, n))); }}>+</Button>
                            <Input type="number" value={mult} onChange={(e) => setMult(e.target.value)} className="w-16" />
                        </div>
                    ))}
                </TabsContent>
                <TabsContent value="nextPeriapsis">
                    <div className="text-[10px]">
                        Executes at next periapsis: {computeNextPeriapsis().toISOString()}
                    </div>
                </TabsContent>
                <TabsContent value="nextApoapsis">
                    <div className="text-[10px]">
                        Executes at next apoapsis: {computeNextApoapsis().toISOString()}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

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