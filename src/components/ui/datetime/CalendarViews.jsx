import React, { useCallback, useMemo } from 'react';
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { CalendarNavigation } from './CalendarNavigation';
import PropTypes from 'prop-types';

const VIEWS = {
  DAYS: 'days',
  MONTHS: 'months',
  YEARS: 'years'
};

// Memoized months data generation
const generateMonthsData = (displayDate) => {
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(displayDate);
    date.setMonth(i);
    return {
      index: i,
      name: date.toLocaleString('default', { month: 'short' })
    };
  });
};

// Memoized years data generation
const generateYearsData = (currentYear) => {
  const startYear = currentYear - 4;
  return Array.from({ length: 9 }, (_, i) => startYear + i);
};

// Memoized month button component
const MonthButton = React.memo(function MonthButton({ month, isSelected, onSelect }) {
  const handleClick = useCallback(() => {
    onSelect(month.index);
  }, [month.index, onSelect]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        "text-sm p-2 rounded-md",
        "hover:bg-accent hover:text-accent-foreground",
        isSelected && "bg-primary text-primary-foreground"
      )}
    >
      {month.name}
    </button>
  );
});

MonthButton.propTypes = {
  month: PropTypes.shape({
    index: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired
  }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired
};

// Memoized year button component
const YearButton = React.memo(function YearButton({ year, isSelected, onSelect }) {
  const handleClick = useCallback(() => {
    onSelect(year);
  }, [year, onSelect]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        "text-sm p-2 rounded-md",
        "hover:bg-accent hover:text-accent-foreground",
        isSelected && "bg-primary text-primary-foreground"
      )}
    >
      {year}
    </button>
  );
});

YearButton.propTypes = {
  year: PropTypes.number.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired
};

const MonthsView = React.memo(function MonthsView({ displayDate, onMonthSelect }) {
  // Memoize months data to prevent regeneration
  const months = useMemo(() => generateMonthsData(displayDate), [displayDate]);
  const currentMonth = displayDate.getMonth();

  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {months.map((month) => (
        <MonthButton
          key={month.index}
          month={month}
          isSelected={currentMonth === month.index}
          onSelect={onMonthSelect}
        />
      ))}
    </div>
  );
});

MonthsView.propTypes = {
  displayDate: PropTypes.instanceOf(Date).isRequired,
  onMonthSelect: PropTypes.func.isRequired
};

const YearsView = React.memo(function YearsView({ displayDate, onYearSelect }) {
  const currentYear = displayDate.getFullYear();
  
  // Memoize years data to prevent regeneration
  const years = useMemo(() => generateYearsData(currentYear), [currentYear]);

  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {years.map((year) => (
        <YearButton
          key={year}
          year={year}
          isSelected={currentYear === year}
          onSelect={onYearSelect}
        />
      ))}
    </div>
  );
});

YearsView.propTypes = {
  displayDate: PropTypes.instanceOf(Date).isRequired,
  onYearSelect: PropTypes.func.isRequired
};

// Memoized DayPicker component
const MemoizedDayPicker = React.memo(function MemoizedDayPicker({ 
  selectedDate, 
  displayDate, 
  onDaySelect, 
  className 
}) {
  return (
    <DayPicker
      mode="single"
      selected={selectedDate}
      month={displayDate}
      onSelect={onDaySelect}
      showOutsideDays
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center hidden",
        caption_label: "text-sm font-medium hidden",
        nav: "space-x-1 flex items-center hidden",
        nav_button: cn(
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-accent rounded-md hidden"
        ),
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
          "hover:bg-accent hover:text-accent-foreground",
          "focus:bg-accent focus:text-accent-foreground focus:outline-none",
          "aria-selected:bg-primary aria-selected:text-primary-foreground"
        ),
      }}
    />
  );
});

MemoizedDayPicker.propTypes = {
  selectedDate: PropTypes.instanceOf(Date),
  displayDate: PropTypes.instanceOf(Date).isRequired,
  onDaySelect: PropTypes.func.isRequired,
  className: PropTypes.string
};

const CalendarViews = React.memo(function CalendarViews({
  view,
  displayDate,
  selectedDate,
  onDaySelect,
  onMonthSelect,
  onYearSelect,
  onPrevMonth,
  onNextMonth,
  onViewChange,
  className
}) {
  // Memoized view rendering to prevent unnecessary calculations
  const renderedView = useMemo(() => {
    switch (view) {
      case VIEWS.MONTHS:
        return (
          <MonthsView displayDate={displayDate} onMonthSelect={onMonthSelect} />
        );
      case VIEWS.YEARS:
        return (
          <YearsView displayDate={displayDate} onYearSelect={onYearSelect} />
        );
      default: // DAYS view
        return (
          <MemoizedDayPicker
            selectedDate={selectedDate}
            displayDate={displayDate}
            onDaySelect={onDaySelect}
            className={className}
          />
        );
    }
  }, [view, displayDate, selectedDate, onDaySelect, onMonthSelect, onYearSelect, className]);

  return (
    <div className="space-y-4">
      <CalendarNavigation
        displayDate={displayDate}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onViewChange={onViewChange}
      />
      {renderedView}
    </div>
  );
});

CalendarViews.propTypes = {
  view: PropTypes.string.isRequired,
  displayDate: PropTypes.instanceOf(Date).isRequired,
  selectedDate: PropTypes.instanceOf(Date),
  onDaySelect: PropTypes.func.isRequired,
  onMonthSelect: PropTypes.func.isRequired,
  onYearSelect: PropTypes.func.isRequired,
  onPrevMonth: PropTypes.func.isRequired,
  onNextMonth: PropTypes.func.isRequired,
  onViewChange: PropTypes.func.isRequired,
  className: PropTypes.string
};

export { VIEWS };
export { CalendarViews };
