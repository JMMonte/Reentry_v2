import React, { useState, useMemo, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { Trash2, ChevronDown, ChevronRight, Route } from 'lucide-react'; // Icons for delete action and expand/collapse

// Memoized component to display orbital elements
const OrbitalElementsRow = React.memo(function OrbitalElementsRow({ elements, centralBodyRadius = 6378 }) {
    // Format functions to prevent recreation
    const formatters = useMemo(() => ({
        formatDistance: (km) => {
            if (km > 1000000) return `${(km / 1000000).toFixed(2)} Mm`;
            if (km > 1000) return `${(km / 1000).toFixed(2)} Mm`;
            return `${km.toFixed(1)} km`;
        },
        formatAltitude: (radius) => {
            const altitude = radius - centralBodyRadius;
            return radius ? `${(altitude > 1000000) ? (altitude / 1000000).toFixed(2) + ' Mm' :
                (altitude > 1000) ? (altitude / 1000).toFixed(2) + ' Mm' :
                    altitude.toFixed(1) + ' km'}` : '---';
        }
    }), [centralBodyRadius]);

    // Orbital data processing
    const processedElements = useMemo(() => {
        if (!elements) return null;

        return {
            semiMajorAxis: formatters.formatDistance(elements.semiMajorAxis || 0),
            eccentricity: (elements.eccentricity || 0).toFixed(4),
            inclination: (elements.inclination || 0).toFixed(2),
            periapsis: formatters.formatAltitude(elements.periapsis || centralBodyRadius),
            apoapsis: formatters.formatAltitude(elements.apoapsis || centralBodyRadius)
        };
    }, [elements, centralBodyRadius, formatters]);

    if (!elements) {
        return (
            <tr className="bg-gray-50 dark:bg-gray-800">
                <td colSpan="8" className="p-2 text-sm text-muted-foreground">
                    No orbital data available
                </td>
            </tr>
        );
    }

    return (
        <tr className="bg-gray-50 dark:bg-gray-800 text-xs">
            <td className="p-2 text-muted-foreground">Orbit:</td>
            <td className="p-2">
                <span className="font-mono">a: {processedElements.semiMajorAxis}</span>
            </td>
            <td className="p-2">
                <span className="font-mono">e: {processedElements.eccentricity}</span>
            </td>
            <td className="p-2">
                <span className="font-mono">i: {processedElements.inclination}°</span>
            </td>
            <td className="p-2">
                <span className="font-mono">Pe: {processedElements.periapsis}</span>
            </td>
            <td className="p-2">
                <span className="font-mono">Ap: {processedElements.apoapsis}</span>
            </td>
            <td className="p-2 text-muted-foreground">Post-burn elements</td>
            <td className="p-2"></td>
        </tr>
    );
}, (prevProps, nextProps) => {
    // Custom comparison: Prevent re-renders on shallow element changes
    return (
        prevProps.centralBodyRadius === nextProps.centralBodyRadius &&
        prevProps.elements?.semiMajorAxis === nextProps.elements?.semiMajorAxis &&
        prevProps.elements?.eccentricity === nextProps.elements?.eccentricity &&
        prevProps.elements?.inclination === nextProps.elements?.inclination &&
        prevProps.elements?.periapsis === nextProps.elements?.periapsis &&
        prevProps.elements?.apoapsis === nextProps.elements?.apoapsis
    );
});

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

// Memoized node row component
const NodeTableRow = React.memo(function NodeTableRow({
    nodeModel,
    index,
    isSelected,
    isExpanded,
    currentSimTime,
    formatTimeDelta,
    onSelectNode,
    onDeleteNode,
    onToggleExpansion
}) {
    // Cache expensive calculations
    const calculationCacheRef = useRef({});
    const lastNodeDataRef = useRef(null);

    // Node processing with change detection
    const processedNode = useMemo(() => {
        if (!nodeModel) return null;

        // Create cache key for change detection
        const nodeKey = `${nodeModel.time?.getTime()}-${nodeModel.worldDV?.x}-${nodeModel.worldDV?.y}-${nodeModel.worldDV?.z}`;

        // Use cached result if data hasn't changed
        if (lastNodeDataRef.current === nodeKey && calculationCacheRef.current.processedNode) {
            return calculationCacheRef.current.processedNode;
        }

        // Ensure time is a valid Date
        const rawTime = nodeModel.time;
        const time = rawTime instanceof Date && !isNaN(rawTime.getTime())
            ? rawTime
            : (currentSimTime instanceof Date ? currentSimTime : new Date());

        // Calculate delta-V magnitude
        const dv = Math.sqrt(
            nodeModel.worldDV.x * nodeModel.worldDV.x +
            nodeModel.worldDV.y * nodeModel.worldDV.y +
            nodeModel.worldDV.z * nodeModel.worldDV.z
        );

        const orbit = nodeModel.node3D.predictedOrbit;
        const elements = nodeModel.orbitalElements || orbit?.elements;
        const period = elements?.period || 0;

        // Use physics-calculated altitudes
        const periapsis = elements?.periapsisAltitude ? elements.periapsisAltitude.toFixed(0) : '---';
        const apoapsis = elements?.apoapsisAltitude ? elements.apoapsisAltitude.toFixed(0) : '---';
        const apsisDisplay = (periapsis !== '---' && apoapsis !== '---') ?
            `${periapsis}/${apoapsis}` : '---';

        const tMinusMs = time.getTime() - (currentSimTime?.getTime?.() ?? Date.now());
        const tMinus = (tMinusMs > 0 ? '-' : '+') + formatTimeDelta(Math.abs(tMinusMs));

        const result = {
            time,
            dv,
            period,
            apsisDisplay,
            tMinus,
            elements: nodeModel.orbitalElements,
            centralBodyRadius: nodeModel.centralBodyRadius || 6378
        };

        // Cache the result
        lastNodeDataRef.current = nodeKey;
        calculationCacheRef.current.processedNode = result;

        return result;
    }, [nodeModel, currentSimTime, formatTimeDelta]);

    // Event handlers
    const handleRowClick = useCallback(() => {
        onSelectNode(index);
    }, [onSelectNode, index]);

    const handleDeleteClick = useCallback((e) => {
        e.stopPropagation();
        onDeleteNode(index);
    }, [onDeleteNode, index]);

    const handleToggleClick = useCallback((e) => {
        e.stopPropagation();
        onToggleExpansion(index);
    }, [onToggleExpansion, index]);

    if (!processedNode) return null;

    return (
        <React.Fragment key={index}>
            <tr
                className={`hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${isSelected ? 'bg-yellow-100 dark:bg-yellow-900' : ''}`}
                onClick={handleRowClick}
            >
                <td className="p-2 whitespace-nowrap">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleToggleClick}
                        className="h-6 w-6"
                    >
                        {isExpanded ?
                            <ChevronDown className="h-3 w-3" /> :
                            <ChevronRight className="h-3 w-3" />
                        }
                    </Button>
                </td>
                <td className="p-2 whitespace-nowrap">Burn {index + 1}</td>
                <td className="p-2 whitespace-nowrap"><em>{processedNode.time.toISOString()}</em></td>
                <td className="p-2 font-mono whitespace-nowrap">T{processedNode.tMinus}</td>
                <td className="p-2 whitespace-nowrap">{processedNode.dv.toFixed(2)}</td>
                <td className="p-2 whitespace-nowrap">{formatTimeDelta(processedNode.period * 1000)}</td>
                <td className="p-2 whitespace-nowrap">{processedNode.apsisDisplay}</td>
                <td className="p-2 whitespace-nowrap">Post-burn orbit</td>
                <td className="p-2 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={handleDeleteClick} className="group">
                        <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-red-500 transition-colors" />
                    </Button>
                </td>
            </tr>
            {isExpanded && (
                <OrbitalElementsRow
                    elements={processedNode.elements}
                    centralBodyRadius={processedNode.centralBodyRadius}
                />
            )}
        </React.Fragment>
    );
}, (prevProps, nextProps) => {
    // Custom comparison: Prevent unnecessary re-renders
    return (
        prevProps.index === nextProps.index &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isExpanded === nextProps.isExpanded &&
        prevProps.nodeModel?.time?.getTime() === nextProps.nodeModel?.time?.getTime() &&
        prevProps.nodeModel?.worldDV?.x === nextProps.nodeModel?.worldDV?.x &&
        prevProps.nodeModel?.worldDV?.y === nextProps.nodeModel?.worldDV?.y &&
        prevProps.nodeModel?.worldDV?.z === nextProps.nodeModel?.worldDV?.z &&
        prevProps.currentSimTime?.getTime() === nextProps.currentSimTime?.getTime()
    );
});

NodeTableRow.propTypes = {
    nodeModel: PropTypes.object.isRequired,
    index: PropTypes.number.isRequired,
    isSelected: PropTypes.bool.isRequired,
    isExpanded: PropTypes.bool.isRequired,
    currentSimTime: PropTypes.instanceOf(Date),
    formatTimeDelta: PropTypes.func.isRequired,
    onSelectNode: PropTypes.func.isRequired,
    onDeleteNode: PropTypes.func.isRequired,
    onToggleExpansion: PropTypes.func.isRequired
};

// Main component with comprehensive memoization
export const MissionPlanSection = React.memo(function MissionPlanSection({
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
    // Cache expensive calculations and prevent state churn
    const lastNodesRef = useRef(null);
    const lastPreviewNodesRef = useRef(null);
    const processedDataRef = useRef({});

    // State to track which rows are expanded to show orbital elements
    const [expandedRows, setExpandedRows] = useState(new Set());

    // Toggle row expansion handler
    const toggleRowExpansion = useCallback((index) => {
        setExpandedRows(prev => {
            const newExpanded = new Set(prev);
            if (newExpanded.has(index)) {
                newExpanded.delete(index);
            } else {
                newExpanded.add(index);
            }
            return newExpanded;
        });
    }, []);

    // Button handlers
    const buttonHandlers = useMemo(() => ({
        onAddNewNode: onAddNewNode,
        onWizardClick: onWizardClick
    }), [onAddNewNode, onWizardClick]);

    // Display nodes with change detection and caching
    const displayNodes = useMemo(() => {
        const nodesKey = JSON.stringify(nodes?.map(n => ({
            time: n.time?.getTime(),
            worldDV: n.worldDV
        })));
        const previewKey = JSON.stringify(previewNodes?.map(n => ({
            time: n.time?.getTime(),
            localDV: n.localDV
        })));

        // Use cached result if data hasn't changed
        if (lastNodesRef.current === nodesKey &&
            lastPreviewNodesRef.current === previewKey &&
            processedDataRef.current.displayNodes) {
            return processedDataRef.current.displayNodes;
        }

        const result = [];

        if (Array.isArray(nodes) && nodes.length > 0) {
            // Actual maneuver nodes exist: show only those
            nodes.forEach((nodeModel, idx) => {
                result.push({
                    time: nodeModel.time,
                    dv: Math.sqrt(
                        nodeModel.worldDV.x * nodeModel.worldDV.x +
                        nodeModel.worldDV.y * nodeModel.worldDV.y +
                        nodeModel.worldDV.z * nodeModel.worldDV.z
                    ),
                    orbit: nodeModel.node3D.predictedOrbit,
                    preview: false,
                    idx,
                    nodeModel
                });
            });
        } else if (Array.isArray(previewNodes) && previewNodes.length > 0) {
            // No actual nodes: show only previews
            previewNodes.forEach(node3D => {
                result.push({
                    time: node3D.time,
                    dv: Math.sqrt(
                        node3D.localDV.x * node3D.localDV.x +
                        node3D.localDV.y * node3D.localDV.y +
                        node3D.localDV.z * node3D.localDV.z
                    ),
                    orbit: node3D.predictedOrbit,
                    preview: true,
                    idx: null
                });
            });
        }

        // Cache the result
        lastNodesRef.current = nodesKey;
        lastPreviewNodesRef.current = previewKey;
        processedDataRef.current.displayNodes = result;

        return result;
    }, [nodes, previewNodes]);

    // Always show the mission plan table for manual and Hohmann modes

    // Manual mode: show add button and manual nodes
    if (maneuverMode === 'manual') {
        return (
            <>
                <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold">Mission Plan</span>
                    <div className="space-x-2">
                        <Button size="sm" variant="outline" onClick={buttonHandlers.onAddNewNode}>
                            <Route className="h-4 w-4 mr-1" />
                            Add Maneuver Node
                        </Button>
                        <Button size="sm" variant="outline" onClick={buttonHandlers.onWizardClick}>
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
                            {nodes.map((nodeModel, idx) => (
                                <NodeTableRow
                                    key={`node-${idx}-${nodeModel.time?.getTime()}`}
                                    nodeModel={nodeModel}
                                    index={idx}
                                    isSelected={selectedIndex === idx}
                                    isExpanded={expandedRows.has(idx)}
                                    currentSimTime={currentSimTime}
                                    formatTimeDelta={formatTimeDelta}
                                    onSelectNode={onSelectNode}
                                    onDeleteNode={onDeleteNode}
                                    onToggleExpansion={toggleRowExpansion}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </>
        );
    }

    // Hohmann mode: show preview or actual nodes
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
                            // Inline calculations for Hohmann nodes
                            const rawTime = nd.time;
                            const time = rawTime instanceof Date && !isNaN(rawTime.getTime())
                                ? rawTime
                                : (currentSimTime instanceof Date ? currentSimTime : new Date());
                            const orbit = nd.orbit;
                            const elements = orbit?.elements;
                            const period = elements?.period || 0;

                            const periapsis = elements?.periapsisAltitude ? elements.periapsisAltitude.toFixed(0) : '---';
                            const apoapsis = elements?.apoapsisAltitude ? elements.apoapsisAltitude.toFixed(0) : '---';
                            const apsisDisplay = (periapsis !== '---' && apoapsis !== '---') ?
                                `${periapsis}/${apoapsis}` : '---';

                            const tMinusMs = time.getTime() - (currentSimTime?.getTime?.() ?? Date.now());
                            const tMinus = (tMinusMs > 0 ? '-' : '+') + formatTimeDelta(Math.abs(tMinusMs));

                            return (
                                <tr
                                    key={`preview-${i}-${time.getTime()}`}
                                    className={nd.preview ? 'bg-blue-50 dark:bg-blue-950 italic' : ''}
                                >
                                    <td className="p-2 whitespace-nowrap">
                                        {nd.preview ? 'Preview' : 'Burn'} {i + 1}
                                    </td>
                                    <td className="p-2 whitespace-nowrap">
                                        <em>{time.toISOString()}</em>
                                    </td>
                                    <td className="p-2 font-mono whitespace-nowrap">T{tMinus}</td>
                                    <td className="p-2 whitespace-nowrap">{nd.dv.toFixed(2)}</td>
                                    <td className="p-2 whitespace-nowrap">{formatTimeDelta(period * 1000)}</td>
                                    <td className="p-2 whitespace-nowrap">{apsisDisplay}</td>
                                    <td className="p-2 whitespace-nowrap">
                                        {nd.preview ? 'Preview orbit' : 'Post-burn orbit'}
                                    </td>
                                    <td className="p-2 text-right whitespace-nowrap">
                                        {!nd.preview && nd.idx !== null && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteNode(nd.idx);
                                                }}
                                                className="group"
                                            >
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
}, (prevProps, nextProps) => {
    // Custom comparison: Prevent re-renders on shallow changes
    return (
        prevProps.maneuverMode === nextProps.maneuverMode &&
        prevProps.selectedIndex === nextProps.selectedIndex &&
        prevProps.nodes?.length === nextProps.nodes?.length &&
        prevProps.previewNodes?.length === nextProps.previewNodes?.length &&
        prevProps.currentSimTime?.getTime() === nextProps.currentSimTime?.getTime() &&
        prevProps.formatTimeDelta === nextProps.formatTimeDelta &&
        prevProps.onSelectNode === nextProps.onSelectNode &&
        prevProps.onDeleteNode === nextProps.onDeleteNode &&
        prevProps.onAddNewNode === nextProps.onAddNewNode &&
        prevProps.onWizardClick === nextProps.onWizardClick
    );
});

MissionPlanSection.propTypes = {
    nodes: PropTypes.array,
    previewNodes: PropTypes.array,
    selectedIndex: PropTypes.number,
    maneuverMode: PropTypes.string.isRequired,
    formatTimeDelta: PropTypes.func.isRequired,
    onSelectNode: PropTypes.func.isRequired,
    onDeleteNode: PropTypes.func.isRequired,
    onAddNewNode: PropTypes.func.isRequired,
    onWizardClick: PropTypes.func.isRequired,
    currentSimTime: PropTypes.instanceOf(Date)
};

export default MissionPlanSection; 