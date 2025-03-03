// bodySelectorControls.js

export function initializeBodySelector(app) {
    // Instead of manipulating the DOM directly, we'll use the app's event system
    // to communicate with the React components

    document.addEventListener('bodySelected', (event) => {
        const value = event.detail.body;
        if (value === 'none') {
            app.cameraControls.clearCameraTarget();
        } else if (value === 'earth') {
            app.cameraControls.updateCameraTarget(app.earth);
        } else if (value === 'moon') {
            app.cameraControls.updateCameraTarget(app.moon);
        } else if (value.startsWith('satellite-')) {
            // Handle satellite selection (value follows the format "satellite-id")
            const satelliteId = parseInt(value.split('-')[1]);
            const satellite = app._satellites[satelliteId];
            if (satellite) {
                app.cameraControls.updateCameraTarget(satellite);
            }
        }
    });

    // Listen for satellite changes to update the UI
    document.addEventListener('satelliteListUpdated', (event) => {
        if (event.detail?.satellites) {
            document.dispatchEvent(new CustomEvent('updateBodyOptions', {
                detail: {
                    satellites: Object.values(event.detail.satellites).map(s => ({
                        value: s.id.toString(),
                        text: s.name || `Satellite ${s.id}`
                    }))
                }
            }));
        }
    });
}
