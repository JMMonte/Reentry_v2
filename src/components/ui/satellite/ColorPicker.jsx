import React from 'react';
import { Button } from '../button';
import { Popover, PopoverContent, PopoverTrigger } from "../popover";

export function ColorPicker({ color, onChange }) {
  const colors = [
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

  // Convert numeric color to hex if needed
  const getHexColor = (inputColor) => {
    if (typeof inputColor === 'number') {
      return '#' + inputColor.toString(16).padStart(6, '0').toUpperCase();
    }
    return inputColor;
  };

  const displayColor = getHexColor(color);

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
      <PopoverContent className="w-[160px] p-1" align="end">
        <div className="grid grid-cols-5 gap-1">
          {colors.map((c) => (
            <Button
              key={c}
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 border border-border hover:border-ring"
              style={{ 
                backgroundColor: c,
                minWidth: '24px',
                minHeight: '24px'
              }}
              onClick={() => onChange(parseInt(c.slice(1), 16))}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
