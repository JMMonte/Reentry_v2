import React from "react";
import { Input } from "../Input";
import { cn } from "../../../lib/Utils";

const TimeInput = ({
  hours,
  minutes,
  seconds,
  milliseconds,
  onTimeChange,
  className
}) => {
  const handleChange = (type, value) => {
    let numValue = parseInt(value) || 0;

    // Clamp values to valid ranges
    switch (type) {
      case 'hours':
        numValue = Math.max(0, Math.min(23, numValue));
        break;
      case 'minutes':
      case 'seconds':
        numValue = Math.max(0, Math.min(59, numValue));
        break;
      case 'milliseconds':
        numValue = Math.max(0, Math.min(999, numValue));
        break;
    }

    onTimeChange(type, numValue);
  };

  const inputClass = "w-[4ch] text-center font-mono p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
  const msInputClass = "w-[5ch] text-center font-mono p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
  const labelClass = "text-[10px] text-muted-foreground font-mono";

  return (
    <div className={cn("flex items-end space-x-1", className)}>
      <div className="flex flex-col items-center">
        <span className={labelClass}>HH</span>
        <Input
          type="number"
          value={String(hours).padStart(2, '0')}
          onChange={(e) => handleChange('hours', e.target.value)}
          className={inputClass}
          min={0}
          max={23}
        />
      </div>
      <span className="mb-2">:</span>
      <div className="flex flex-col items-center">
        <span className={labelClass}>MM</span>
        <Input
          type="number"
          value={String(minutes).padStart(2, '0')}
          onChange={(e) => handleChange('minutes', e.target.value)}
          className={inputClass}
          min={0}
          max={59}
        />
      </div>
      <span className="mb-2">:</span>
      <div className="flex flex-col items-center">
        <span className={labelClass}>SS</span>
        <Input
          type="number"
          value={String(seconds).padStart(2, '0')}
          onChange={(e) => handleChange('seconds', e.target.value)}
          className={inputClass}
          min={0}
          max={59}
        />
      </div>
      <span className="mb-2">.</span>
      <div className="flex flex-col items-center">
        <span className={labelClass}>MS</span>
        <Input
          type="number"
          value={String(milliseconds).padStart(3, '0')}
          onChange={(e) => handleChange('milliseconds', e.target.value)}
          className={msInputClass}
          min={0}
          max={999}
        />
      </div>
    </div>
  );
};

export { TimeInput };
