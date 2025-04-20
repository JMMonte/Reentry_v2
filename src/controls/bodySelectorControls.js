// bodySelectorControls.js

export function initializeBodySelector() {
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
