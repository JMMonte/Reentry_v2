import React from 'react';
import { DraggableModal } from '../modal/DraggableModal';
import { Button } from '../button';
import PropTypes from 'prop-types';
import { ManeuverNodeList } from './ManeuverNodeList.jsx';
import { ExecutionTimeSection } from './ExecutionTimeSection.jsx';
import { DeltaVSection } from './DeltaVSection.jsx';
import { useManeuverWindow } from './useManeuverWindow.jsx';
import { Input } from '../input';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuItem
} from '../dropdown-menu';

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
        handleSave, handleDelete,
        maneuverMode, setManeuverMode,
        shapeType, setShapeType,
        presets, selectedPreset, setSelectedPreset,
        customRadiusKm, setCustomRadiusKm,
        ellPeriKm, setEllPeriKm,
        ellApoKm, setEllApoKm,
        planeChangeDeg, setPlaneChangeDeg,
        generateHohmann,
        hohmannDetails,
        ellipticalPresets, selectedEllPreset, setSelectedEllPreset,
        computeMoonTransferDetails
    } = useManeuverWindow(satellite);

    // All state, effects, and handlers are managed by useManeuverWindow hook

    return (
        <DraggableModal
            className="text-[10px]"
            title={
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                        Maneuvers — {satellite.name || `Satellite ${satellite.id}`}
                    </span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">{maneuverMode === 'manual' ? 'Manual' : 'Hohmann'}</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent sideOffset={4}>
                            <DropdownMenuRadioGroup value={maneuverMode} onValueChange={setManeuverMode}>
                                <DropdownMenuRadioItem inset value="manual">Manual</DropdownMenuRadioItem>
                                {selectedIndex === null && (
                                    <DropdownMenuRadioItem inset value="hohmann">Hohmann Transfer</DropdownMenuRadioItem>
                                )}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            }
            isOpen={true}
            onClose={onClose}
            defaultPosition={{ x: 20, y: 80 }}
            resizable={true}
            defaultWidth={500}
            defaultHeight={470}
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
                    {maneuverMode === 'manual' ? (
                        <>
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
                        </>
                    ) : (
                        <> {/* Hohmann transfer UI */}
                            {/* Shape selection */}
                            <div className="mb-2">
                                <span className="text-sm font-medium">Orbit Shape:</span>
                                <div className="flex space-x-4 mt-1">
                                    {['circular', 'elliptical', 'moon'].map(type => (
                                        <label key={type} className="flex items-center space-x-1">
                                            <input
                                                type="radio"
                                                value={type}
                                                checked={shapeType === type}
                                                onChange={() => setShapeType(type)}
                                            />
                                            <span className="text-sm capitalize">{type}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {/* Circular shape controls */}
                            {shapeType === 'circular' && (
                                <div className="mb-2 flex items-center space-x-2">
                                    <span className="text-sm font-medium">Circular Target:</span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="sm">
                                                {presets.find(p => p.altitude === selectedPreset)?.name}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent sideOffset={4}>
                                            {presets.map(p => (
                                                <DropdownMenuItem
                                                    key={p.altitude}
                                                    onSelect={() => setSelectedPreset(p.altitude)}
                                                >
                                                    {p.name}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Input
                                        type="number"
                                        placeholder="km"
                                        value={customRadiusKm}
                                        onChange={e => setCustomRadiusKm(e.target.value)}
                                        className="w-20"
                                    />
                                </div>
                            )}
                            {/* Elliptical shape controls */}
                            {shapeType === 'elliptical' && (
                                <>
                                    <div className="mb-2 flex items-center space-x-2">
                                        <span className="text-sm font-medium">Elliptical Preset:</span>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="sm">{selectedEllPreset.name}</Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent sideOffset={4}>
                                                {ellipticalPresets.map(p => (
                                                    <DropdownMenuItem key={p.name} onSelect={() => {
                                                        setSelectedEllPreset(p);
                                                        setEllPeriKm(p.periapsis);
                                                        setEllApoKm(p.apoapsis);
                                                    }}>
                                                        {p.name}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-sm font-medium">Periapsis (km):</span>
                                        <Input
                                            type="number"
                                            value={ellPeriKm}
                                            onChange={e => setEllPeriKm(e.target.value)}
                                            className="w-20"
                                        />
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-sm font-medium">Apoapsis (km):</span>
                                        <Input
                                            type="number"
                                            value={ellApoKm}
                                            onChange={e => setEllApoKm(e.target.value)}
                                            className="w-20"
                                        />
                                    </div>
                                </>
                            )}
                            {/* Plane change */}
                            <div className="mb-2 flex items-center space-x-2">
                                <span className="text-sm font-medium">Plane ΔV (deg):</span>
                                <Input
                                    type="number"
                                    value={planeChangeDeg}
                                    onChange={e => setPlaneChangeDeg(e.target.value)}
                                    className="w-16"
                                />
                            </div>
                            {/* Moon shape has no extra inputs */}
                            {hohmannDetails && (() => {
                                const {
                                    dv1, dv2, dv_plane, transferTime, time1, time2,
                                    totalDv, dt1Sec, dt2Sec
                                } = hohmannDetails;
                                return (
                                    <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900 dark:text-blue-200 rounded text-sm">
                                        <div className="flex items-center justify-between">
                                            <div className="font-semibold mb-2">Hohmann Transfer Plan</div>
                                            <span className="text-gray-500 dark:text-gray-400 text-xs italic" title="A Hohmann transfer is a two-impulse orbital maneuver to change circular orbits. It burns to raise apogee, coasts to apogee, then burns to circularize.">?</span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">This 2-burn maneuver raises the apogee to match the target altitude, then circularizes at apogee for an efficient orbit change.</p>
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-blue-100 dark:bg-blue-800">
                                                    <th className="p-1 text-left">Step</th>
                                                    <th className="p-1 text-left">Countdown</th>
                                                    <th className="p-1 text-left">Time (UTC)</th>
                                                    <th className="p-1 text-left">ΔV (m/s)</th>
                                                    <th className="p-1 text-left">Notes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td className="p-1">Burn 1</td>
                                                    <td className="p-1" title={time1.toISOString()}>{formatTimeDelta(dt1Sec * 1000)}</td>
                                                    <td className="p-1"><em>{time1.toISOString()}</em></td>
                                                    <td className="p-1">{dv1.toFixed(2)} (<small>+{dv_plane.toFixed(2)} plane</small>)</td>
                                                    <td className="p-1">Boost prograde & plane change</td>
                                                </tr>
                                                {shapeType !== 'moon' && (
                                                    <tr>
                                                        <td className="p-1">Coast</td>
                                                        <td className="p-1">{formatTimeDelta(transferTime * 1000)}</td>
                                                        <td className="p-1">—</td>
                                                        <td className="p-1">—</td>
                                                        <td className="p-1">Transfer to apogee</td>
                                                    </tr>
                                                )}
                                                {shapeType !== 'moon' && (
                                                    <tr>
                                                        <td className="p-1">Burn 2</td>
                                                        <td className="p-1" title={time2.toISOString()}>{formatTimeDelta(dt2Sec * 1000)}</td>
                                                        <td className="p-1"><em>{time2.toISOString()}</em></td>
                                                        <td className="p-1">{dv2.toFixed(2)}</td>
                                                        <td className="p-1">Circularize orbit</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                        <div className="mt-2">Total ΔV required: <strong>{totalDv.toFixed(2)} m/s</strong></div>
                                    </div>
                                );
                            })()}
                            <div className="mt-4 flex justify-end space-x-2">
                                {shapeType === 'moon' && (
                                    <Button size="sm" variant="outline" onClick={computeMoonTransferDetails}>Compute Details</Button>
                                )}
                                <Button size="sm" onClick={generateHohmann}>Generate</Button>
                                <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </DraggableModal>
    );
}

SatelliteManeuverWindow.propTypes = {
    satellite: PropTypes.object.isRequired,
    onClose: PropTypes.func
}; 