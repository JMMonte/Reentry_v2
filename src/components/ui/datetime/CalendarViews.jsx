import React from 'react';
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { CalendarNavigation } from './CalendarNavigation';
import PropTypes from 'prop-types';

const VIEWS = {
  DAYS: 'days',
  MONTHS: 'months',
  YEARS: 'years'
};

const MonthsView = ({ displayDate, onMonthSelect }) => {
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(displayDate);
    date.setMonth(i);
    return {
      index: i,
      name: date.toLocaleString('default', { month: 'short' })
    };
  });

  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {months.map(({ index, name }) => (
        <button
          key={index}
          onClick={() => onMonthSelect(index)}
          className={cn(
            "text-sm p-2 rounded-md",
            "hover:bg-accent hover:text-accent-foreground",
            displayDate.getMonth() === index && "bg-primary text-primary-foreground"
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
};

MonthsView.propTypes = {
  displayDate: PropTypes.instanceOf(Date).isRequired,
  onMonthSelect: PropTypes.func.isRequired
};

const YearsView = ({ displayDate, onYearSelect }) => {
  const currentYear = displayDate.getFullYear();
  const startYear = currentYear - 4;
  const years = Array.from({ length: 9 }, (_, i) => startYear + i);

  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {years.map((year) => (
        <button
          key={year}
          onClick={() => onYearSelect(year)}
          className={cn(
            "text-sm p-2 rounded-md",
            "hover:bg-accent hover:text-accent-foreground",
            currentYear === year && "bg-primary text-primary-foreground"
          )}
        >
          {year}
        </button>
      ))}
    </div>
  );
};

YearsView.propTypes = {
  displayDate: PropTypes.instanceOf(Date).isRequired,
  onYearSelect: PropTypes.func.isRequired
};

const CalendarViews = ({
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
}) => {
  const handleMonthChange = (month) => {
    const newDate = new Date(displayDate);
    newDate.setMonth(month.getMonth());
    newDate.setFullYear(month.getFullYear());
    if (typeof onPrevMonth === 'function') {
      onPrevMonth();
    } else {
      console.error('onPrevMonth is not a function in handleMonthChange');
    }
  };

  const renderView = () => {
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
          <DayPicker
            mode="single"
            selected={selectedDate}
            month={displayDate}
            onSelect={onDaySelect}
            onMonthChange={handleMonthChange}
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
    }
  };

  return (
    <div className="space-y-4">
      <CalendarNavigation
        displayDate={displayDate}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onViewChange={onViewChange}
      />
      {renderView()}
    </div>
  );
};

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
