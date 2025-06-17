import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * Optimized time display component that updates directly via DOM manipulation
 * to avoid expensive React re-renders for frequent time updates.
 * 
 * This component listens to timeUpdate events and updates the display directly,
 * providing smooth time updates without React overhead.
 */
export const OptimizedTimeDisplay = React.memo(function OptimizedTimeDisplay({
    className = '',
    formatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    },
    initialTime = new Date()
}) {
    const displayRef = useRef(null);
    const lastUpdateRef = useRef(0);

    // Format time helper
    const formatTime = (time) => {
        if (!time || !(time instanceof Date)) return 'Invalid Date';
        return time.toLocaleString('en-US', formatOptions);
    };

    // Direct DOM update for performance
    const updateDisplay = (newTime) => {
        if (!displayRef.current) return;

        // Throttle updates to max 1Hz for datetime display
        const now = performance.now();
        if (now - lastUpdateRef.current < 1000) return;
        lastUpdateRef.current = now;

        try {
            const formattedTime = formatTime(newTime);
            displayRef.current.textContent = formattedTime;
        } catch (error) {
            console.warn('OptimizedTimeDisplay: Error formatting time:', error);
            displayRef.current.textContent = 'Time Error';
        }
    };

    // Listen to timeUpdate events
    useEffect(() => {
        const handleTimeUpdate = (event) => {
            const { simulatedTime } = event.detail || {};
            if (simulatedTime) {
                // Handle both Date objects and ISO strings
                const timeToDisplay = simulatedTime instanceof Date
                    ? simulatedTime
                    : new Date(simulatedTime);
                updateDisplay(timeToDisplay);
            }
        };

        // Initial display
        updateDisplay(initialTime);

        // Listen for time updates
        document.addEventListener('timeUpdate', handleTimeUpdate);

        return () => {
            document.removeEventListener('timeUpdate', handleTimeUpdate);
        };
    }, [initialTime]); // Only depend on initial time

    return (
        <span
            ref={displayRef}
            className={className}
            style={{
                fontVariantNumeric: 'tabular-nums', // Consistent number spacing
                whiteSpace: 'nowrap' // Prevent wrapping
            }}
        >
            {formatTime(initialTime)}
        </span>
    );
});

OptimizedTimeDisplay.propTypes = {
    className: PropTypes.string,
    formatOptions: PropTypes.object,
    initialTime: PropTypes.instanceOf(Date)
}; 