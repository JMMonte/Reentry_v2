// setupListeners.js
// ──────────────────────────────────────────────────────────────────────────────
// One-time wiring of DOM / CustomEvent listeners (React/GUI ↔︎ App3D)
// ──────────────────────────────────────────────────────────────────────────────
export function setupEventListeners(app) {
    // 1. Stats.js panel — inject once, if present
    if (app.stats?.dom && !document.body.contains(app.stats.dom)) {
        document.body.appendChild(app.stats.dom);
    }

    // Define all event handlers with proper references for cleanup
    const handlers = {
        updateDisplaySetting: ({ detail }) => {
            const { key, value } = detail ?? {};
            app.updateDisplaySetting?.(key, value);
        },

        getDisplaySettings: () => {
            const current = app.displaySettingsManager?.getSettings?.() ?? {};
            document.dispatchEvent(
                new CustomEvent('displaySettingsResponse', { detail: current })
            );
        },

        updateTimeWarp: ({ detail }) => {
            app.updateTimeWarp?.(detail?.value);
        },

        bodySelected: ({ detail }) => {
            const value = detail?.body;
            app.updateSelectedBody?.(value, !app.isInitialized);
        }
    };

    // 3. Satellite-creation helpers
    const satEvents = {
        createSatelliteFromLatLon: 'createSatelliteFromLatLon',
        createSatelliteFromOrbitalElements: 'createSatelliteFromOrbitalElements',
        createSatelliteFromLatLonCircular: 'createSatelliteFromLatLonCircular'
    };
    
    // Add satellite event handlers
    Object.entries(satEvents).forEach(([evtName, fnName]) => {
        handlers[evtName] = ({ detail }) => {
            app[fnName]?.(detail);
        };
    });

    // Add all event listeners
    Object.entries(handlers).forEach(([eventName, handler]) => {
        document.addEventListener(eventName, handler);
    });

    // Return cleanup function to remove all event listeners
    return () => {
        Object.entries(handlers).forEach(([eventName, handler]) => {
            document.removeEventListener(eventName, handler);
        });
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// Optional Web-socket bridge.  Each socket message forwards to the same
// satellite-creation helpers so the server can trigger identical actions.
// ──────────────────────────────────────────────────────────────────────────────
export function setupSocketListeners(app, socket) {
    const map = {
        createSatelliteFromLatLon: 'createSatelliteFromLatLon',
        createSatelliteFromOrbitalElements: 'createSatelliteFromOrbitalElements',
        createSatelliteFromLatLonCircular: 'createSatelliteFromLatLonCircular'
    };
    Object.entries(map).forEach(([msg, fn]) => {
        socket.on(msg, params => app[fn]?.(params));
    });
}
