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
}

export function setupSocketListeners(app, socket) {
    socket.on('createSatelliteFromLatLon', app.handleCreateSatelliteFromLatLon.bind(app));
    socket.on('createSatelliteFromOrbitalElements', app.handleCreateSatelliteFromOrbitalElements.bind(app));
    socket.on('createSatelliteFromLatLonCircular', app.handleCreateSatelliteFromLatLonCircular.bind(app));
}
