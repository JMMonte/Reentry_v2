// setupListeners.js
// ──────────────────────────────────────────────────────────────────────────────
// One-time wiring of DOM / CustomEvent listeners (React/GUI ↔︎ App3D)
// ──────────────────────────────────────────────────────────────────────────────
export function setupEventListeners(app) {
    // 1. Stats.js panel — inject once, if present
    if (app.stats?.dom && !document.body.contains(app.stats.dom)) {
        document.body.appendChild(app.stats.dom);
    }

    // 2. Display-settings bridge
    document.addEventListener('updateDisplaySetting', ({ detail }) => {
        const { key, value } = detail ?? {};
        app.updateDisplaySetting?.(key, value);
    });

    document.addEventListener('getDisplaySettings', () => {
        const current = app.displaySettingsManager?.getSettings?.() ?? {};
        document.dispatchEvent(
            new CustomEvent('displaySettingsResponse', { detail: current })
        );
    });

    // 3. Satellite-creation helpers
    const satEvents = {
        createSatelliteFromLatLon: 'createSatelliteFromLatLon',
        createSatelliteFromOrbitalElements: 'createSatelliteFromOrbitalElements',
        createSatelliteFromLatLonCircular: 'createSatelliteFromLatLonCircular'
    };
    Object.entries(satEvents).forEach(([evtName, fnName]) => {
        document.addEventListener(evtName, ({ detail }) => {
            app[fnName]?.(detail);
        });
    });

    // 4. Time warp & body selection
    document.addEventListener('updateTimeWarp', ({ detail }) => {
        app.updateTimeWarp?.(detail?.value);
    });

    // Listen for bodySelected events from UI and delegate to camera
    document.addEventListener('bodySelected', ({ detail }) => {
        const value = detail?.body;
        app.updateSelectedBody?.(value);
    });
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
