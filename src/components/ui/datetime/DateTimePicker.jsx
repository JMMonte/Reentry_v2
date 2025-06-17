import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { Button } from "../button";
import { cn } from "@/lib/utils";
import { parseISO, isValid } from "date-fns";
import { Calendar } from "lucide-react";
import { CalendarViews, VIEWS } from "./CalendarViews";
import { TimeInput } from "./TimeInput";
import PropTypes from 'prop-types';

const DateTimePicker = function DateTimePicker({ date, onDateTimeChange }) {
  
  // Single source of truth for displayed time - starts with prop but updates from physics
  const [currentDate, setCurrentDate] = useState(() => {
    if (!date) return new Date();
    if (date instanceof Date) return date;
    if (typeof date === 'string') {
      try {
        const parsed = parseISO(date);
        return isValid(parsed) ? parsed : new Date();
      } catch {
        console.warn('Invalid date string:', date);
        return new Date();
      }
    }
    return new Date();
  });

  // Direct physics engine subscription - MUCH simpler!
  useEffect(() => {
    const handleTimeUpdate = (event) => {
      const { simulatedTime } = event.detail || {};
      if (simulatedTime) {
        const newTime = simulatedTime instanceof Date ? simulatedTime : new Date(simulatedTime);
        setCurrentDate(prevTime => {
          // Only update if time actually changed to prevent unnecessary renders
          if (Math.abs(newTime.getTime() - prevTime.getTime()) > 100) { // 100ms threshold
            return newTime;
          }
          return prevTime;
        });
      }
    };
    
    // Listen directly to physics time updates
    document.addEventListener('timeUpdate', handleTimeUpdate);
    
    return () => {
      document.removeEventListener('timeUpdate', handleTimeUpdate);
    };
  }, []);

  // Update from prop changes (user input)
  useEffect(() => {
    if (!date) return;
    
    let newDate;
    if (date instanceof Date) {
      newDate = date;
    } else if (typeof date === 'string') {
      try {
        const parsed = parseISO(date);
        if (isValid(parsed)) {
          newDate = parsed;
        } else {
          return;
        }
      } catch {
        console.warn('Invalid date string:', date);
        return;
      }
    } else {
      return;
    }
    
    // Only update if significantly different to avoid fighting with physics updates
    setCurrentDate(prevDate => {
      if (Math.abs(newDate.getTime() - prevDate.getTime()) > 1000) { // 1 second threshold for prop updates
        return newDate;
      }
      return prevDate;
    });
  }, [date]);

  // Local state for calendar view
  const [view, setView] = useState(VIEWS.DAYS);
  const [displayDate, setDisplayDate] = useState(currentDate);
  
  // Sync displayDate with currentDate
  useEffect(() => {
    setDisplayDate(currentDate);
  }, [currentDate]);

  // Memoized format the display text
  const formattedDateTime = useMemo(() => {
    if (!currentDate) return { date: "", time: "" };
    const year = currentDate.getUTCFullYear();
    const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getUTCDate()).padStart(2, '0');
    const hours = String(currentDate.getUTCHours()).padStart(2, '0');
    const minutes = String(currentDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(currentDate.getUTCSeconds()).padStart(2, '0');
    const milliseconds = String(currentDate.getUTCMilliseconds()).padStart(3, '0');

    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}:${seconds}.${milliseconds}`
    };
  }, [currentDate]);

  // Event handlers
  const handleDaySelect = useCallback((day) => {
    if (!day) return;

    const newDate = new Date(currentDate);
    newDate.setFullYear(day.getFullYear());
    newDate.setMonth(day.getMonth());
    newDate.setDate(day.getDate());

    onDateTimeChange(newDate.toISOString());
  }, [currentDate, onDateTimeChange]);

  const handleTimeChange = useCallback((type, value) => {
    const numValue = parseInt(value) || 0;
    const newDate = new Date(currentDate);

    switch (type) {
      case 'hours':
        newDate.setUTCHours(numValue);
        break;
      case 'minutes':
        newDate.setUTCMinutes(numValue);
        break;
      case 'seconds':
        newDate.setUTCSeconds(numValue);
        break;
      case 'milliseconds':
        newDate.setUTCMilliseconds(numValue);
        break;
    }

    onDateTimeChange(newDate.toISOString());
  }, [currentDate, onDateTimeChange]);

  const handleNow = useCallback(() => {
    const now = new Date();
    onDateTimeChange(now.toISOString());
    setView(VIEWS.DAYS);
  }, [onDateTimeChange]);

  const handleMonthSelect = useCallback((month) => {
    const newDate = new Date(displayDate);
    newDate.setMonth(month);
    setDisplayDate(newDate);
    setView(VIEWS.DAYS);
  }, [displayDate]);

  const handleYearSelect = useCallback((year) => {
    const newDate = new Date(displayDate);
    newDate.setFullYear(year);
    setDisplayDate(newDate);
    setView(VIEWS.MONTHS);
  }, [displayDate]);

  const handlePrevMonth = useCallback(() => {
    const newDate = new Date(displayDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setDisplayDate(newDate);
  }, [displayDate]);

  const handleNextMonth = useCallback(() => {
    const newDate = new Date(displayDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setDisplayDate(newDate);
  }, [displayDate]);

  const handleViewChange = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    switch (view) {
      case VIEWS.DAYS:
        setView(VIEWS.MONTHS);
        break;
      case VIEWS.MONTHS:
        setView(VIEWS.YEARS);
        break;
      case VIEWS.YEARS:
        setView(VIEWS.DAYS);
        break;
      default:
        setView(VIEWS.DAYS);
    }
  }, [view]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "justify-start text-left font-mono",
            !date && "text-muted-foreground"
          )}
        >
          <Calendar className="mr-2 h-4 w-4" />
          <div className="flex items-center space-x-2">
            <span className="text-muted-foreground">{formattedDateTime.date}</span>
            <span>{formattedDateTime.time}</span>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <CalendarViews
          view={view}
          displayDate={displayDate}
          selectedDate={currentDate}
          onDaySelect={handleDaySelect}
          onMonthSelect={handleMonthSelect}
          onYearSelect={handleYearSelect}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onViewChange={handleViewChange}
        />
        <div className="border-t p-3">
          <TimeInput
            hours={currentDate.getUTCHours()}
            minutes={currentDate.getUTCMinutes()}
            seconds={currentDate.getUTCSeconds()}
            milliseconds={currentDate.getUTCMilliseconds()}
            onTimeChange={handleTimeChange}
          />
          <div className="mt-2 flex justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleNow}
            >
              Now
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

DateTimePicker.propTypes = {
  date: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.instanceOf(Date)
  ]),
  onDateTimeChange: PropTypes.func.isRequired
};

export { DateTimePicker };
