// setupListeners.js
export function setupEventListeners(app) {
    window.addEventListener('resize', app.onWindowResize.bind(app));
    document.body.appendChild(app.stats.dom);

    document.addEventListener('updateDisplaySetting', (event) => {
        console.log('App: Received updateDisplaySetting event', event.detail);
        const { key, value } = event.detail;
        app.displayManager.updateSetting(key, value);
    });

    document.addEventListener('getDisplaySettings', () => {
        console.log('App: Received getDisplaySettings event');
        const currentSettings = app.displayManager.getSettings();
        console.log('App: Sending current settings', currentSettings);
        document.dispatchEvent(new CustomEvent('displaySettingsResponse', {
            detail: currentSettings
        }));
    });

    document.addEventListener('createSatelliteFromLatLon', (event) => {
        app.createSatelliteLatLon(event.detail);
    });

    document.addEventListener('createSatelliteFromOrbitalElements', (event) => {
        app.createSatelliteOrbital(event.detail);
    });

    document.addEventListener('createSatelliteFromLatLonCircular', (event) => {
        app.createSatelliteCircular(event.detail);
    });

    document.addEventListener('updateTimeWarp', (event) => {
        app.updateTimeWarp(event.detail.value);
    });

    document.addEventListener('bodySelected', (event) => {
        app.updateSelectedBody(event.detail.body);
    });

    // Add any event listeners that don't belong to specific managers
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            app.cameraControls?.clearCameraTarget();
        }
    });
}

export function setupSocketListeners(app, socket) {
    if (!socket) {
        console.warn('Socket not initialized');
        return;
    }

    // Add any socket listeners that don't belong to specific managers
    socket.on('updateTimeWarp', (value) => {
        app.updateTimeWarp(value);
    });

    socket.on('updateSelectedBody', (value) => {
        app.updateSelectedBody(value);
    });
}
