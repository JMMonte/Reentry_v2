import { useState, useEffect } from 'react';

export const useSatellites = () => {
    const [satellites, setSatellites] = useState({});
    const [debugWindows, setDebugWindows] = useState([]);

    useEffect(() => {
        const handleSatelliteListUpdate = (event) => {
            if (event.detail?.satellites) {
                const satelliteArray = Array.isArray(event.detail.satellites)
                    ? event.detail.satellites
                    : Object.values(event.detail.satellites);

                const validSatellites = satelliteArray
                    .filter(sat => sat && sat.id != null && sat.name)
                    .reduce((acc, sat) => {
                        acc[sat.id] = sat;
                        return acc;
                    }, {});

                setSatellites(validSatellites);
            }
        };

        const handleCreateDebugWindow = (event) => {
            if (event.detail?.satellite) {
                createDebugWindow(event.detail.satellite);
            }
        };

        document.addEventListener('satelliteListUpdated', handleSatelliteListUpdate);
        document.addEventListener('createDebugWindow', handleCreateDebugWindow);
        
        return () => {
            document.removeEventListener('satelliteListUpdated', handleSatelliteListUpdate);
            document.removeEventListener('createDebugWindow', handleCreateDebugWindow);
        };
    }, []);

    const createDebugWindow = (satellite) => {
        setDebugWindows(prev => {
            if (prev.some(w => w.id === satellite.id)) {
                return prev;
            }
            return [...prev, { id: satellite.id, satellite }];
        });
    };

    const removeDebugWindow = (satelliteId) => {
        setDebugWindows(prev => prev.filter(w => w.id !== satelliteId));
    };

    return {
        satellites,
        debugWindows,
        createDebugWindow,
        removeDebugWindow
    };
}; 