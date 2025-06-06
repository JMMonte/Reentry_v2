import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * React hook for accessing the new physics engine capabilities
 * Provides real-time physics state, orbital calculations, and simulation controls
 */
export function usePhysicsEngine(app) {
    const [physicsState, setPhysicsState] = useState(null);
    const [isPhysicsInitialized, setIsPhysicsInitialized] = useState(false);
    const [physicsError, setPhysicsError] = useState(null);
    const [satelliteTrajectories, setSatelliteTrajectories] = useState(new Map());
    const [orbitalElements, setOrbitalElements] = useState(new Map());

    const physicsIntegrationRef = useRef(null);
    const workerRef = useRef(null);

    // Initialize physics integration
    useEffect(() => {
        if (!app || !app.physicsIntegration) return;

        physicsIntegrationRef.current = app.physicsIntegration;

        const handlePhysicsUpdate = (event) => {
            setPhysicsState(event.detail.state);
            setPhysicsError(null);
        };

        const handlePhysicsError = (event) => {
            setPhysicsError(event.detail.error);
        };

        // Listen for physics updates
        window.addEventListener('physicsUpdate', handlePhysicsUpdate);
        window.addEventListener('physicsError', handlePhysicsError);

        // Check if already initialized
        if (app.physicsIntegration.isInitialized) {
            setIsPhysicsInitialized(true);
            const currentState = app.physicsIntegration.physicsEngine.getSimulationState();
            setPhysicsState(currentState);
        }

        return () => {
            window.removeEventListener('physicsUpdate', handlePhysicsUpdate);
            window.removeEventListener('physicsError', handlePhysicsError);
        };
    }, [app]);

    // Initialize modern physics worker if available
    useEffect(() => {
        let isUnmounted = false;
        
        const initWorker = async () => {
            try {
                const worker = new Worker('/src/workers/modernPhysicsWorker.js', { type: 'module' });
                workerRef.current = worker;

                worker.onmessage = (event) => {
                    // Prevent setState calls after component unmount
                    if (isUnmounted) return;
                    
                    const { type, data } = event.data;

                    switch (type) {
                        case 'initialized':
                            setIsPhysicsInitialized(data.success);
                            if (!data.success) {
                                setPhysicsError(data.error);
                            }
                            break;
                        case 'simulationUpdate':
                            setPhysicsState(data.state);
                            break;
                        case 'trajectoryGenerated':
                            if (data.success) {
                                setSatelliteTrajectories(prev => new Map(prev).set(data.satelliteId, data.trajectory));
                            }
                            break;
                        case 'orbitalElements':
                            if (data.success) {
                                setOrbitalElements(prev => new Map(prev).set(data.bodyName, data.elements));
                            }
                            break;
                        case 'error':
                            setPhysicsError(data.message);
                            break;
                    }
                };

                // Initialize the worker
                worker.postMessage({
                    type: 'init',
                    data: {
                        initialTime: app.timeUtils?.getSimulatedTime?.()?.toISOString() || new Date().toISOString(),
                        timeWarp: app.timeUtils?.getTimeWarp?.() || 1,
                        integrator: 'rk4',
                        relativistic: false
                    }
                });

            } catch (error) {
                console.warn('[usePhysicsEngine] Could not initialize physics worker:', error);
                setPhysicsError(error.message);
            }
        };

        if (typeof Worker !== 'undefined') {
            initWorker();
        }

        return () => {
            isUnmounted = true;
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, [app]);

    // Add satellite to physics simulation
    const addSatellite = useCallback((satelliteData) => {
        if (physicsIntegrationRef.current) {
            physicsIntegrationRef.current.addSatellite(satelliteData);
        }
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'addSatellite',
                data: satelliteData
            });
        }
    }, []);

    // Remove satellite from physics simulation
    const removeSatellite = useCallback((satelliteId) => {
        if (physicsIntegrationRef.current) {
            physicsIntegrationRef.current.removeSatellite(satelliteId);
        }
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'removeSatellite',
                data: { id: satelliteId }
            });
        }
        setSatelliteTrajectories(prev => {
            const newMap = new Map(prev);
            newMap.delete(satelliteId);
            return newMap;
        });
    }, []);

    // Generate trajectory for a satellite
    const generateSatelliteTrajectory = useCallback((satelliteId, duration = 3600, timeStep = 60) => {
        if (physicsIntegrationRef.current) {
            const trajectory = physicsIntegrationRef.current.generateSatelliteTrajectory(satelliteId, duration, timeStep);
            setSatelliteTrajectories(prev => new Map(prev).set(satelliteId, trajectory));
            return trajectory;
        }
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'generateTrajectory',
                data: { satelliteId, duration, timeStep }
            });
        }
        return [];
    }, []);

    // Generate orbit path for a celestial body
    const generateOrbitPath = useCallback((bodyName, numPoints = 360) => {
        if (physicsIntegrationRef.current) {
            return physicsIntegrationRef.current.generateOrbitPath(bodyName, numPoints);
        }
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'generateOrbitPath',
                data: { bodyName, numPoints }
            });
        }
        return [];
    }, []);

    // Get orbital elements for a body
    const getOrbitalElements = useCallback((bodyName) => {
        if (physicsIntegrationRef.current) {
            const elements = physicsIntegrationRef.current.getOrbitalElements(bodyName);
            setOrbitalElements(prev => new Map(prev).set(bodyName, elements));
            return elements;
        }
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'getOrbitalElements',
                data: { bodyName }
            });
        }
        return null;
    }, []);

    // Set physics integration method
    const setIntegrator = useCallback((method) => {
        if (physicsIntegrationRef.current) {
            physicsIntegrationRef.current.setIntegrator(method);
        }
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'setIntegrator',
                data: { method }
            });
        }
    }, []);

    // Enable/disable relativistic corrections
    const setRelativisticCorrections = useCallback((enabled) => {
        if (physicsIntegrationRef.current) {
            physicsIntegrationRef.current.setRelativisticCorrections(enabled);
        }
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'setRelativisticCorrections',
                data: { enabled }
            });
        }
    }, []);

    // Set simulation time
    const setSimulationTime = useCallback((newTime) => {
        if (physicsIntegrationRef.current) {
            physicsIntegrationRef.current.setSimulationTime(newTime);
        }
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'setTime',
                data: { time: newTime.toISOString() }
            });
        }
    }, []);

    // Get current body states
    const getBodyStates = useCallback(() => {
        return physicsState?.bodies || {};
    }, [physicsState]);

    // Get current satellite states
    const getSatelliteStates = useCallback(() => {
        return physicsState?.satellites || {};
    }, [physicsState]);

    // Get barycenter states
    const getBarycenterStates = useCallback(() => {
        return physicsState?.barycenters || {};
    }, [physicsState]);

    // Get trajectory for a specific satellite
    const getSatelliteTrajectory = useCallback((satelliteId) => {
        return satelliteTrajectories.get(satelliteId) || [];
    }, [satelliteTrajectories]);

    // Get orbital elements for a specific body
    const getBodyOrbitalElements = useCallback((bodyName) => {
        return orbitalElements.get(bodyName) || null;
    }, [orbitalElements]);

    // Check if a satellite exists
    const hasSatellite = useCallback((satelliteId) => {
        return Boolean(physicsState?.satellites?.[satelliteId]);
    }, [physicsState]);

    // Get physics simulation time
    const getSimulationTime = useCallback(() => {
        return physicsState?.time || null;
    }, [physicsState]);

    // Get physics statistics
    const getPhysicsStats = useCallback(() => {
        if (!physicsState) return null;

        return {
            bodyCount: Object.keys(physicsState.bodies || {}).length,
            satelliteCount: Object.keys(physicsState.satellites || {}).length,
            barycenterCount: Object.keys(physicsState.barycenters || {}).length,
            trajectoryCount: satelliteTrajectories.size,
            orbitalElementsCount: orbitalElements.size,
            lastUpdateTime: physicsState.time
        };
    }, [physicsState, satelliteTrajectories, orbitalElements]);

    return {
        // State
        physicsState,
        isPhysicsInitialized,
        physicsError,

        // Satellite management
        addSatellite,
        removeSatellite,
        hasSatellite,
        getSatelliteStates,
        getSatelliteTrajectory,
        generateSatelliteTrajectory,

        // Celestial body data
        getBodyStates,
        getBarycenterStates,
        getBodyOrbitalElements,
        getOrbitalElements,
        generateOrbitPath,

        // Simulation controls
        setSimulationTime,
        setIntegrator,
        setRelativisticCorrections,
        getSimulationTime,

        // Utilities
        getPhysicsStats
    };
} 