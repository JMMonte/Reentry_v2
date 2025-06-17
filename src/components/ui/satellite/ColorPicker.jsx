import React, { useMemo, useCallback } from 'react';
import { Button } from '../button';
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import PropTypes from 'prop-types';

// ✅ OPTIMIZED PATTERN: Memoized color palette
const COLOR_PALETTE = [
  // Bright primary colors
  '#FF0000', '#FF4D00', '#FF9900', '#FFCC00', '#FFFF00',
  // Bright secondary colors
  '#00FF00', '#00FF99', '#00FFFF', '#00CCFF', '#0099FF',
  // Bright tertiary colors
  '#0000FF', '#4D00FF', '#9900FF', '#FF00FF', '#FF0099',
  // Bright neon colors
  '#FF1493', '#00FF7F', '#FF69B4', '#7FFF00', '#40E0D0',
  // Bright pastel colors
  '#FF99CC', '#99FF99', '#99FFFF', '#9999FF', '#FF99FF'
];

// ✅ OPTIMIZED PATTERN: Memoized ColorButton component
const ColorButton = React.memo(function ColorButton({ color, onClick, isSelected = false }) {
  const handleClick = useCallback(() => {
    onClick(parseInt(color.slice(1), 16));
  }, [color, onClick]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-6 w-6 p-0 border hover:border-ring ${
        isSelected ? 'border-ring ring-2 ring-ring' : 'border-border'
      }`}
      style={{ 
        backgroundColor: color,
        minWidth: '24px',
        minHeight: '24px'
      }}
      onClick={handleClick}
    />
  );
});

ColorButton.propTypes = {
  color: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  isSelected: PropTypes.bool
};

export const ColorPicker = React.memo(function ColorPicker({ color, onChange }) {
  // 1. MEMOIZED color conversion utility
  const getHexColor = useCallback((inputColor) => {
    if (typeof inputColor === 'number') {
      return '#' + inputColor.toString(16).padStart(6, '0').toUpperCase();
    }
    return inputColor;
  }, []);

  // 2. MEMOIZED display color
  const displayColor = useMemo(() => getHexColor(color), [color, getHexColor]);

  // 3. MEMOIZED color change handler
  const handleColorChange = useCallback((newColor) => {
    onChange(newColor);
  }, [onChange]);

  // 4. MEMOIZED color buttons with selection detection
  const colorButtons = useMemo(() => {
    return COLOR_PALETTE.map((c) => (
      <ColorButton
        key={c}
        color={c}
        onClick={handleColorChange}
        isSelected={displayColor === c}
      />
    ));
  }, [displayColor, handleColorChange]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="h-5 w-5 p-0 border border-border"
          style={{ 
            backgroundColor: displayColor,
            minWidth: '20px',
            minHeight: '20px'
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-[160px] p-1 z-[100000]" align="end">
        <div className="grid grid-cols-5 gap-1">
          {colorButtons}
        </div>
      </PopoverContent>
    </Popover>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return prevProps.color === nextProps.color && prevProps.onChange === nextProps.onChange;
});

ColorPicker.propTypes = {
  color: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]).isRequired,
  onChange: PropTypes.func.isRequired
};
