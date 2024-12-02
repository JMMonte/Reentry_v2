// bodySelectorControls.js

export function initializeBodySelector(app) {
    document.addEventListener('bodySelected', (event) => {
        const value = event.detail.body;
        if (value === 'none') {
            app.cameraControls.clearCameraTarget();
        } else if (value === 'earth') {
            app.cameraControls.updateCameraTarget(app.earth);
        } else if (value === 'moon') {
            app.cameraControls.updateCameraTarget(app.moon);
        } else {
            // For satellites, value is the satellite ID
            const satellite = app.satellites[value];
            if (satellite) {
                app.cameraControls.updateCameraTarget(satellite);
            }
        }
    });

    // Listen for satellite changes to update the UI
    document.addEventListener('satelliteAdded', () => {
        document.dispatchEvent(new CustomEvent('updateBodyOptions', {
            detail: {
                satellites: Object.entries(app.satellites).map(([id, s]) => ({
                    value: id,
                    text: s.name || `Satellite ${id}`
                }))
            }
        }));
    });

    document.addEventListener('satelliteRemoved', () => {
        document.dispatchEvent(new CustomEvent('updateBodyOptions', {
            detail: {
                satellites: Object.entries(app.satellites).map(([id, s]) => ({
                    value: id,
                    text: s.name || `Satellite ${id}`
                }))
            }
        }));
    });
}
