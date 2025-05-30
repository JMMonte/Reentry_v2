import React, { useRef, useState } from 'react';
import { DraggableModal } from '../modal/DraggableModal';
import { Button } from '../button';
import PropTypes from 'prop-types';
import { ExecutionTimeSection } from './ExecutionTimeSection.jsx';
import { DeltaVSection } from './DeltaVSection.jsx';
import { useManeuverWindow } from './useManeuverWindow.jsx';
import HohmannSection from './HohmannSection.jsx';
import MissionPlanSection from './MissionPlanSection.jsx';

export function SatelliteManeuverWindow({ satellite, onClose }) {
    const {
        currentSimTime,
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
        targetSmaKm, setTargetSmaKm,
        targetEcc, setTargetEcc,
        targetIncDeg, setTargetIncDeg,
        targetLANDeg, setTargetLANDeg,
        targetArgPDeg, setTargetArgPDeg,
        generateHohmann,
        isAdding, setIsAdding,
        computeNextPeriapsis,
        computeNextApoapsis,
        manualBurnTime, setManualBurnTime,
        findBestBurnTime,
        findNextPeriapsis,
        findNextApoapsis,
        timeUtils
    } = useManeuverWindow(satellite);
    
    // Show loading state if timeUtils is not available yet
    if (!timeUtils) {
        return (
            <DraggableModal
                title={`Maneuver Planning - ${satellite.name}`}
                onClose={onClose}
                initialPosition={{ x: window.innerWidth - 580, y: 100 }}
                width={560}
                height={400}
                resizable={false}
            >
                <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">Loading simulation data...</p>
                </div>
            </DraggableModal>
        );
    }

    // Resizable mission plan state
    const [missionPlanHeight, setMissionPlanHeight] = useState(180); // px
    const draggingRef = useRef(false);

    // Mouse event handlers for resizing
    const onDragStart = (e) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = 'row-resize';
    };
    const onDrag = (e) => {
        if (!draggingRef.current) return;
        // Get the bounding rect of the modal content
        const modalRect = e.target.closest('.modal-content')?.getBoundingClientRect();
        if (modalRect) {
            // Calculate new height from mouse position relative to modal bottom
            const y = e.clientY - modalRect.top;
            const minHeight = 100;
            const maxHeight = modalRect.height - 100;
            setMissionPlanHeight(Math.max(minHeight, Math.min(maxHeight, modalRect.height - y)));
        }
    };
    const onDragEnd = () => {
        draggingRef.current = false;
        document.body.style.cursor = '';
    };
    React.useEffect(() => {
        if (!draggingRef.current) return;
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', onDragEnd);
        return () => {
            window.removeEventListener('mousemove', onDrag);
            window.removeEventListener('mouseup', onDragEnd);
        };
    });

    // Handler for selecting an existing node
    const handleSelectNode = (index) => {
        setSelectedIndex(index);
        setIsAdding(false); // Ensure we are not in 'adding' mode when selecting existing
    };

    // Handler for clicking the '+' button
    const handleAddNewNode = () => {
        setSelectedIndex(null);
        setIsAdding(true);
    };

    // Handler for clicking the 'Maneuver Wizard' button
    const handleWizardClick = () => {
        setSelectedIndex(null);
        setIsAdding(false);
        setManeuverMode('hohmann');
    };

    // All state, effects, and handlers are managed by useManeuverWindow hook

    return (
        <DraggableModal
            className="text-[10px]"
            title={
                <div>
                    <span className="text-sm font-medium">
                        Maneuvers — {satellite.name || `Satellite ${satellite.id}`}
                    </span>
                </div>
            }
            isOpen={true}
            onClose={onClose}
            defaultPosition={{ x: 20, y: 56 }}
            resizable={true}
            defaultWidth={500}
            defaultHeight="calc(100vh - 88px)"
            minWidth={350}
            minHeight={200}
            maxHeight="calc(100vh - 88px)"
        >
            {/* Main layout: Vertical flex */}
            <div className="flex flex-col h-full">
                {/* Top row: Only the detail pane now - Make it scrollable */}
                <div className="flex-1 overflow-y-auto p-2" style={{ minHeight: 0, maxHeight: `calc(100% - ${missionPlanHeight}px)` }}>
                    {/* Right Pane: Manual or Hohmann UI (takes full width) */}
                    {maneuverMode === 'manual' ? (
                        isAdding || selectedIndex !== null ? (
                            <>
                                {/* Buttons moved to the top */}
                                <div className="mb-4 flex justify-end space-x-2">
                                    {selectedIndex !== null && (
                                        <Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
                                    )}
                                    <Button size="sm" onClick={handleSave}>{isAdding ? 'Add' : 'Update'}</Button>
                                    <Button variant="secondary" size="sm" onClick={() => { setSelectedIndex(null); setIsAdding(false); }}>Clear</Button>
                                </div>
                                
                                <ExecutionTimeSection
                                    simTime={currentSimTime}
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
                                    computeNextPeriapsis={computeNextPeriapsis}
                                    computeNextApoapsis={computeNextApoapsis}
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
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                Select a maneuver from the plan below to edit or click &apos;Add Manual Maneuver&apos;.
                            </div>
                        )
                    ) : (
                        <HohmannSection
                            targetSmaKm={targetSmaKm}
                            setTargetSmaKm={setTargetSmaKm}
                            targetEcc={targetEcc}
                            setTargetEcc={setTargetEcc}
                            targetIncDeg={targetIncDeg}
                            setTargetIncDeg={setTargetIncDeg}
                            targetLANDeg={targetLANDeg}
                            setTargetLANDeg={setTargetLANDeg}
                            targetArgPDeg={targetArgPDeg}
                            setTargetArgPDeg={setTargetArgPDeg}
                            manualBurnTime={manualBurnTime}
                            setManualBurnTime={setManualBurnTime}
                            findBestBurnTime={findBestBurnTime}
                            findNextPeriapsis={findNextPeriapsis}
                            findNextApoapsis={findNextApoapsis}
                            generateHohmann={generateHohmann}
                            onCancel={() => setManeuverMode('manual')}
                            onComplete={() => setManeuverMode('manual')}
                        />
                    )}
                </div>
                
                {/* Resizable Divider */}
                <div
                    className="w-full h-2 cursor-row-resize bg-transparent flex items-center justify-center select-none"
                    onMouseDown={onDragStart}
                >
                    <div className="w-24 h-1 rounded bg-muted-foreground/30 hover:bg-muted-foreground/60 transition-colors" />
                </div>
                {/* Bottom Section: Mission Plan */}
                <div
                    className="border-t p-2 overflow-auto bg-background"
                    style={{ height: missionPlanHeight, minHeight: 80 }}
                >
                    <MissionPlanSection
                        nodes={nodes}
                        previewNodes={satellite.app3d.previewNodes || (satellite.app3d.previewNode ? [satellite.app3d.previewNode] : [])}
                        selectedIndex={selectedIndex}
                        maneuverMode={maneuverMode}
                        formatTimeDelta={formatTimeDelta}
                        onSelectNode={handleSelectNode}
                        onDeleteNode={handleDelete}
                        onAddNewNode={handleAddNewNode}
                        onWizardClick={handleWizardClick}
                        currentSimTime={currentSimTime}
                    />
                </div>
            </div>
        </DraggableModal>
    );
}

SatelliteManeuverWindow.propTypes = {
    satellite: PropTypes.object.isRequired,
    onClose: PropTypes.func
}; 