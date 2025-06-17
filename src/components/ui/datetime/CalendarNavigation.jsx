import React, { useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import PropTypes from 'prop-types';

// Memoized navigation button component
const NavigationButton = React.memo(function NavigationButton({ 
  onClick, 
  children, 
  className,
  type = "button" 
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
});

NavigationButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string.isRequired,
  type: PropTypes.string
};

const CalendarNavigation = React.memo(function CalendarNavigation({ 
  displayDate,
  onPrevMonth,
  onNextMonth,
  onViewChange,
  className
}) {
  // Memoized display text to prevent recreation
  const displayText = useMemo(() => {
    return displayDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [displayDate]);

  // Memoized click handlers to prevent recreation
  const handlePrevClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onPrevMonth?.();
  }, [onPrevMonth]);

  const handleNextClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onNextMonth?.();
  }, [onNextMonth]);

  const handleViewClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onViewChange?.();
  }, [onViewChange]);

  const handleContainerClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  // Memoized CSS classes
  const navButtonClass = useMemo(() => 
    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-accent rounded-md flex items-center justify-center",
    []
  );

  const viewButtonClass = useMemo(() => 
    "flex-1 text-center text-sm font-medium cursor-pointer hover:bg-accent hover:text-accent-foreground rounded px-2 py-1",
    []
  );

  return (
    <div 
      className={cn("flex justify-between items-center px-2", className)}
      onClick={handleContainerClick}
    >
      <NavigationButton
        onClick={handlePrevClick}
        className={navButtonClass}
      >
        <ChevronLeft className="h-4 w-4" />
      </NavigationButton>

      <NavigationButton
        onClick={handleViewClick}
        className={viewButtonClass}
      >
        {displayText}
      </NavigationButton>

      <NavigationButton
        onClick={handleNextClick}
        className={navButtonClass}
      >
        <ChevronRight className="h-4 w-4" />
      </NavigationButton>
    </div>
  );
});

CalendarNavigation.propTypes = {
  displayDate: PropTypes.instanceOf(Date).isRequired,
  onPrevMonth: PropTypes.func.isRequired,
  onNextMonth: PropTypes.func.isRequired,
  onViewChange: PropTypes.func.isRequired,
  className: PropTypes.string
};

export { CalendarNavigation };
