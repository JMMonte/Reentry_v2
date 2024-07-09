// bodySelectorControls.js

export function initializeBodySelector(app) {
    const bodySelector = document.getElementById('body-selector');

    if (!bodySelector) {
        console.error('Body selector element not found in the DOM.');
        return;
    }

    const updateSelectorOptions = () => {
        while (bodySelector.firstChild) {
            bodySelector.removeChild(bodySelector.firstChild);
        }

        const defaultOptions = [
            { value: 'none', text: 'None' },
            { value: 'earth', text: 'Earth' },
            { value: 'moon', text: 'Moon' }
        ];

        defaultOptions.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.text = option.text;
            bodySelector.appendChild(opt);
        });

        app.satellites.forEach((satellite, index) => {
            const opt = document.createElement('option');
            opt.value = `satellite-${index}`;
            opt.text = `Satellite ${index + 1}`;
            bodySelector.appendChild(opt);
        });
    };

    updateSelectorOptions();

    bodySelector.addEventListener('change', () => {
        const value = bodySelector.value;
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

    // Update the selector options whenever a satellite is added or removed
    document.addEventListener('satelliteAdded', updateSelectorOptions);
    document.addEventListener('satelliteRemoved', updateSelectorOptions);
}
