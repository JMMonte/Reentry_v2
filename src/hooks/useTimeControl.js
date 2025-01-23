import { useState, useEffect } from 'react';

export const useTimeControl = (app3dRef) => {
    const [timeWarp, setTimeWarp] = useState(1);
    const [simulatedTime, setSimulatedTime] = useState(new Date());

    useEffect(() => {
        const handleTimeUpdate = (event) => {
            const { simulatedTime: newTime, timeWarp: newWarp } = event.detail;
            setSimulatedTime(newTime);
            setTimeWarp(newWarp);
        };

        document.addEventListener('timeUpdate', handleTimeUpdate);
        return () => document.removeEventListener('timeUpdate', handleTimeUpdate);
    }, []);

    useEffect(() => {
        const app = app3dRef.current;
        if (!app) return;

        document.dispatchEvent(new CustomEvent('updateTimeWarp', {
            detail: { value: timeWarp }
        }));
    }, [timeWarp, app3dRef]);

    const handleSimulatedTimeChange = (newTime) => {
        const app = app3dRef.current;
        if (app?.timeUtils) {
            app.timeUtils.setSimulatedTime(newTime);
        }
    };

    const getNextTimeWarp = (current, increase) => {
        const timeWarpSteps = [0.25, 0.5, 1, 2, 5, 10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000];
        const currentIndex = timeWarpSteps.findIndex(step => step >= current);

        if (increase) {
            if (currentIndex < timeWarpSteps.length - 1) {
                return timeWarpSteps[currentIndex + 1];
            }
            return timeWarpSteps[timeWarpSteps.length - 1];
        } else {
            if (currentIndex > 0) {
                return timeWarpSteps[currentIndex - 1];
            }
            return timeWarpSteps[0];
        }
    };

    return {
        timeWarp,
        setTimeWarp,
        simulatedTime,
        handleSimulatedTimeChange,
        getNextTimeWarp
    };
}; 