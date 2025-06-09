import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react'; // Icons for delete action and expand/collapse

// Component to display orbital elements
function OrbitalElementsRow({ elements, centralBodyRadius = 6378 }) {
    if (!elements) {
        return (
            <tr className="bg-gray-50 dark:bg-gray-800">
                <td colSpan="8" className="p-2 text-sm text-muted-foreground">
                    No orbital data available
                </td>
            </tr>
        );
    }

    const formatDistance = (km) => {
        if (km > 1000000) return `${(km / 1000000).toFixed(2)} Mm`;
        if (km > 1000) return `${(km / 1000).toFixed(2)} Mm`;
        return `${km.toFixed(1)} km`;
    };

    const formatAltitude = (radius) => {
        const altitude = radius - centralBodyRadius;
        return formatDistance(altitude);
    };

    return (
        <tr className="bg-gray-50 dark:bg-gray-800 text-xs">
            <td className="p-2 text-muted-foreground">Orbit:</td>
            <td className="p-2">
                <span className="font-mono">
                    a: {formatDistance(elements.semiMajorAxis || 0)}
                </span>
            </td>
            <td className="p-2">
                <span className="font-mono">
                    e: {(elements.eccentricity || 0).toFixed(4)}
                </span>
            </td>
            <td className="p-2">
                <span className="font-mono">
                    i: {(elements.inclination || 0).toFixed(2)}°
                </span>
            </td>
            <td className="p-2">
                <span className="font-mono">
                    Pe: {formatAltitude(elements.periapsis || centralBodyRadius)}
                </span>
            </td>
            <td className="p-2">
                <span className="font-mono">
                    Ap: {formatAltitude(elements.apoapsis || centralBodyRadius)}
                </span>
            </td>
            <td className="p-2 text-muted-foreground">Post-burn elements</td>
            <td className="p-2"></td>
        </tr>
    );
}

OrbitalElementsRow.propTypes = {
    elements: PropTypes.shape({
        semiMajorAxis: PropTypes.number,
        eccentricity: PropTypes.number,
        inclination: PropTypes.number,
        periapsis: PropTypes.number,
        apoapsis: PropTypes.number
    }),
    centralBodyRadius: PropTypes.number
};

export function MissionPlanSection({
    nodes,
    previewNodes,
    selectedIndex,
    maneuverMode,
    formatTimeDelta,
    onSelectNode,
    onDeleteNode,
    onAddNewNode,
    onWizardClick,
    currentSimTime
}) {
    // State to track which rows are expanded to show orbital elements
    const [expandedRows, setExpandedRows] = useState(new Set());
    
    const toggleRowExpansion = (index) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedRows(newExpanded);
    };
    
    // Always show the mission plan table for manual and Hohmann modes
    
    // Manual mode: show add button and manual nodes
    if (maneuverMode === 'manual') {
        return (
            <>
                <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Mission Plan</span>
                    <div className="space-x-2">
                        <Button size="sm" variant="outline" onClick={onAddNewNode}>
                            + Add Maneuver Node
                        </Button>
                        <Button size="sm" variant="outline" onClick={onWizardClick}>
                            Maneuver Wizard
                        </Button>
                    </div>
                </div>
                <div className="overflow-x-auto border rounded">
                    <table className="min-w-full text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-800">
                                <th className="p-2 text-left whitespace-nowrap min-w-[20px]"></th>
                                <th className="p-2 text-left whitespace-nowrap min-w-[60px]">Node</th>
                                <th className="p-2 text-left whitespace-nowrap min-w-[160px]">Time (UTC)</th>
                                <th className="p-2 text-left whitespace-nowrap min-w-[80px]">T-</th>
                                <th className="p-2 text-left whitespace-nowrap min-w-[80px]">ΔV (km/s)</th>
                                <th className="p-2 text-left whitespace-nowrap min-w-[80px]">Period</th>
                                <th className="p-2 text-left whitespace-nowrap min-w-[120px]">Pe/Ap (km)</th>
                                <th className="p-2 text-left whitespace-nowrap min-w-[100px]">Notes</th>
                                <th className="p-2 text-right whitespace-nowrap min-w-[70px]">Actions</th>
                            </tr>
                        </thead>
                    <tbody>
                        {nodes.map((nodeModel, idx) => {
                            // Ensure time is a valid Date
                            const rawTime = nodeModel.time;
                            const time = rawTime instanceof Date && !isNaN(rawTime.getTime())
                                ? rawTime
                                : (currentSimTime instanceof Date ? currentSimTime : new Date());
                            const dv = Math.sqrt(nodeModel.worldDV.x * nodeModel.worldDV.x + nodeModel.worldDV.y * nodeModel.worldDV.y + nodeModel.worldDV.z * nodeModel.worldDV.z);
                            const orbit = nodeModel.node3D.predictedOrbit;
                            const elements = nodeModel.orbitalElements || orbit?.elements;
                            const period = elements?.period || 0;
                            
                            // Use physics-calculated altitudes
                            const periapsis = elements?.periapsisAltitude ? elements.periapsisAltitude.toFixed(0) : '---';
                            const apoapsis = elements?.apoapsisAltitude ? elements.apoapsisAltitude.toFixed(0) : '---';
                            const apsisDisplay = (periapsis !== '---' && apoapsis !== '---') ? 
                                `${periapsis}/${apoapsis}` : '---';
                            const isSelected = selectedIndex === idx;
                            const tMinusMs = time.getTime() - (currentSimTime?.getTime?.() ?? Date.now());
                            const tMinus = (tMinusMs > 0 ? '-' : '+') + formatTimeDelta(Math.abs(tMinusMs));
                            const isExpanded = expandedRows.has(idx);
                            
                            return (
                                <React.Fragment key={idx}>
                                    <tr
                                        className={`hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${isSelected ? 'bg-yellow-100 dark:bg-yellow-900' : ''}`}
                                        onClick={() => onSelectNode(idx)}
                                    >
                                        <td className="p-2 whitespace-nowrap">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={e => { e.stopPropagation(); toggleRowExpansion(idx); }}
                                                className="h-6 w-6"
                                            >
                                                {isExpanded ? 
                                                    <ChevronDown className="h-3 w-3" /> : 
                                                    <ChevronRight className="h-3 w-3" />
                                                }
                                            </Button>
                                        </td>
                                        <td className="p-2 whitespace-nowrap">Burn {idx + 1}</td>
                                        <td className="p-2 whitespace-nowrap"><em>{time.toISOString()}</em></td>
                                        <td className="p-2 font-mono whitespace-nowrap">T{tMinus}</td>
                                        <td className="p-2 whitespace-nowrap">{dv.toFixed(2)}</td>
                                        <td className="p-2 whitespace-nowrap">{formatTimeDelta(period * 1000)}</td>
                                        <td className="p-2 whitespace-nowrap">{apsisDisplay}</td>
                                        <td className="p-2 whitespace-nowrap">Post-burn orbit</td>
                                        <td className="p-2 text-right whitespace-nowrap">
                                            <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); onDeleteNode(idx); }} className="group">
                                                <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-red-500 transition-colors" />
                                            </Button>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <OrbitalElementsRow 
                                            elements={nodeModel.orbitalElements} 
                                            centralBodyRadius={6378} // TODO: Get actual central body radius
                                        />
                                    )}
                                </React.Fragment>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            </>
        );
    }
    
    // Hohmann mode: show preview or actual nodes
    
    // Determine which set to render: previews before generate, actuals after
    const displayNodes = [];
    if (Array.isArray(nodes) && nodes.length > 0) {
        // Actual maneuver nodes exist: show only those
        nodes.forEach((nodeModel, idx) => {
            displayNodes.push({
                time: nodeModel.time,
                dv: Math.sqrt(nodeModel.worldDV.x * nodeModel.worldDV.x + nodeModel.worldDV.y * nodeModel.worldDV.y + nodeModel.worldDV.z * nodeModel.worldDV.z),
                orbit: nodeModel.node3D.predictedOrbit,
                preview: false,
                idx
            });
        });
    } else if (Array.isArray(previewNodes) && previewNodes.length > 0) {
        // No actual nodes: show only previews
        previewNodes.forEach(node3D => {
            displayNodes.push({
                time: node3D.time,
                dv: Math.sqrt(node3D.localDV.x * node3D.localDV.x + node3D.localDV.y * node3D.localDV.y + node3D.localDV.z * node3D.localDV.z),
                orbit: node3D.predictedOrbit,
                preview: true,
                idx: null
            });
        });
    }
    if (displayNodes.length === 0) {
        return <div className="text-center text-muted-foreground py-4">No Hohmann maneuvers planned.</div>;
    }
    return (
        <>
            <div className="font-semibold mb-2">Mission Plan</div>
            <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-100 dark:bg-gray-800">
                            <th className="p-2 text-left whitespace-nowrap min-w-[60px]">Node</th>
                            <th className="p-2 text-left whitespace-nowrap min-w-[160px]">Time (UTC)</th>
                            <th className="p-2 text-left whitespace-nowrap min-w-[80px]">T-</th>
                            <th className="p-2 text-left whitespace-nowrap min-w-[80px]">ΔV (km/s)</th>
                            <th className="p-2 text-left whitespace-nowrap min-w-[80px]">Period</th>
                            <th className="p-2 text-left whitespace-nowrap min-w-[120px]">Pe/Ap (km)</th>
                            <th className="p-2 text-left whitespace-nowrap min-w-[100px]">Notes</th>
                            <th className="p-2 text-right whitespace-nowrap min-w-[70px]">Actions</th>
                        </tr>
                    </thead>
                <tbody>
                    {displayNodes.map((nd, i) => {
                        const period = nd.orbit?._orbitPeriod || 0;
                        const elements = nd.orbit?.elements;
                        const periapsis = elements?.periapsisAltitude ? elements.periapsisAltitude.toFixed(0) : '---';
                        const apoapsis = elements?.apoapsisAltitude ? elements.apoapsisAltitude.toFixed(0) : '---';
                        const apsisDisplay = (periapsis !== '---' && apoapsis !== '---') ? 
                            `${periapsis}/${apoapsis}` : '---';
                        const tMinusMs = nd.time.getTime() - (currentSimTime?.getTime?.() ?? Date.now());
                        const tMinus = (tMinusMs > 0 ? '-' : '+') + formatTimeDelta(Math.abs(tMinusMs));
                        return (
                            <tr
                                key={i}
                                className={!nd.preview && nd.idx === selectedIndex ? 'bg-yellow-100 dark:bg-yellow-900 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer' : (
                                    nd.preview ? '' : 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                                )}
                                onClick={!nd.preview && nd.idx != null ? () => onSelectNode(nd.idx) : undefined}
                            >
                                <td className="p-2 whitespace-nowrap">Burn {i + 1}</td>
                                <td className="p-2 whitespace-nowrap">
                                    <em>{nd.time instanceof Date && !isNaN(nd.time.getTime())
                                        ? nd.time.toISOString()
                                        : ''}</em>
                                </td>
                                <td className="p-2 font-mono whitespace-nowrap">T{tMinus}</td>
                                <td className="p-2 whitespace-nowrap">{nd.dv.toFixed(2)}</td>
                                <td className="p-2 whitespace-nowrap">{formatTimeDelta(period * 1000)}</td>
                                <td className="p-2 whitespace-nowrap">{apsisDisplay}</td>
                                <td className="p-2 whitespace-nowrap">{nd.preview ? 'Preview orbit' : 'Post-burn orbit'}</td>
                                <td className="p-2 text-right whitespace-nowrap">
                                    {!nd.preview && nd.idx != null && (
                                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); onDeleteNode(nd.idx); }} className="group">
                                            <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-red-500 transition-colors" />
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </>
    );
}

MissionPlanSection.propTypes = {
    nodes: PropTypes.array.isRequired,
    previewNodes: PropTypes.array,
    selectedIndex: PropTypes.number,
    maneuverMode: PropTypes.string,
    formatTimeDelta: PropTypes.func.isRequired,
    onSelectNode: PropTypes.func.isRequired,
    onDeleteNode: PropTypes.func.isRequired,
    onAddNewNode: PropTypes.func.isRequired,
    onWizardClick: PropTypes.func.isRequired,
    currentSimTime: PropTypes.instanceOf(Date)
};

export default MissionPlanSection; 