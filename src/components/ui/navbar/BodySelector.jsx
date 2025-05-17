import React, { useState } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';
import PropTypes from 'prop-types';

function BodySelector({ selectedBody, handleBodyChange, groupedPlanetOptions, getDisplayValue }) {
    const [expanded, setExpanded] = useState({});

    const toggleExpand = (planetValue) => {
        setExpanded(prev => ({ ...prev, [planetValue]: !prev[planetValue] }));
    };

    return (
        <Select value={selectedBody} onValueChange={handleBodyChange}>
            <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Select body">
                    {getDisplayValue(selectedBody)}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {groupedPlanetOptions.map(({ planet, moons }) => (
                    <React.Fragment key={planet.value}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            {moons.length > 0 && (
                                <button
                                    type="button"
                                    aria-label={expanded[planet.value] ? 'Collapse moons' : 'Expand moons'}
                                    onClick={e => { e.stopPropagation(); toggleExpand(planet.value); }}
                                    style={{ marginRight: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
                                    tabIndex={-1}
                                >
                                    {expanded[planet.value] ? '▼' : '▶'}
                                </button>
                            )}
                            <SelectItem value={planet.value}>{planet.text}</SelectItem>
                        </div>
                        {moons.length > 0 && expanded[planet.value] && (
                            moons.map(moon => (
                                <div key={moon.value} style={{ paddingLeft: 24, display: 'flex', alignItems: 'center', fontSize: 13, opacity: 0.85 }}>
                                    <SelectItem value={moon.value}>{moon.text}</SelectItem>
                                </div>
                            ))
                        )}
                    </React.Fragment>
                ))}
            </SelectContent>
        </Select>
    );
}

BodySelector.propTypes = {
    selectedBody: PropTypes.string.isRequired,
    handleBodyChange: PropTypes.func.isRequired,
    groupedPlanetOptions: PropTypes.arrayOf(
        PropTypes.shape({
            planet: PropTypes.shape({ value: PropTypes.string, text: PropTypes.string }).isRequired,
            moons: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, text: PropTypes.string })).isRequired,
        })
    ).isRequired,
    getDisplayValue: PropTypes.func.isRequired,
};

export default BodySelector; 