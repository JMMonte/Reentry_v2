import React from 'react';
import PropTypes from 'prop-types';
import { Button } from '../button';
import { Plus } from 'lucide-react';

export function ManeuverNodeList({ nodes, selectedIndex, onSelect, onNew, currentSimTime, formatTimeDelta }) {
    return (
        <div className="w-1/3 border-r p-2 overflow-auto">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold">Nodes</span>
                <Button size="icon" variant="ghost" onClick={onNew} title="New Node">
                    <Plus className="w-4 h-4" />
                </Button>
            </div>
            {nodes.length === 0 ? (
                <div className="text-xs text-muted-foreground">No maneuvers</div>
            ) : (
                nodes.map((node, i) => (
                    <div key={i}
                        className={`p-1 mb-1 text-xs cursor-pointer rounded ${selectedIndex === i ? 'bg-accent/30' : 'hover:bg-accent/10'}`}
                        onClick={() => onSelect(i)}
                    >
                        <div>{node.time.toISOString()}</div>
                        <div>ΔV: {node.deltaV.x.toFixed(1)},{node.deltaV.y.toFixed(1)},{node.deltaV.z.toFixed(1)}</div>
                        <div className="text-[10px] text-muted-foreground">
                            In: {formatTimeDelta(node.time.getTime() - currentSimTime.getTime())}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

ManeuverNodeList.propTypes = {
    nodes: PropTypes.array.isRequired,
    selectedIndex: PropTypes.number,
    onSelect: PropTypes.func.isRequired,
    onNew: PropTypes.func.isRequired,
    currentSimTime: PropTypes.instanceOf(Date).isRequired,
    formatTimeDelta: PropTypes.func.isRequired
}; 