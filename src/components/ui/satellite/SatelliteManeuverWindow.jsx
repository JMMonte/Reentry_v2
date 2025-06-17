import React, { useRef, useState, useMemo, useCallback } from 'react';
import { DraggableModal } from '../modal/DraggableModal';
import { Button } from '../button';
import PropTypes from 'prop-types';
import { ExecutionTimeSection } from './ExecutionTimeSection.jsx';
import { DeltaVSection } from './DeltaVSection.jsx';
import HohmannSection from './HohmannSection.jsx';
import MissionPlanSection from './MissionPlanSection.jsx';
import ManeuverErrorBoundary from './ManeuverErrorBoundary.jsx';
import { useManeuverSystem } from '@/hooks/useManeuverSystem';
import { formatTimeDelta } from '@/utils/FormatUtils';

// Main component with comprehensive memoization
export const SatelliteManeuverWindow = React.memo(function SatelliteManeuverWindow({ satellite, onClose }) {
    // Cache expensive calculations and prevent churn
    const lastSatelliteIdRef = useRef(satellite?.id);
    const componentStateRef = useRef({});
    const draggingRef = useRef(false);

    // Use the new consolidated maneuver system
    const {
        state,
        updateState,
        isValidSatellite,
        maneuverNodes,
        maneuverAnalysis,
        hohmannPreview,
        executionTime,
        deltaVMagnitude,
        getNextPeriapsisTime,
        getNextApoapsisTime,
        actions
    } = useManeuverSystem(satellite);

    // Satellite validation and early return
    const satelliteValidation = useMemo(() => {
        const isValid = !!satellite && !!satellite.id && isValidSatellite;
        
        if (!isValid) {
            return {
                isValid: false,
                errorMessage: "Invalid satellite data. Please ensure the satellite is properly loaded with position, velocity, and central body data."
            };
        }

        // Cache satellite ID change detection
        if (lastSatelliteIdRef.current !== satellite.id) {
            lastSatelliteIdRef.current = satellite.id;
            componentStateRef.current = {}; // Clear cache on satellite change
        }

        return {
            isValid: true,
            satelliteInfo: {
                id: satellite.id,
                name: satellite.name || `Satellite ${satellite.id}`
            }
        };
    }, [satellite, isValidSatellite]);

    // Early return for invalid satellite with helpful error message
    if (!satelliteValidation.isValid) {
        return (
            <DraggableModal
                title="Maneuver Planning - Error"
                isOpen={true}
                onClose={onClose}
                defaultPosition={{ x: 20, y: 56 }}
                defaultWidth={400}
                defaultHeight={200}
            >
                <div className="p-4 text-center text-muted-foreground">
                    <p>Invalid satellite data.</p>
                    <p className="text-sm mt-2">
                        {satelliteValidation.errorMessage}
                    </p>
                </div>
            </DraggableModal>
        );
    }

    // Window close handler
    const handleClose = useCallback(() => {
        actions.cancel();
        onClose();
    }, [actions, onClose]);

    // Resizable mission plan state
    const [missionPlanHeight, setMissionPlanHeight] = useState(180);

    // Resize handlers to prevent recreation
    const resizeHandlers = useMemo(() => ({
        onDragStart: (e) => {
            e.preventDefault();
            draggingRef.current = true;
            document.body.style.cursor = 'row-resize';
        },
        onDrag: (e) => {
            if (!draggingRef.current) return;
            const modalRect = e.target.closest('.modal-content')?.getBoundingClientRect();
            if (modalRect) {
                const y = e.clientY - modalRect.top;
                const minHeight = 100;
                const maxHeight = modalRect.height - 100;
                setMissionPlanHeight(Math.max(minHeight, Math.min(maxHeight, modalRect.height - y)));
            }
        },
        onDragEnd: () => {
            draggingRef.current = false;
            document.body.style.cursor = '';
        }
    }), []);

    // Effect dependency for resize events
    const resizeEffect = useMemo(() => ({
        handlers: resizeHandlers,
        isActive: draggingRef.current
    }), [resizeHandlers]);

    // Set up resize event listeners (memoized)
    React.useEffect(() => {
        if (!resizeEffect.isActive) return;
        
        const { onDrag, onDragEnd } = resizeEffect.handlers;
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', onDragEnd);
        
        return () => {
            window.removeEventListener('mousemove', onDrag);
            window.removeEventListener('mouseup', onDragEnd);
        };
    }, [resizeEffect]);

    // Primary action handlers for better performance
    const primaryHandlers = useMemo(() => ({
        selectNode: (index) => actions.selectNode(index),
        addNewNode: () => actions.startAdding(),
        deleteNode: (index) => actions.deleteNode(index),
        wizardClick: () => updateState({ maneuverMode: 'hohmann' }),
        save: () => {
            const result = actions.addManualManeuver();
            if (result) {
                actions.cancel(); // Reset UI state after successful save
            }
        },
        cancel: () => actions.cancel(),
        generateHohmann: () => {
            const result = actions.generateHohmannTransfer();
            if (result) {
                console.log('[SatelliteManeuverWindow] Hohmann transfer generated:', result);
            }
        }
    }), [actions, updateState]);

    // Input handlers with change detection to prevent unnecessary re-renders
    const inputHandlers = useMemo(() => {
        // Create a stable cache key for the current state
        const stateKey = JSON.stringify({
            deltaV: state.deltaV,
            timeMode: state.timeMode,
            offsetSec: state.offsetSec,
            hours: state.hours,
            minutes: state.minutes,
            seconds: state.seconds,
            milliseconds: state.milliseconds
        });

        // Use cached handlers if state hasn't changed
        if (componentStateRef.current.stateKey === stateKey && componentStateRef.current.inputHandlers) {
            return componentStateRef.current.inputHandlers;
        }

        const handlers = {
            // Time mode handlers
            setTimeMode: (mode) => updateState({ timeMode: mode }),
            setOffsetSec: (value) => updateState({ offsetSec: value }),
            setHours: (value) => updateState({ hours: value }),
            setMinutes: (value) => updateState({ minutes: value }),
            setSeconds: (value) => updateState({ seconds: value }),
            setMilliseconds: (value) => updateState({ milliseconds: value }),
            
            // Multiplier handlers for time controls
            setMultOffset: (value) => updateState({ multOffset: value }),
            setMultH: (value) => updateState({ multH: value }),
            setMultMin: (value) => updateState({ multMin: value }),
            setMultSVal: (value) => updateState({ multSVal: value }),
            setMultMsVal: (value) => updateState({ multMsVal: value }),
            
            // Multiplier handlers for delta-V controls
            setMultP: (value) => updateState({ multP: value }),
            setMultA: (value) => updateState({ multA: value }),
            setMultN: (value) => updateState({ multN: value }),
            
            // Delta-V handlers
            setVx: (value) => updateState({ deltaV: { ...state.deltaV, prograde: value } }),
            setVy: (value) => updateState({ deltaV: { ...state.deltaV, normal: value } }),
            setVz: (value) => updateState({ deltaV: { ...state.deltaV, radial: value } }),
            
            // Hohmann transfer handlers
            setTargetSemiMajorAxis: (value) => updateState({ targetSemiMajorAxis: value }),
            setTargetEccentricity: (value) => updateState({ targetEccentricity: value }),
            setTargetInclination: (value) => updateState({ targetInclination: value }),
            setTargetLAN: (value) => updateState({ targetLAN: value }),
            setTargetArgP: (value) => updateState({ targetArgP: value }),
            
            // Optimal time setters (state updaters, not called during render)
            setToNextPeriapsis: () => actions.setTimeToNextPeriapsis(),
            setToNextApoapsis: () => actions.setTimeToNextApoapsis()
        };

        // Cache the handlers
        componentStateRef.current.stateKey = stateKey;
        componentStateRef.current.inputHandlers = handlers;

        return handlers;
    }, [updateState, state.deltaV, state.timeMode, state.offsetSec, state.hours, state.minutes, state.seconds, state.milliseconds, actions]);

    // Modal title to prevent recreation
    const modalTitle = useMemo(() => (
        <div>
            <span className="text-sm font-medium">
                Maneuvers — {satelliteValidation.satelliteInfo.name}
            </span>
        </div>
    ), [satelliteValidation.satelliteInfo.name]);

    // Section rendering conditions
    const sectionConditions = useMemo(() => ({
        isManualMode: state.maneuverMode === 'manual',
        isAddingOrEditing: state.isAdding || state.selectedIndex !== null,
        showExecutionTime: state.maneuverMode === 'manual' && (state.isAdding || state.selectedIndex !== null),
        showDeltaV: state.maneuverMode === 'manual' && (state.isAdding || state.selectedIndex !== null),
        showHohmann: state.maneuverMode === 'hohmann'
    }), [state.maneuverMode, state.isAdding, state.selectedIndex]);

    // Action buttons based on current state
    const actionButtons = useMemo(() => {
        if (!sectionConditions.isAddingOrEditing) return null;

        return (
            <div className="mb-4 flex justify-end space-x-2">
                {state.selectedIndex !== null && (
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => primaryHandlers.deleteNode(state.selectedIndex)}
                    >
                        Delete
                    </Button>
                )}
                <Button size="sm" onClick={primaryHandlers.save}>
                    {state.isAdding ? 'Add' : 'Update'}
                </Button>
                <Button variant="secondary" size="sm" onClick={primaryHandlers.cancel}>
                    Clear
                </Button>
            </div>
        );
    }, [sectionConditions.isAddingOrEditing, state.selectedIndex, state.isAdding, primaryHandlers]);

    return (
        <DraggableModal
            className="text-[10px]"
            title={modalTitle}
            isOpen={true}
            onClose={handleClose}
            defaultPosition={{ x: 20, y: 56 }}
            resizable={true}
            defaultWidth={500}
            defaultHeight="calc(100vh - 88px)"
            minWidth={350}
            minHeight={200}
            maxHeight="calc(100vh - 88px)"
        >
            <ManeuverErrorBoundary onClose={handleClose}>
                <div className="flex flex-col h-full">
                    {/* Top section: Maneuver details */}
                    <div className="flex-1 overflow-y-auto p-2" style={{ minHeight: 0, maxHeight: `calc(100% - ${missionPlanHeight}px)` }}>
                        {sectionConditions.isManualMode ? (
                            sectionConditions.isAddingOrEditing ? (
                                <>
                                    {/* Action buttons */}
                                    {actionButtons}
                                    
                                    {/* Execution time section */}
                                    {sectionConditions.showExecutionTime && (
                                        <ExecutionTimeSection
                                            simTime={executionTime}
                                            timeMode={state.timeMode}
                                            setTimeMode={inputHandlers.setTimeMode}
                                            offsetSec={state.offsetSec}
                                            setOffsetSec={inputHandlers.setOffsetSec}
                                            hours={state.hours}
                                            setHours={inputHandlers.setHours}
                                            minutes={state.minutes}
                                            setMinutes={inputHandlers.setMinutes}
                                            seconds={state.seconds}
                                            setSeconds={inputHandlers.setSeconds}
                                            milliseconds={state.milliseconds}
                                            setMilliseconds={inputHandlers.setMilliseconds}
                                            multOffset={state.multOffset}
                                            setMultOffset={inputHandlers.setMultOffset}
                                            multH={state.multH}
                                            setMultH={inputHandlers.setMultH}
                                            multMin={state.multMin}
                                            setMultMin={inputHandlers.setMultMin}
                                            multSVal={state.multSVal}
                                            setMultSVal={inputHandlers.setMultSVal}
                                            multMsVal={state.multMsVal}
                                            setMultMsVal={inputHandlers.setMultMsVal}
                                            computeNextPeriapsis={getNextPeriapsisTime}
                                            computeNextApoapsis={getNextApoapsisTime}
                                        />
                                    )}
                                    
                                    {/* Delta-V section */}
                                    {sectionConditions.showDeltaV && (
                                        <DeltaVSection
                                            vx={state.deltaV.prograde}
                                            vy={state.deltaV.normal}
                                            vz={state.deltaV.radial}
                                            setVx={inputHandlers.setVx}
                                            setVy={inputHandlers.setVy}
                                            setVz={inputHandlers.setVz}
                                            multP={state.multP}
                                            multA={state.multA}
                                            multN={state.multN}
                                            setMultP={inputHandlers.setMultP}
                                            setMultA={inputHandlers.setMultA}
                                            setMultN={inputHandlers.setMultN}
                                            deltaVMagnitude={deltaVMagnitude}
                                            maneuverAnalysis={maneuverAnalysis}
                                        />
                                    )}
                                </>
                            ) : (
                                <div className="text-center text-muted-foreground py-8">
                                    <p>Select a maneuver node to edit, or create a new one.</p>
                                </div>
                            )
                        ) : sectionConditions.showHohmann ? (
                            <HohmannSection
                                targetSemiMajorAxis={state.targetSemiMajorAxis}
                                targetEccentricity={state.targetEccentricity}
                                targetInclination={state.targetInclination}
                                targetLAN={state.targetLAN}
                                targetArgP={state.targetArgP}
                                setTargetSemiMajorAxis={inputHandlers.setTargetSemiMajorAxis}
                                setTargetEccentricity={inputHandlers.setTargetEccentricity}
                                setTargetInclination={inputHandlers.setTargetInclination}
                                setTargetLAN={inputHandlers.setTargetLAN}
                                setTargetArgP={inputHandlers.setTargetArgP}
                                onGenerate={primaryHandlers.generateHohmann}
                                onBackToManual={() => updateState({ maneuverMode: 'manual' })}
                                preview={hohmannPreview}
                            />
                        ) : null}
                    </div>
                    
                    {/* Resize handle */}
                    <div 
                        className="h-1 bg-gray-300 hover:bg-gray-400 cursor-row-resize flex-shrink-0"
                        onMouseDown={resizeHandlers.onDragStart}
                    />
                    
                    {/* Bottom section: Mission plan */}
                    <div className="overflow-y-auto p-2" style={{ height: `${missionPlanHeight}px`, minHeight: '100px' }}>
                        <MissionPlanSection
                            nodes={maneuverNodes}
                            previewNodes={hohmannPreview}
                            selectedIndex={state.selectedIndex}
                            maneuverMode={state.maneuverMode}
                            formatTimeDelta={formatTimeDelta}
                            onSelectNode={primaryHandlers.selectNode}
                            onDeleteNode={primaryHandlers.deleteNode}
                            onAddNewNode={primaryHandlers.addNewNode}
                            onWizardClick={primaryHandlers.wizardClick}
                            currentSimTime={executionTime}
                        />
                    </div>
                </div>
            </ManeuverErrorBoundary>
        </DraggableModal>
    );
}, (prevProps, nextProps) => {
    // Custom comparison: Prevent re-renders on satellite ID change only
    return (
        prevProps.satellite?.id === nextProps.satellite?.id &&
        prevProps.onClose === nextProps.onClose
    );
});

SatelliteManeuverWindow.propTypes = {
    satellite: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        name: PropTypes.string
    }).isRequired,
    onClose: PropTypes.func.isRequired
};

export default SatelliteManeuverWindow; 