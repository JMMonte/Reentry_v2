import React from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectSeparator } from '../select';
import PropTypes from 'prop-types';

function BodySelector({ selectedBody, handleBodyChange, satelliteOptions, getDisplayValue }) {
    return (
        <Select value={selectedBody} onValueChange={handleBodyChange}>
            <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Select body">
                    {getDisplayValue(selectedBody)}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="earth">Earth</SelectItem>
                <SelectItem value="moon">Moon</SelectItem>
                {satelliteOptions.length > 0 && (
                    <>
                        <SelectSeparator />
                        {satelliteOptions.map(({ value, text }) => (
                            <SelectItem key={value} value={value}>{text}</SelectItem>
                        ))}
                    </>
                )}
            </SelectContent>
        </Select>
    );
}

BodySelector.propTypes = {
    selectedBody: PropTypes.string.isRequired,
    handleBodyChange: PropTypes.func.isRequired,
    satelliteOptions: PropTypes.array.isRequired,
    getDisplayValue: PropTypes.func.isRequired,
};

export default BodySelector; 