import React from 'react';
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/Utils";

const CalendarNavigation = ({ 
  displayDate,
  onPrevMonth,
  onNextMonth,
  onViewChange,
  className
}) => {

  // Simple click handlers for debugging
  const handleClick = (action) => (e) => {
    e.preventDefault();
    e.stopPropagation();

    switch(action) {
      case 'PREV':
        onPrevMonth?.();
        break;
      case 'NEXT':
        onNextMonth?.();
        break;
      case 'VIEW':
        onViewChange?.();
        break;
    }
  };

  return (
    <div 
      className={cn("flex justify-between items-center px-2", className)}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={handleClick('PREV')}
        className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-accent rounded-md flex items-center justify-center"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={handleClick('VIEW')}
        className="flex-1 text-center text-sm font-medium cursor-pointer hover:bg-accent hover:text-accent-foreground rounded px-2 py-1"
      >
        {displayDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
      </button>

      <button
        type="button"
        onClick={handleClick('NEXT')}
        className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-accent rounded-md flex items-center justify-center"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
};

export { CalendarNavigation };
