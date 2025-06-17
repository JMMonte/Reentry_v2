import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DraggableModal } from '../modal/DraggableModal';
import { Button } from '../button';
import { Loader2 } from 'lucide-react';
import { Download } from 'lucide-react';
import { saveAs } from 'file-saver';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '../select';
import PropTypes from 'prop-types';
import { useDebouncePhysics } from '@/hooks/useDebouncePhysics';

export const SimulationWindow = React.memo(function SimulationWindow({ isOpen, onClose }) {
    const [simulationData, setSimulationData] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    
    // refs to batch incoming updates and prevent re-renders
    const pendingSimRef = useRef({});
    const flushSimRef = useRef(false);
    const rafIdRef = useRef(null);
    
    // Define available metrics - memoized to prevent recreation
    const metricsList = useMemo(() => [
        { key: 'altitude', label: 'Altitude', color: '#1f77b4' },
        { key: 'velocity', label: 'Velocity', color: '#ff7f0e' },
        { key: 'lat', label: 'Latitude', color: '#2ca02c' },
        { key: 'lon', label: 'Longitude', color: '#d62728' },
        { key: 'semiMajorAxis', label: 'SMA', color: '#9467bd' },
        { key: 'eccentricity', label: 'Ecc', color: '#8c564b' },
        { key: 'inclination', label: 'Inc', color: '#e377c2' },
        { key: 'argumentOfPeriapsis', label: 'AoP', color: '#7f7f7f' },
        { key: 'trueAnomaly', label: 'TA', color: '#bcbd22' },
        { key: 'density', label: 'Density', color: '#17becf' },
        { key: 'dragAcc', label: 'Drag Accel', color: '#393b79' },
        { key: 'perturbation', label: 'Perturbation', color: '#637939' },
        { key: 'pertAccEarth', label: 'Perturb Earth', color: '#8c6d31' },
        { key: 'pertAccMoon', label: 'Perturb Moon', color: '#843c39' },
        { key: 'pertAccSun', label: 'Perturb Sun', color: '#7b4173' }
    ], []);
    
    // Default metrics selection and axis assignments - memoized
    const [selectedMetrics, setSelectedMetrics] = useState(() => [metricsList[0].key, metricsList[1].key]);
    const [primaryMetric, setPrimaryMetric] = useState(() => metricsList[0].key);
    const [secondaryMetric, setSecondaryMetric] = useState(() => metricsList[1].key);
    const [selectedSatId, setSelectedSatId] = useState(null);

    // Optimized flush function with RAF batching
    const scheduleFlush = useCallback(() => {
        if (!flushSimRef.current) {
            flushSimRef.current = true;
            rafIdRef.current = requestAnimationFrame(() => {
                setSimulationData(prev => {
                    const next = { ...prev };
                    for (const [sid, updates] of Object.entries(pendingSimRef.current)) {
                        const prevEntry = next[sid] || { orbitUpdates: [], paramUpdates: [] };
                        next[sid] = {
                            orbitUpdates: [...prevEntry.orbitUpdates, ...(updates.orbitUpdates || [])],
                            paramUpdates: [...prevEntry.paramUpdates, ...(updates.paramUpdates || [])]
                        };
                    }
                    return next;
                });
                pendingSimRef.current = {};
                flushSimRef.current = false;
                rafIdRef.current = null;
            });
        }
    }, []);

    // Debounced event handlers using centralized system
    const handleOrbitUpdate = useDebouncePhysics(
        'charts', // Use RAF strategy for smooth chart updates
        useCallback((e) => {
            const { id, orbitPoints, period, numPoints } = e.detail;
            const bucket = pendingSimRef.current[id] ||= { orbitUpdates: [], paramUpdates: [] };
            bucket.orbitUpdates.push({ orbitPoints, period, numPoints });
            scheduleFlush();
        }, [scheduleFlush]),
        [scheduleFlush]
    );

    const handleParamUpdate = useDebouncePhysics(
        'charts', // Use RAF strategy for smooth chart updates
        useCallback((e) => {
            const { id, elements, perturbation, simulatedTime, altitude, velocity, lat, lon, dragData } = e.detail;
            const bucket = pendingSimRef.current[id] ||= { orbitUpdates: [], paramUpdates: [] };
            bucket.paramUpdates.push({ elements, perturbation, simulatedTime, altitude, velocity, lat, lon, dragData });
            scheduleFlush();
        }, [scheduleFlush]),
        [scheduleFlush]
    );

    useEffect(() => {
        if (!isOpen) {
            // reset when closed
            setSimulationData({});
            pendingSimRef.current = {};
            flushSimRef.current = false;
            return;
        }

        document.addEventListener('orbitDataUpdate', handleOrbitUpdate);
        document.addEventListener('simulationDataUpdate', handleParamUpdate);
        
        return () => {
            document.removeEventListener('orbitDataUpdate', handleOrbitUpdate);
            document.removeEventListener('simulationDataUpdate', handleParamUpdate);
            // Cancel pending animation frame
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, [isOpen, handleOrbitUpdate, handleParamUpdate]);

    // Initialize selected satellite when data arrives - memoized effect
    useEffect(() => {
        const hasOrbit = Object.values(simulationData).some(entry => entry.orbitUpdates.length > 0);
        if (hasOrbit) setIsLoading(false);
        
        const ids = Object.keys(simulationData);
        if (!selectedSatId && ids.length > 0) {
            setSelectedSatId(ids[0]);
        } else if (selectedSatId && !ids.includes(selectedSatId)) {
            setSelectedSatId(ids[0] || null);
        }
    }, [simulationData, selectedSatId]);

    // Memoized download handler
    const handleDownload = useCallback(() => {
        const rows = [];
        // CSV header
        rows.push([
            'id', 'eventType', 'simulatedTime', 'period', 'numPoints', 'pointIndex', 'x', 'y', 'z',
            'semiMajorAxis', 'eccentricity', 'inclination', 'longitudeOfAscendingNode', 'argumentOfPeriapsis', 'trueAnomaly',
            'specificAngularMomentum', 'specificOrbitalEnergy', 'periapsisAltitude', 'apoapsisAltitude'
        ].join(','));
        
        // Data rows
        Object.entries(simulationData).forEach(([id, entry]) => {
            entry.orbitUpdates.forEach(u => {
                u.orbitPoints.forEach((pt, idx) => {
                    rows.push([
                        id, 'orbit', '', u.period, u.numPoints, idx, pt.x, pt.y, pt.z,
                        '', '', '', '', '', '', '', '', '', ''
                    ].join(','));
                });
            });
            entry.paramUpdates.forEach(u => {
                const el = u.elements || {};
                rows.push([
                    id, 'parameters', u.simulatedTime, '', '', '', '', '', '',
                    el.semiMajorAxis, el.eccentricity, el.inclination, el.longitudeOfAscendingNode,
                    el.argumentOfPeriapsis, el.trueAnomaly, el.specificAngularMomentum,
                    el.specificOrbitalEnergy, el.periapsisAltitude, el.apoapsisAltitude
                ].join(','));
            });
        });
        
        const csv = rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `simulation-data-${new Date().toISOString()}.csv`);
    }, [simulationData]);

    // Memoized chart data with complex calculations
    const chartData = useMemo(() => {
        if (!selectedSatId) return [];
        const entry = simulationData[selectedSatId] || {};
        return (entry.paramUpdates || []).map(u => {
            const rec = { time: new Date(u.simulatedTime).getTime() };
            selectedMetrics.forEach(metric => {
                switch(metric) {
                    case 'density':
                        rec[metric] = u.dragData?.density ?? 0;
                        break;
                    case 'dragAcc': {
                        const da = u.dragData?.dragAcceleration || { x:0, y:0, z:0 };
                        rec[metric] = Math.hypot(da.x, da.y, da.z);
                        break;
                    }
                    case 'perturbation': {
                        const pa = u.perturbation?.acc?.total || { x:0, y:0, z:0 };
                        rec[metric] = Math.hypot(pa.x, pa.y, pa.z);
                        break;
                    }
                    case 'pertAccEarth': {
                        const pe = u.perturbation?.acc?.earth || { x:0, y:0, z:0 };
                        rec[metric] = Math.hypot(pe.x, pe.y, pe.z);
                        break;
                    }
                    case 'pertAccMoon': {
                        const pm = u.perturbation?.acc?.moon || { x:0, y:0, z:0 };
                        rec[metric] = Math.hypot(pm.x, pm.y, pm.z);
                        break;
                    }
                    case 'pertAccSun': {
                        const ps = u.perturbation?.acc?.sun || { x:0, y:0, z:0 };
                        rec[metric] = Math.hypot(ps.x, ps.y, ps.z);
                        break;
                    }
                    default:
                        rec[metric] = metric in u ? u[metric] : u.elements?.[metric] ?? 0;
                }
            });
            return rec;
        });
    }, [simulationData, selectedSatId, selectedMetrics]);

    // Memoized event handlers for controls
    const handleMetricToggle = useCallback((metricKey) => {
        setSelectedMetrics(prev => 
            prev.includes(metricKey) 
                ? prev.filter(m => m !== metricKey) 
                : [...prev, metricKey]
        );
    }, []);

    const handleSatelliteChange = useCallback((newSatId) => {
        setSelectedSatId(newSatId);
    }, []);

    const handlePrimaryMetricChange = useCallback((metric) => {
        setPrimaryMetric(metric);
    }, []);

    const handleSecondaryMetricChange = useCallback((metric) => {
        setSecondaryMetric(metric);
    }, []);

    return (
        <DraggableModal
            title="Simulation Data"
            isOpen={isOpen}
            onClose={onClose}
            defaultWidth={600}
            defaultHeight={400}
            resizable={true}
            minWidth={300}
            minHeight={200}
            rightElement={<Button variant="ghost" size="icon" onClick={handleDownload}><Download className="h-4 w-4" /></Button>}
        >
            {isLoading ? (
                <div className="flex items-center justify-center h-full">
                    <Loader2 className="animate-spin" />
                </div>
            ) : (
                <div className="flex flex-col h-full text-[10px]">
                    {/* Controls row: Satellite & Axis selectors */}
                    <div className="flex items-center gap-2 px-2 py-1">
                        <span className="font-medium">Satellite:</span>
                        <Select value={selectedSatId} onValueChange={handleSatelliteChange}>
                            <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue placeholder="Sat" /></SelectTrigger>
                            <SelectContent className="z-[10001]">
                                <SelectGroup>
                                    {Object.keys(simulationData).map(id => (
                                        <SelectItem key={id} value={id} className="text-[10px]">Sat {id}</SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <span className="font-medium">Primary:</span>
                        <Select value={primaryMetric} onValueChange={handlePrimaryMetricChange}>
                            <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent className="z-[10001]">
                                <SelectGroup>
                                    {selectedMetrics.map(m => (
                                        <SelectItem key={m} value={m} className="text-[10px]">
                                            {metricsList.find(mt => mt.key === m)?.label}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <span className="font-medium">Secondary:</span>
                        <Select value={secondaryMetric} onValueChange={handleSecondaryMetricChange}>
                            <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent className="z-[10001]">
                                <SelectGroup>
                                    {selectedMetrics.map(m => (
                                        <SelectItem key={m} value={m} className="text-[10px]">
                                            {metricsList.find(mt => mt.key === m)?.label}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                    {/* Metric toggles */}
                    <div className="flex flex-wrap gap-2 p-2 text-[10px] font-medium">
                        {metricsList.map(metric => (
                            <label key={metric.key} className="inline-flex items-center gap-1">
                                <input
                                    type="checkbox"
                                    style={{ accentColor: metric.color }}
                                    checked={selectedMetrics.includes(metric.key)}
                                    onChange={() => handleMetricToggle(metric.key)}
                                />
                                <span>{metric.label}</span>
                            </label>
                        ))}
                    </div>
                    {/* Chart area */}
                    <div className="flex-1 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="time"
                                    type="number"
                                    scale="time"
                                    domain={["auto","auto"]}
                                    tick={false}
                                />
                                <YAxis
                                    yAxisId="left"
                                    domain={["auto","auto"]}
                                    tick={{ fontSize: 10 }}
                                    label={{ value: metricsList.find(m => m.key === primaryMetric)?.label, angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    domain={["auto","auto"]}
                                    tick={{ fontSize: 10 }}
                                />
                                {/* Invisible axes for any other selected metrics (to plot without ticks) */}
                                {selectedMetrics.filter(m => m !== primaryMetric && m !== secondaryMetric).map(m => (
                                    <YAxis key={m} yAxisId={m} hide={true} domain={["auto","auto"]} />
                                ))}
                                <Tooltip
                                    labelFormatter={time => new Date(time).toLocaleString()}
                                    contentStyle={{ fontSize: 10 }}
                                    labelStyle={{ fontSize: 10 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                {selectedMetrics.map(metric => (
                                    <Line
                                        key={metric}
                                        yAxisId={metric === primaryMetric ? 'left' : metric === secondaryMetric ? 'right' : metric}
                                        type="monotone"
                                        dataKey={metric}
                                        stroke={metricsList.find(mt => mt.key === metric)?.color}
                                        dot={false}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </DraggableModal>
    );
});

SimulationWindow.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
}; 