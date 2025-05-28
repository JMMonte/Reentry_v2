import React from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { Trash2 } from 'lucide-react'; // Icon for delete action

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
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-100 dark:bg-gray-800">
                            <th className="p-1 text-left">Node</th>
                            <th className="p-1 text-left">Time (UTC)</th>
                            <th className="p-1 text-left">T-</th>
                            <th className="p-1 text-left">ΔV (km/s)</th>
                            <th className="p-1 text-left">Period</th>
                            <th className="p-1 text-left">Velocity (km/s)</th>
                            <th className="p-1 text-left">Notes</th>
                            <th className="p-1 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {nodes.map((nodeModel, idx) => {
                            // Ensure time is a valid Date
                            const rawTime = nodeModel.time;
                            const time = rawTime instanceof Date && !isNaN(rawTime.getTime())
                                ? rawTime
                                : (currentSimTime instanceof Date ? currentSimTime : new Date());
                            const dv = nodeModel.worldDV.length();
                            const orbit = nodeModel.node3D.predictedOrbit;
                            const period = orbit?._orbitPeriod || 0;
                            const vel = orbit?._currentVelocity ? orbit._currentVelocity.length() / 1000 : 0;
                            const isSelected = selectedIndex === idx;
                            const tMinusMs = time.getTime() - (currentSimTime?.getTime?.() ?? Date.now());
                            const tMinus = (tMinusMs > 0 ? '-' : '+') + formatTimeDelta(Math.abs(tMinusMs));
                            return (
                                <tr
                                    key={idx}
                                    className={`hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${isSelected ? 'bg-yellow-100 dark:bg-yellow-900' : ''}`}
                                    onClick={() => onSelectNode(idx)}
                                >
                                    <td className="p-1">Burn {idx + 1}</td>
                                    <td className="p-1"><em>{time.toISOString()}</em></td>
                                    <td className="p-1 font-mono">T{tMinus}</td>
                                    <td className="p-1">{dv.toFixed(2)}</td>
                                    <td className="p-1">{formatTimeDelta(period * 1000)}</td>
                                    <td className="p-1">{vel.toFixed(2)}</td>
                                    <td className="p-1">Post-burn orbit</td>
                                    <td className="p-1 text-right">
                                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); onDeleteNode(idx); }} className="group">
                                            <Trash2 className="h-4 w-4 text-muted-foreground group-hover:text-red-500 transition-colors" />
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
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
                dv: nodeModel.worldDV.length(),
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
                dv: node3D.localDV.length(),
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
            <table className="w-full text-xs border-collapse">
                <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                        <th className="p-1 text-left">Node</th>
                        <th className="p-1 text-left">Time (UTC)</th>
                        <th className="p-1 text-left">T-</th>
                        <th className="p-1 text-left">ΔV (km/s)</th>
                        <th className="p-1 text-left">Period</th>
                        <th className="p-1 text-left">Velocity (km/s)</th>
                        <th className="p-1 text-left">Notes</th>
                        <th className="p-1 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {displayNodes.map((nd, i) => {
                        const period = nd.orbit?._orbitPeriod || 0;
                        const vel = nd.orbit?._currentVelocity ? nd.orbit._currentVelocity.length() / 1000 : 0;
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
                                <td className="p-1">Burn {i + 1}</td>
                                <td className="p-1">
                                    <em>{nd.time instanceof Date && !isNaN(nd.time.getTime())
                                        ? nd.time.toISOString()
                                        : ''}</em>
                                </td>
                                <td className="p-1 font-mono">T{tMinus}</td>
                                <td className="p-1">{nd.dv.toFixed(2)}</td>
                                <td className="p-1">{formatTimeDelta(period * 1000)}</td>
                                <td className="p-1">{vel.toFixed(2)}</td>
                                <td className="p-1">{nd.preview ? 'Preview orbit' : 'Post-burn orbit'}</td>
                                <td className="p-1 text-right">
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