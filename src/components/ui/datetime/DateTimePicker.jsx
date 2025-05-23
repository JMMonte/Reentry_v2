import React, { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { Button } from "../button";
import { cn } from "../../../lib/utils";
import { parseISO, isValid } from "date-fns";
import { Calendar } from "lucide-react";
import { CalendarViews, VIEWS } from "./CalendarViews";
import { TimeInput } from "./TimeInput";
import PropTypes from 'prop-types';

const formatDateTime = (date) => {
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}:${seconds}.${milliseconds}`
  };
};

const DateTimePicker = ({ date, onDateTimeChange }) => {
  const initialDate = useMemo(() => {
    if (!date) return new Date();
    if (date instanceof Date) return date;
    try {
      const parsedDate = parseISO(date);
      return isValid(parsedDate) ? parsedDate : new Date();
    } catch {
      return new Date();
    }
  }, [date]);
  
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [displayDate, setDisplayDate] = useState(initialDate);
  const [view, setView] = useState(VIEWS.DAYS);
  const [hours, setHours] = useState(initialDate.getUTCHours());
  const [minutes, setMinutes] = useState(initialDate.getUTCMinutes());
  const [seconds, setSeconds] = useState(initialDate.getUTCSeconds());
  const [milliseconds, setMilliseconds] = useState(initialDate.getUTCMilliseconds());

  const formattedDateTime = useMemo(() => {
    try {
      // Always try to show some valid time
      let dateToFormat = date;
      
      // If date is invalid, use current time
      if (!dateToFormat) {
        dateToFormat = new Date();
      } else if (typeof dateToFormat === 'string') {
        const parsed = parseISO(dateToFormat);
        dateToFormat = isValid(parsed) ? parsed : new Date();
      } else if (dateToFormat instanceof Date && isNaN(dateToFormat.getTime())) {
        dateToFormat = new Date();
      }
      
      return formatDateTime(dateToFormat);
    } catch {
      // Always return current time as fallback
      return formatDateTime(new Date());
    }
  }, [date]);

  const handleDaySelect = (day) => {
    if (!day) return;
    
    const newDate = new Date(selectedDate);
    newDate.setFullYear(day.getFullYear());
    newDate.setMonth(day.getMonth());
    newDate.setDate(day.getDate());
    setSelectedDate(newDate);
    setDisplayDate(newDate);
    onDateTimeChange(newDate.toISOString());
  };

  const handleMonthSelect = (month) => {
    const newDate = new Date(displayDate);
    newDate.setMonth(month);
    setDisplayDate(newDate);
    setView(VIEWS.DAYS);
  };

  const handleYearSelect = (year) => {
    const newDate = new Date(displayDate);
    newDate.setFullYear(year);
    setDisplayDate(newDate);
    setView(VIEWS.MONTHS);
  };

  const handleTimeChange = (type, value) => {
    const numValue = parseInt(value) || 0;
    let newDate = new Date(selectedDate);

    switch (type) {
      case 'hours':
        newDate.setUTCHours(numValue);
        setHours(numValue);
        break;
      case 'minutes':
        newDate.setUTCMinutes(numValue);
        setMinutes(numValue);
        break;
      case 'seconds':
        newDate.setUTCSeconds(numValue);
        setSeconds(numValue);
        break;
      case 'milliseconds':
        newDate.setUTCMilliseconds(numValue);
        setMilliseconds(numValue);
        break;
    }

    setSelectedDate(newDate);
    onDateTimeChange(newDate.toISOString());
  };

  const handleNow = () => {
    const now = new Date();
    setSelectedDate(now);
    setDisplayDate(now);
    setHours(now.getUTCHours());
    setMinutes(now.getUTCMinutes());
    setSeconds(now.getUTCSeconds());
    setMilliseconds(now.getUTCMilliseconds());
    onDateTimeChange(now.toISOString());
    setView(VIEWS.DAYS);
  };

  const handlePrevMonth = () => {
    const newDate = new Date(displayDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setDisplayDate(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(displayDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setDisplayDate(newDate);
  };

  const handleViewChange = (e) => {
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
  };

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
          selectedDate={selectedDate}
          onDaySelect={handleDaySelect}
          onMonthSelect={handleMonthSelect}
          onYearSelect={handleYearSelect}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onViewChange={handleViewChange}
          className="border-0"
        />
        <div className="p-3 border-t flex items-center justify-between">
          <TimeInput
            hours={hours}
            minutes={minutes}
            seconds={seconds}
            milliseconds={milliseconds}
            onTimeChange={handleTimeChange}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNow}
            className="ml-2 text-sm text-muted-foreground hover:text-accent-foreground"
          >
            Now
          </Button>
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
