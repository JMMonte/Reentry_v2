export class BodySelectorManager {
    constructor(app) {
        this.app = app;
        this.initialize();
    }

    initialize() {
        // Instead of manipulating the DOM directly, we'll use the app's event system
        // to communicate with the React components
        
        document.addEventListener('bodySelected', (event) => {
            const value = event.detail.body;
            if (value === 'none') {
                this.app.cameraControls.clearCameraTarget();
            } else if (value === 'earth') {
                this.app.cameraControls.updateCameraTarget(this.app.earth);
            } else if (value === 'moon') {
                this.app.cameraControls.updateCameraTarget(this.app.moon);
            } else {
                // Handle satellite selection (value is the satellite ID)
                const satellite = this.app.satellites[value];
                if (satellite) {
                    this.app.cameraControls.updateCameraTarget(satellite);
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
} 