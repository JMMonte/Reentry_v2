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
            const satelliteId = parseInt(value.split('-')[1]);
            const satellite = app.satellites.find(s => s.id === satelliteId);
            if (satellite) {
                app.cameraControls.updateCameraTarget(satellite);
            }
        }
    });

    // Listen for satellite changes to update the UI
    document.addEventListener('satelliteAdded', () => {
        document.dispatchEvent(new CustomEvent('updateBodyOptions', {
            detail: {
                satellites: app.satellites.map(s => ({
                    value: `satellite-${s.id}`,
                    text: `Satellite ${s.id}`
                }))
            }
        }));
    });

    document.addEventListener('satelliteRemoved', () => {
        document.dispatchEvent(new CustomEvent('updateBodyOptions', {
            detail: {
                satellites: app.satellites.map(s => ({
                    value: `satellite-${s.id}`,
                    text: `Satellite ${s.id}`
                }))
            }
        }));
    });
}
