import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { usePhysicsEngine } from '../../hooks/usePhysicsEngine.js';
import { DraggableModal } from '../modal/DraggableModal.jsx';
import { Button } from '../button.jsx';
import { Switch } from '../switch.jsx';

/**
 * Physics Control Panel - demonstrates integration with the new physics engine
 * Shows real-time physics state, orbital elements, and simulation controls
 */
export function PhysicsControl({ app, isOpen, onClose }) {
    const {
        isPhysicsInitialized,
        physicsError,
        getBodyStates,
        getSatelliteStates,
        getOrbitalElements,
        setIntegrator,
        setRelativisticCorrections,
        getPhysicsStats,
        generateOrbitPath,
        generateSatelliteTrajectory
    } = usePhysicsEngine(app);

    const [selectedBody, setSelectedBody] = useState('Earth');
    const [selectedSatellite, setSelectedSatellite] = useState('');
    const [integrator, setIntegratorState] = useState('rk4');
    const [relativistic, setRelativisticState] = useState(false);
    const [orbitalElements, setOrbitalElementsState] = useState(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Get simulation time and time warp from app's time utils
    const [simTime, setSimTime] = useState(null);
    const [timeWarp, setTimeWarp] = useState(1);

    // Update simulation time and time warp from app
    useEffect(() => {
        if (app && app.timeUtils) {
            const updateTime = () => {
                setSimTime(app.timeUtils.getSimulatedTime());
                setTimeWarp(app.timeUtils.getTimeWarp());
            };

            // Initial update
            updateTime();

            // Listen for time updates
            const handleTimeUpdate = () => updateTime();
            document.addEventListener('timeUpdate', handleTimeUpdate);

            // Regular updates for interpolated time
            const timeInterval = setInterval(updateTime, 100);

            return () => {
                document.removeEventListener('timeUpdate', handleTimeUpdate);
                clearInterval(timeInterval);
            };
        }
    }, [app]);

    // Update orbital elements when body selection changes
    useEffect(() => {
        if (selectedBody && isPhysicsInitialized) {
            const elements = getOrbitalElements(selectedBody);
            setOrbitalElementsState(elements);
        }
    }, [selectedBody, isPhysicsInitialized, getOrbitalElements]);

    const handleIntegratorChange = (newIntegrator) => {
        setIntegratorState(newIntegrator);
        setIntegrator(newIntegrator);
    };

    const handleRelativisticChange = (enabled) => {
        setRelativisticState(enabled);
        setRelativisticCorrections(enabled);
    };

    const handleGenerateOrbit = () => {
        if (selectedBody) {
            const orbitPath = generateOrbitPath(selectedBody, 360);
            console.log(`Generated orbit path for ${selectedBody}:`, orbitPath);
        }
    };

    const handleGenerateTrajectory = () => {
        if (selectedSatellite) {
            generateSatelliteTrajectory(selectedSatellite, 3600, 60);
            console.log(`Generated trajectory for satellite ${selectedSatellite}`);
        }
    };

    const formatNumber = (num) => {
        if (num == null || !isFinite(num)) return 'N/A';
        if (Math.abs(num) > 1e6 || Math.abs(num) < 1e-3) {
            return num.toExponential(3);
        }
        return num.toFixed(3);
    };

    const formatPosition = (pos) => {
        if (!pos || !Array.isArray(pos)) return 'N/A';
        return `(${formatNumber(pos[0])}, ${formatNumber(pos[1])}, ${formatNumber(pos[2])})`;
    };

    const bodyStates = getBodyStates();
    const satelliteStates = getSatelliteStates();
    const stats = getPhysicsStats();

    if (!isOpen) return null;

    return (
        <DraggableModal
            title="Physics Engine Control"
            isOpen={isOpen}
            onClose={onClose}
            defaultPosition={{ x: 20, y: 100 }}
            defaultWidth={350}
            defaultHeight={600}
            resizable={true}
            minWidth={320}
            minHeight={400}
            className="text-xs font-mono"
        >
            <div className="p-4 space-y-4 bg-black/80 text-white overflow-auto max-h-full">
                {/* Status Section */}
                <div className="space-y-2">
                    <div className={`text-sm font-semibold ${isPhysicsInitialized ? 'text-green-400' : 'text-red-400'}`}>
                        Status: {isPhysicsInitialized ? 'Initialized' : 'Not Initialized'}
                    </div>
                    {physicsError && (
                        <div className="text-red-400 text-xs">
                            Error: {physicsError}
                        </div>
                    )}
                </div>

                {/* Time Synchronization Verification */}
                <div className="space-y-1">
                    <h4 className="text-blue-300 font-semibold">Time Sync Verification</h4>
                    <div className="text-xs space-y-1">
                        <div>Physics Time: {app?.physicsIntegration?.physicsEngine?.simulationTime?.toISOString().slice(0, 19).replace('T', ' ') || 'N/A'}</div>
                        <div>TimeUtils Time: {app?.timeUtils?.getSimulatedTime()?.toISOString().slice(0, 19).replace('T', ' ') || 'N/A'}</div>
                        <div>UI Time: {simTime ? simTime.toISOString().slice(0, 19).replace('T', ' ') : 'N/A'}</div>
                        <div className={
                            app?.physicsIntegration?.physicsEngine?.simulationTime?.getTime() === app?.timeUtils?.getSimulatedTime()?.getTime() &&
                            app?.timeUtils?.getSimulatedTime()?.getTime() === simTime?.getTime()
                            ? 'text-green-400' : 'text-red-400'
                        }>
                            Sync Status: {
                                app?.physicsIntegration?.physicsEngine?.simulationTime?.getTime() === app?.timeUtils?.getSimulatedTime()?.getTime() &&
                                app?.timeUtils?.getSimulatedTime()?.getTime() === simTime?.getTime()
                                ? '✓ SYNCHRONIZED' : '✗ OUT OF SYNC'
                            }
                        </div>
                    </div>
                </div>

                {/* Time Display */}
                <div className="space-y-1">
                    <h4 className="text-blue-300 font-semibold">Time & Flow Debug</h4>
                    <div className="text-xs space-y-1">
                        <div>Sim Time: {simTime ? simTime.toISOString().slice(0, 19).replace('T', ' ') : 'N/A'}</div>
                        <div>Time Warp: <span className={timeWarp === 0 ? 'text-red-400' : 'text-green-400'}>{timeWarp}x {timeWarp === 0 ? '(PAUSED)' : ''}</span></div>
                        <div>Provider: <span className="text-yellow-300">{app?.physicsProviderType || 'Unknown'}</span></div>
                        <div>Session ID: {app?.sessionId ? 'Yes' : 'No'}</div>
                        <div>Physics Ready: <span className={isPhysicsInitialized ? 'text-green-400' : 'text-red-400'}>{isPhysicsInitialized ? 'Yes' : 'No'}</span></div>
                        <div>Time Utils Ready: <span className={app?.timeUtils ? 'text-green-400' : 'text-red-400'}>{app?.timeUtils ? 'Yes' : 'No'}</span></div>
                        <div className="text-blue-200 mt-1 text-[10px]">
                            Last Update: {new Date().toLocaleTimeString()}
                        </div>
                        {app?.timeUtils && (
                            <div className="text-purple-200 text-[10px]">
                                Internal Time: {app.timeUtils.getSimulatedTime()?.toLocaleTimeString() || 'N/A'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Physics Statistics */}
                {stats && (
                    <div className="space-y-1">
                        <h4 className="text-blue-300 font-semibold">Statistics</h4>
                        <div className="text-xs space-y-1">
                            <div>Bodies: {stats.bodyCount}</div>
                            <div>Satellites: {stats.satelliteCount}</div>
                            <div>Barycenters: {stats.barycenterCount}</div>
                            <div>Trajectories: {stats.trajectoryCount}</div>
                            <div>Last Update: {stats.lastUpdateTime ? new Date(stats.lastUpdateTime).toLocaleTimeString() : 'N/A'}</div>
                        </div>
                    </div>
                )}

                {/* Controls */}
                <div className="space-y-2">
                    <h4 className="text-blue-300 font-semibold">Controls</h4>

                    <div className="space-y-2">
                        <div>
                            <label className="block text-xs mb-1">Integrator:</label>
                            <select
                                value={integrator}
                                onChange={(e) => handleIntegratorChange(e.target.value)}
                                className="w-full bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-xs"
                            >
                                <option value="rk4">RK4</option>
                                <option value="rk8">RK8</option>
                                <option value="leapfrog">Leapfrog</option>
                                <option value="hermite">Hermite</option>
                            </select>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Switch
                                checked={relativistic}
                                onCheckedChange={handleRelativisticChange}
                            />
                            <label className="text-xs">Relativistic Corrections</label>
                        </div>

                        <Button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            variant="outline"
                            size="sm"
                            className="w-full"
                        >
                            {showAdvanced ? 'Hide' : 'Show'} Advanced
                        </Button>

                        <Button
                            onClick={() => {
                                // Test orientation by setting to J2000 epoch (noon UT1)
                                if (app?.timeUtils?.setSimulatedTime) {
                                    const j2000Epoch = new Date('2000-01-01T12:00:00Z');
                                    app.timeUtils.setSimulatedTime(j2000Epoch);
                                    console.log('Set time to J2000 epoch for orientation verification');
                                }
                            }}
                            variant="outline"
                            size="sm"
                            className="w-full text-cyan-300"
                        >
                            🔧 Test: Set J2000 Epoch
                        </Button>

                        <Button
                            onClick={() => {
                                // Reset to current browser UTC time
                                if (app?.timeUtils?.setSimulatedTime) {
                                    const nowUTC = new Date(); // Browser's current UTC time
                                    app.timeUtils.setSimulatedTime(nowUTC);
                                    console.log('Reset to current browser UTC time:', nowUTC.toISOString());
                                }
                            }}
                            variant="outline"
                            size="sm"
                            className="w-full text-green-300"
                        >
                            ⏰ Reset to Current UTC
                        </Button>
                    </div>
                </div>

                {/* Advanced Controls */}
                {showAdvanced && (
                    <div className="space-y-2">
                        <h4 className="text-blue-300 font-semibold">Advanced Tools</h4>

                        <div className="space-y-2">
                            <div>
                                <label className="block text-xs mb-1">Body:</label>
                                <select
                                    value={selectedBody}
                                    onChange={(e) => setSelectedBody(e.target.value)}
                                    className="w-full bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-xs"
                                >
                                    {Object.keys(bodyStates).map(naif => {
                                        const body = bodyStates[naif];
                                        return (
                                            <option key={naif} value={body.name || naif}>
                                                {body.name || `Body ${naif}`}
                                            </option>
                                        );
                                    })}
                                </select>
                                <Button
                                    onClick={handleGenerateOrbit}
                                    size="sm"
                                    className="w-full mt-1"
                                >
                                    Generate Orbit
                                </Button>
                            </div>

                            {Object.keys(satelliteStates).length > 0 && (
                                <div>
                                    <label className="block text-xs mb-1">Satellite:</label>
                                    <select
                                        value={selectedSatellite}
                                        onChange={(e) => setSelectedSatellite(e.target.value)}
                                        className="w-full bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-xs"
                                    >
                                        <option value="">Select satellite...</option>
                                        {Object.keys(satelliteStates).map(id => (
                                            <option key={id} value={id}>Satellite {id}</option>
                                        ))}
                                    </select>
                                    {selectedSatellite && (
                                        <Button
                                            onClick={handleGenerateTrajectory}
                                            size="sm"
                                            className="w-full mt-1"
                                        >
                                            Generate Trajectory
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Orbital Elements */}
                {orbitalElements && showAdvanced && (
                    <div className="space-y-1">
                        <h4 className="text-blue-300 font-semibold">
                            Orbital Elements: {selectedBody}
                        </h4>
                        <div className="text-xs space-y-1">
                            <div>Semi-major axis: {formatNumber(orbitalElements.semiMajorAxis)} km</div>
                            <div>Eccentricity: {formatNumber(orbitalElements.eccentricity)}</div>
                            <div>Inclination: {formatNumber(orbitalElements.inclination * 180 / Math.PI)}°</div>
                            <div>LAN: {formatNumber(orbitalElements.longitudeOfAscendingNode * 180 / Math.PI)}°</div>
                            <div>Arg. of periapsis: {formatNumber(orbitalElements.argumentOfPeriapsis * 180 / Math.PI)}°</div>
                            <div>True anomaly: {formatNumber(orbitalElements.trueAnomaly * 180 / Math.PI)}°</div>
                        </div>
                    </div>
                )}

                {/* Precise State Vectors (for verification) */}
                {bodyStates && Object.keys(bodyStates).length > 0 && (
                    <div className="space-y-1">
                        <h4 className="text-blue-300 font-semibold">State Vector Verification</h4>
                        <div className="text-xs space-y-1 max-h-32 overflow-auto">
                            <div className="text-yellow-200">Earth Position (km):</div>
                            <div className="font-mono text-[10px]">
                                {bodyStates[399] ? `X: ${(bodyStates[399].position[0]/1000).toFixed(1)}` : 'N/A'}
                            </div>
                            <div className="font-mono text-[10px]">
                                {bodyStates[399] ? `Y: ${(bodyStates[399].position[1]/1000).toFixed(1)}` : 'N/A'}
                            </div>
                            <div className="font-mono text-[10px]">
                                {bodyStates[399] ? `Z: ${(bodyStates[399].position[2]/1000).toFixed(1)}` : 'N/A'}
                            </div>
                            <div className="text-yellow-200 mt-1">Mars Position (km):</div>
                            <div className="font-mono text-[10px]">
                                {bodyStates[499] ? `X: ${(bodyStates[499].position[0]/1000).toFixed(1)}` : 'N/A'}
                            </div>
                            <div className="font-mono text-[10px]">
                                {bodyStates[499] ? `Y: ${(bodyStates[499].position[1]/1000).toFixed(1)}` : 'N/A'}
                            </div>
                            <div className="font-mono text-[10px]">
                                {bodyStates[499] ? `Z: ${(bodyStates[499].position[2]/1000).toFixed(1)}` : 'N/A'}
                            </div>
                            <div className="text-gray-400 text-[9px] mt-1">
                                These positions should change immediately when time changes
                            </div>
                        </div>
                    </div>
                )}

                {/* ECLIPJ2000 Coordinate System Verification */}
                <div className="space-y-1">
                    <h4 className="text-blue-300 font-semibold">ECLIPJ2000 Verification</h4>
                    <div className="text-xs space-y-1">
                        <div className="text-yellow-200">Reference Frame:</div>
                        <div className="font-mono text-[10px]">X-axis → Vernal Equinox (γ)</div>
                        <div className="font-mono text-[10px]">Y-axis → 90° East in Ecliptic</div>
                        <div className="font-mono text-[10px]">Z-axis → North Ecliptic Pole</div>
                        <div className="text-yellow-200 mt-1">Earth Orientation Check:</div>
                        {bodyStates[399] && (
                            <>
                                <div className="font-mono text-[10px]">
                                    Pole RA: {bodyStates[399].poleRA?.toFixed(2)}h (≈{(bodyStates[399].poleRA * 15)?.toFixed(1)}°)
                                </div>
                                <div className="font-mono text-[10px]">
                                    Pole Dec: {bodyStates[399].poleDec?.toFixed(2)}° (≈23.4° expected)
                                </div>
                                <div className="font-mono text-[10px]">
                                    Prime Meridian: {(bodyStates[399].spin % 360)?.toFixed(1)}°
                                </div>
                                <div className="text-gray-400 text-[9px] mt-1">
                                    Greenwich should align with 0° at J2000 epoch
                                </div>
                                <div className="text-cyan-300 text-[9px] mt-1">
                                    🔧 Fixed: Physics quaternion pre-composed with base rotation inverse
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Planetary Orientations */}
                <div className="space-y-1">
                    <h4 className="text-blue-300 font-semibold">Planetary Orientations</h4>
                    <div className="space-y-2">
                        {bodyStates && Object.values(bodyStates).slice(0, 5).map(body => (
                            <div key={body.naif} className="border border-gray-700 rounded p-2">
                                <div className="text-yellow-300 font-semibold">{body.name}</div>
                                <div className="text-xs space-y-1">
                                    <div>Pole RA: {body.poleRA ? body.poleRA.toFixed(2) : 'N/A'}h</div>
                                    <div>Pole Dec: {body.poleDec ? body.poleDec.toFixed(2) : 'N/A'}°</div>
                                    <div>Spin: {body.spin ? (body.spin % 360).toFixed(1) : 'N/A'}°</div>
                                    <div className="font-mono text-[9px] text-gray-300">
                                        Q: [{body.quaternion?.[0]?.toFixed(3)}, {body.quaternion?.[1]?.toFixed(3)}, {body.quaternion?.[2]?.toFixed(3)}, {body.quaternion?.[3]?.toFixed(3)}]
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Body Status */}
                {showAdvanced && Object.keys(bodyStates).length > 0 && (
                    <div className="space-y-1">
                        <h4 className="text-blue-300 font-semibold">Body States</h4>
                        <div className="max-h-48 overflow-auto space-y-2">
                            {Object.entries(bodyStates).slice(0, 5).map(([naif, body]) => (
                                <div key={naif} className="border border-gray-700 rounded p-2">
                                    <div className="text-yellow-300 font-semibold">{body.name || `Body ${naif}`}</div>
                                    <div className="text-xs space-y-1">
                                        <div>Pos: {formatPosition(body.position)}</div>
                                        <div>Mass: {formatNumber(body.mass)} kg</div>
                                    </div>
                                </div>
                            ))}
                            {Object.keys(bodyStates).length > 5 && (
                                <div className="text-gray-400 text-xs">
                                    ... and {Object.keys(bodyStates).length - 5} more
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </DraggableModal>
    );
}

PhysicsControl.propTypes = {
    app: PropTypes.object.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
}; 