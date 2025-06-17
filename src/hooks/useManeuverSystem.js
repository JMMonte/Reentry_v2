import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useSimulation } from '../simulation/SimulationContext';

/**
 * Optimized maneuver system hook with proper memoization and physics engine integration
 * Replaces the old useManeuverWindow with cleaner architecture
 */
export function useManeuverSystem(satellite) {
    // Use refs for physics engine to avoid re-renders
    const physicsEngineRef = useRef(null);
    const { simulatedTime } = useSimulation();
    
    // Initialize physics engine ref
    useEffect(() => {
        if (satellite?.app3d?.physicsIntegration?.physicsEngine) {
            physicsEngineRef.current = satellite.app3d.physicsIntegration.physicsEngine;
        }
    }, [satellite?.app3d?.physicsIntegration?.physicsEngine]);

    // State management with proper initial values
    const [maneuverState, setManeuverState] = useState(() => ({
        // UI state
        isAdding: false,
        selectedIndex: null,
        maneuverMode: 'manual', // 'manual' | 'hohmann'
        
        // Manual maneuver inputs
        timeMode: 'offset',
        offsetSec: '0',
        hours: 0,
        minutes: 0,
        seconds: 0,
        milliseconds: 0,
        deltaV: { prograde: '0', normal: '0', radial: '0' },
        
        // Multiplier values for UI controls
        multOffset: '1',
        multH: '1',
        multMin: '1',
        multSVal: '1',
        multMsVal: '1',
        multP: '1',
        multA: '1',
        multN: '1',
        
        // Hohmann transfer inputs
        targetSemiMajorAxis: '6578', // 200km altitude
        targetEccentricity: '0',
        targetInclination: '28.5',
        targetLAN: '0',
        targetArgP: '0',
        
        // Results cache
        maneuverAnalysis: null,
        hohmannPreview: null,
        previewData: null
    }));

    // Memoized physics engine access
    const physicsEngine = useMemo(() => {
        return physicsEngineRef.current?.satelliteEngine;
    }, [physicsEngineRef.current]);

    // Memoized satellite validation
    const isValidSatellite = useMemo(() => {
        return satellite && 
               satellite.id && 
               satellite.position && 
               satellite.velocity && 
               satellite.centralBodyNaifId;
    }, [satellite?.id, satellite?.position, satellite?.velocity, satellite?.centralBodyNaifId]);

    // Get current maneuver nodes (memoized)
    const maneuverNodes = useMemo(() => {
        if (!isValidSatellite || !physicsEngine) return [];
        
        try {
            return physicsEngine.getManeuverNodes(satellite.id) || [];
        } catch (error) {
            console.warn('[useManeuverSystem] Error getting maneuver nodes:', error);
            return [];
        }
    }, [isValidSatellite, physicsEngine, satellite?.id, simulatedTime]); // Include simulatedTime to refresh when nodes execute

    // Calculate execution time (memoized)
    const executionTime = useMemo(() => {
        if (!simulatedTime) return new Date();
        
        const { timeMode, offsetSec, hours, minutes, seconds, milliseconds } = maneuverState;
        
        if (timeMode === 'offset') {
            const offset = parseFloat(offsetSec) * 1000;
            return new Date(simulatedTime.getTime() + offset);
        } else if (timeMode === 'datetime') {
            const targetTime = new Date(simulatedTime);
            targetTime.setUTCHours(hours, minutes, seconds, milliseconds);
            return targetTime;
        }
        
        return simulatedTime;
    }, [simulatedTime, maneuverState.timeMode, maneuverState.offsetSec, 
        maneuverState.hours, maneuverState.minutes, maneuverState.seconds, 
        maneuverState.milliseconds]);

    // Calculate delta-V magnitude (memoized)
    const deltaVMagnitude = useMemo(() => {
        const { prograde, normal, radial } = maneuverState.deltaV;
        const p = parseFloat(prograde) || 0;
        const n = parseFloat(normal) || 0;
        const r = parseFloat(radial) || 0;
        return Math.sqrt(p * p + n * n + r * r);
    }, [maneuverState.deltaV.prograde, maneuverState.deltaV.normal, maneuverState.deltaV.radial]);

    // Get comprehensive maneuver analysis (memoized)
    const maneuverAnalysis = useMemo(() => {
        if (!isValidSatellite || !physicsEngine || !simulatedTime) return null;
        
        try {
            return physicsEngine.getManeuverAnalysis(satellite.id, simulatedTime);
        } catch (error) {
            console.warn('[useManeuverSystem] Error getting maneuver analysis:', error);
            return null;
        }
    }, [isValidSatellite, physicsEngine, satellite?.id, simulatedTime, maneuverNodes.length]);

    // Calculate Hohmann transfer preview (memoized)
    const hohmannPreview = useMemo(() => {
        if (!isValidSatellite || !physicsEngine || maneuverState.maneuverMode !== 'hohmann') {
            return null;
        }
        
        try {
            const targetSMA = parseFloat(maneuverState.targetSemiMajorAxis);
            if (!targetSMA || targetSMA <= 0) return null;
            
            return physicsEngine.calculateHohmannTransfer(satellite.id, {
                targetSemiMajorAxis: targetSMA,
                targetEccentricity: parseFloat(maneuverState.targetEccentricity) || 0,
                targetInclination: parseFloat(maneuverState.targetInclination),
                targetLAN: parseFloat(maneuverState.targetLAN),
                targetArgP: parseFloat(maneuverState.targetArgP),
                startTime: simulatedTime,
                createNodes: false
            });
        } catch (error) {
            console.warn('[useManeuverSystem] Error calculating Hohmann preview:', error);
            return null;
        }
    }, [
        isValidSatellite, 
        physicsEngine, 
        satellite?.id,
        maneuverState.maneuverMode,
        maneuverState.targetSemiMajorAxis,
        maneuverState.targetEccentricity,
        maneuverState.targetInclination,
        maneuverState.targetLAN,
        maneuverState.targetArgP,
        simulatedTime
    ]);

    // Optimized state update helper
    const updateManeuverState = useCallback((updates) => {
        setManeuverState(prev => ({ ...prev, ...updates }));
    }, []);

    // Calculate optimal burn times (memoized)
    const optimalBurnTimes = useMemo(() => {
        if (!isValidSatellite || !physicsEngine || !simulatedTime) {
            return { periapsis: simulatedTime, apoapsis: simulatedTime };
        }
        
        try {
            return {
                periapsis: physicsEngine.calculateOptimalBurnTime(satellite.id, 'periapsis', simulatedTime),
                apoapsis: physicsEngine.calculateOptimalBurnTime(satellite.id, 'apoapsis', simulatedTime)
            };
        } catch (error) {
            console.warn('[useManeuverSystem] Error calculating optimal burn times:', error);
            return { periapsis: simulatedTime, apoapsis: simulatedTime };
        }
    }, [isValidSatellite, physicsEngine, satellite?.id, simulatedTime]);

    // Functions that return optimal times (for display purposes)
    const getNextPeriapsisTime = useCallback(() => {
        return optimalBurnTimes.periapsis;
    }, [optimalBurnTimes.periapsis]);

    const getNextApoapsisTime = useCallback(() => {
        return optimalBurnTimes.apoapsis;
    }, [optimalBurnTimes.apoapsis]);

    // Action handlers (memoized)
    const actions = useMemo(() => ({
        // Manual maneuver actions
        addManualManeuver: () => {
            if (!isValidSatellite || !physicsEngine) return null;
            
            const deltaVKms = {
                prograde: (parseFloat(maneuverState.deltaV.prograde) || 0) / 1000,
                normal: (parseFloat(maneuverState.deltaV.normal) || 0) / 1000,
                radial: (parseFloat(maneuverState.deltaV.radial) || 0) / 1000
            };
            
            // Check for zero delta-V
            const magnitude = Math.sqrt(deltaVKms.prograde ** 2 + deltaVKms.normal ** 2 + deltaVKms.radial ** 2);
            if (magnitude < 0.001) return null;
            
            try {
                return physicsEngine.scheduleManualBurn(satellite.id, {
                    executionTime,
                    deltaV: deltaVKms,
                    replaceExisting: maneuverState.selectedIndex !== null
                });
            } catch (error) {
                console.error('[useManeuverSystem] Error adding manual maneuver:', error);
                return null;
            }
        },
        
        // Hohmann transfer actions
        generateHohmannTransfer: () => {
            if (!isValidSatellite || !physicsEngine || !hohmannPreview) return null;
            
            try {
                const result = physicsEngine.calculateHohmannTransfer(satellite.id, {
                    targetSemiMajorAxis: parseFloat(maneuverState.targetSemiMajorAxis),
                    targetEccentricity: parseFloat(maneuverState.targetEccentricity) || 0,
                    targetInclination: parseFloat(maneuverState.targetInclination),
                    targetLAN: parseFloat(maneuverState.targetLAN),
                    targetArgP: parseFloat(maneuverState.targetArgP),
                    startTime: simulatedTime,
                    createNodes: true
                });
                
                // Reset UI state after successful generation
                updateManeuverState({
                    maneuverMode: 'manual',
                    selectedIndex: null,
                    isAdding: false
                });
                
                return result;
            } catch (error) {
                console.error('[useManeuverSystem] Error generating Hohmann transfer:', error);
                return null;
            }
        },
        
        // Node management
        deleteNode: (nodeIndex) => {
            if (!isValidSatellite || !physicsEngine || !maneuverNodes[nodeIndex]) return false;
            
            try {
                const node = maneuverNodes[nodeIndex];
                physicsEngine.removeManeuverNode(satellite.id, node.id);
                
                // Reset selection if deleted node was selected
                if (maneuverState.selectedIndex === nodeIndex) {
                    updateManeuverState({ selectedIndex: null, isAdding: false });
                }
                
                return true;
            } catch (error) {
                console.error('[useManeuverSystem] Error deleting node:', error);
                return false;
            }
        },
        
        // UI state management
        selectNode: (index) => {
            if (index < 0 || index >= maneuverNodes.length) return;
            
            const node = maneuverNodes[index];
            updateManeuverState({
                selectedIndex: index,
                isAdding: false,
                timeMode: 'datetime',
                hours: node.executionTime.getUTCHours(),
                minutes: node.executionTime.getUTCMinutes(),
                seconds: node.executionTime.getUTCSeconds(),
                milliseconds: node.executionTime.getUTCMilliseconds(),
                deltaV: {
                    prograde: (node.deltaV.prograde * 1000).toFixed(0),
                    normal: (node.deltaV.normal * 1000).toFixed(0),
                    radial: (node.deltaV.radial * 1000).toFixed(0)
                }
            });
        },
        
        startAdding: () => {
            updateManeuverState({
                selectedIndex: null,
                isAdding: true,
                timeMode: 'offset',
                offsetSec: '0',
                deltaV: { prograde: '0', normal: '0', radial: '0' }
            });
        },
        
        cancel: () => {
            updateManeuverState({
                selectedIndex: null,
                isAdding: false,
                maneuverMode: 'manual'
            });
        },
        
        setTimeToNextPeriapsis: () => {
            const time = optimalBurnTimes.periapsis;
            updateManeuverState({
                timeMode: 'datetime',
                hours: time.getUTCHours(),
                minutes: time.getUTCMinutes(),
                seconds: time.getUTCSeconds(),
                milliseconds: time.getUTCMilliseconds()
            });
        },
        
        setTimeToNextApoapsis: () => {
            const time = optimalBurnTimes.apoapsis;
            updateManeuverState({
                timeMode: 'datetime',
                hours: time.getUTCHours(),
                minutes: time.getUTCMinutes(),
                seconds: time.getUTCSeconds(),
                milliseconds: time.getUTCMilliseconds()
            });
        }
    }), [
        isValidSatellite,
        physicsEngine,
        satellite?.id,
        maneuverState,
        executionTime,
        hohmannPreview,
        simulatedTime,
        maneuverNodes,
        optimalBurnTimes,
        updateManeuverState
    ]);

    // Return the complete maneuver system interface
    return {
        // State
        state: maneuverState,
        updateState: updateManeuverState,
        
        // Computed values
        isValidSatellite,
        maneuverNodes,
        maneuverAnalysis,
        hohmannPreview,
        executionTime,
        deltaVMagnitude,
        optimalBurnTimes,
        
        // Optimal time calculation functions (for display)
        getNextPeriapsisTime,
        getNextApoapsisTime,
        
        // Actions
        actions,
        
        // Raw physics engine access (for advanced use)
        physicsEngine
    };
}

export default useManeuverSystem; 