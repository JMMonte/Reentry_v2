import React, { useCallback, useMemo } from "react";
import { Input } from "../input";
import { cn } from "@/lib/utils";
import PropTypes from 'prop-types';

// Memoized input field component
const TimeInputField = React.memo(function TimeInputField({ 
  label, 
  value, 
  onChange, 
  min, 
  max, 
  padLength = 2,
  className 
}) {
  const handleChange = useCallback((e) => {
    onChange(e.target.value);
  }, [onChange]);

  const formattedValue = useMemo(() => {
    return String(value).padStart(padLength, '0');
  }, [value, padLength]);

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] text-muted-foreground font-mono">{label}</span>
      <Input
        type="number"
        value={formattedValue}
        onChange={handleChange}
        className={className}
        min={min}
        max={max}
      />
    </div>
  );
});

TimeInputField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  padLength: PropTypes.number,
  className: PropTypes.string
};

const TimeInput = React.memo(function TimeInput({
  hours,
  minutes,
  seconds,
  milliseconds,
  onTimeChange,
  className
}) {
  // Memoized change handlers to prevent recreation
  const handleHoursChange = useCallback((value) => {
    let numValue = parseInt(value) || 0;
    numValue = Math.max(0, Math.min(23, numValue));
    onTimeChange('hours', numValue);
  }, [onTimeChange]);

  const handleMinutesChange = useCallback((value) => {
    let numValue = parseInt(value) || 0;
    numValue = Math.max(0, Math.min(59, numValue));
    onTimeChange('minutes', numValue);
  }, [onTimeChange]);

  const handleSecondsChange = useCallback((value) => {
    let numValue = parseInt(value) || 0;
    numValue = Math.max(0, Math.min(59, numValue));
    onTimeChange('seconds', numValue);
  }, [onTimeChange]);

  const handleMillisecondsChange = useCallback((value) => {
    let numValue = parseInt(value) || 0;
    numValue = Math.max(0, Math.min(999, numValue));
    onTimeChange('milliseconds', numValue);
  }, [onTimeChange]);

  // Memoized CSS classes
  const inputClass = useMemo(() => 
    "w-[4ch] text-center font-mono p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
    []
  );

  const msInputClass = useMemo(() => 
    "w-[5ch] text-center font-mono p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
    []
  );

  return (
    <div className={cn("flex items-end space-x-1", className)}>
      <TimeInputField
        label="HH"
        value={hours}
        onChange={handleHoursChange}
        min={0}
        max={23}
        padLength={2}
        className={inputClass}
      />
      <span className="mb-2">:</span>
      <TimeInputField
        label="MM"
        value={minutes}
        onChange={handleMinutesChange}
        min={0}
        max={59}
        padLength={2}
        className={inputClass}
      />
      <span className="mb-2">:</span>
      <TimeInputField
        label="SS"
        value={seconds}
        onChange={handleSecondsChange}
        min={0}
        max={59}
        padLength={2}
        className={inputClass}
      />
      <span className="mb-2">.</span>
      <TimeInputField
        label="MS"
        value={milliseconds}
        onChange={handleMillisecondsChange}
        min={0}
        max={999}
        padLength={3}
        className={msInputClass}
      />
    </div>
  );
});

TimeInput.propTypes = {
  hours: PropTypes.number.isRequired,
  minutes: PropTypes.number.isRequired,
  seconds: PropTypes.number.isRequired,
  milliseconds: PropTypes.number.isRequired,
  onTimeChange: PropTypes.func.isRequired,
  className: PropTypes.string
};

export { TimeInput };
