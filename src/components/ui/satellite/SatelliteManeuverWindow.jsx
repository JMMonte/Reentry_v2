import React from 'react';
import { DraggableModal } from '../modal/DraggableModal';
import { Button } from '../button';
import PropTypes from 'prop-types';
import { ManeuverNodeList } from './ManeuverNodeList.jsx';
import { ExecutionTimeSection } from './ExecutionTimeSection.jsx';
import { DeltaVSection } from './DeltaVSection.jsx';
import { useManeuverWindow } from './useManeuverWindow.jsx';

export function SatelliteManeuverWindow({ satellite, onClose }) {
    const {
        currentSimTime,
        simTime,
        timeMode, setTimeMode,
        offsetSec, setOffsetSec,
        hours, setHours,
        minutes, setMinutes,
        seconds, setSeconds,
        milliseconds, setMilliseconds,
        multOffset, setMultOffset,
        multH, setMultH,
        multMin, setMultMin,
        multSVal, setMultSVal,
        multMsVal, setMultMsVal,
        vx, setVx,
        vy, setVy,
        vz, setVz,
        multP, setMultP,
        multA, setMultA,
        multN, setMultN,
        dvMag,
        nodes, selectedIndex, setSelectedIndex,
        formatTimeDelta,
        handleSave, handleDelete
    } = useManeuverWindow(satellite);

    // All state, effects, and handlers are managed by useManeuverWindow hook

    return (
        <DraggableModal className="text-[10px]"
            title={`Maneuvers — ${satellite.name || `Satellite ${satellite.id}`}`}
            isOpen={true}
            onClose={onClose}
            defaultPosition={{ x: 20, y: 80 }}
            resizable={true}
            defaultWidth={500}
            defaultHeight={400}
            minWidth={350}
            minHeight={200}
        >
            <div className="flex h-full">
                <div className="w-1/3 border-r p-2 overflow-auto">
                    <ManeuverNodeList
                        nodes={nodes}
                        selectedIndex={selectedIndex}
                        onSelect={setSelectedIndex}
                        onNew={() => setSelectedIndex(null)}
                        currentSimTime={currentSimTime}
                        formatTimeDelta={formatTimeDelta}
                    />
                </div>
                <div className="w-2/3 p-2">
                    <ExecutionTimeSection
                        simTime={simTime}
                        timeMode={timeMode}
                        setTimeMode={setTimeMode}
                        offsetSec={offsetSec}
                        setOffsetSec={setOffsetSec}
                        hours={hours}
                        setHours={setHours}
                        minutes={minutes}
                        setMinutes={setMinutes}
                        seconds={seconds}
                        setSeconds={setSeconds}
                        milliseconds={milliseconds}
                        setMilliseconds={setMilliseconds}
                        multOffset={multOffset}
                        setMultOffset={setMultOffset}
                        multH={multH}
                        setMultH={setMultH}
                        multMin={multMin}
                        setMultMin={setMultMin}
                        multSVal={multSVal}
                        setMultSVal={setMultSVal}
                        multMsVal={multMsVal}
                        setMultMsVal={setMultMsVal}
                    />
                    <DeltaVSection
                        vx={vx}
                        vy={vy}
                        vz={vz}
                        setVx={setVx}
                        setVy={setVy}
                        setVz={setVz}
                        multP={multP}
                        multA={multA}
                        multN={multN}
                        setMultP={setMultP}
                        setMultA={setMultA}
                        setMultN={setMultN}
                        dvMag={dvMag}
                    />
                    <div className="mt-4 flex justify-end space-x-2">
                        {selectedIndex !== null && (
                            <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
                        )}
                        <Button size="sm" onClick={handleSave}>{selectedIndex !== null ? 'Update' : 'Add'}</Button>
                        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
                    </div>
                </div>
            </div>
        </DraggableModal>
    );
}

SatelliteManeuverWindow.propTypes = {
    satellite: PropTypes.object.isRequired,
    onClose: PropTypes.func
}; 