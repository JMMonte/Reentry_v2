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
            const index = parseInt(value.split('-')[1]);
            if (app.satellites[index]) {
                app.cameraControls.updateCameraTarget(app.satellites[index]);
            }
        }
    });

    // Listen for satellite changes to update the UI
    document.addEventListener('satelliteAdded', () => {
        document.dispatchEvent(new CustomEvent('updateBodyOptions', {
            detail: {
                satellites: app.satellites.map((_, index) => ({
                    value: `satellite-${index}`,
                    text: `Satellite ${index + 1}`
                }))
            }
        }));
    });

    document.addEventListener('satelliteRemoved', () => {
        document.dispatchEvent(new CustomEvent('updateBodyOptions', {
            detail: {
                satellites: app.satellites.map((_, index) => ({
                    value: `satellite-${index}`,
                    text: `Satellite ${index + 1}`
                }))
            }
        }));
    });
}
