// createSatelliteControls.js

export function initializeSatelliteCreationPanel(app) {
    console.log('Initializing Satellite Creation Panel');
    const satelliteCreationPanel = document.getElementById('satellite-creation-panel');
    const toggleSatelliteCreationButton = document.getElementById('toggle-satellite-creation');
    const toggleLatLonPanelButton = document.getElementById('toggle-latlon-panel');
    const latLonPanel = document.getElementById('latlon-panel');
    const toggleOrbitalPanelButton = document.getElementById('toggle-orbital-panel');
    const orbitalPanel = document.getElementById('orbital-panel');

    if (!satelliteCreationPanel || !toggleSatelliteCreationButton) {
        console.error('Satellite creation elements not found in the DOM.');
        return;
    }

    console.log('Satellite creation elements found in the DOM.');

    toggleSatelliteCreationButton.addEventListener('click', () => {
        console.log('Add Satellite button clicked');
        satelliteCreationPanel.classList.toggle('hidden');
    });

    if (toggleLatLonPanelButton && latLonPanel) {
        toggleLatLonPanelButton.addEventListener('click', () => {
            latLonPanel.classList.toggle('hidden');
        });
    }

    if (toggleOrbitalPanelButton && orbitalPanel) {
        toggleOrbitalPanelButton.addEventListener('click', () => {
            orbitalPanel.classList.toggle('hidden');
        });
    }

    const createSatelliteLatLonButton = document.getElementById('create-satellite-latlon');
    const createSatelliteLatLonCircularButton = document.getElementById('create-satellite-latlon-circular');
    const createSatelliteOrbitalButton = document.getElementById('create-satellite-orbital');

    if (createSatelliteLatLonButton) {
        createSatelliteLatLonButton.addEventListener('click', () => {
            console.log('Create Satellite Lat/Lon button clicked');
            const lat = parseFloat(document.getElementById('lat').value);
            const lon = parseFloat(document.getElementById('lon').value);
            const alt = parseFloat(document.getElementById('alt').value);
            const velocity = parseFloat(document.getElementById('velocity').value);
            const azimuth = parseFloat(document.getElementById('azimuth').value);
            const angleOfAttack = parseFloat(document.getElementById('angleOfAttack').value);

            console.log('Lat:', lat, 'Lon:', lon, 'Alt:', alt, 'Velocity:', velocity, 'Azimuth:', azimuth, 'Angle of Attack:', angleOfAttack);

            if (validateLatLonInputs(lat, lon, alt, velocity, azimuth, angleOfAttack)) {
                console.log('Validation passed for Lat/Lon');
                document.dispatchEvent(new CustomEvent('createSatelliteFromLatLon', {
                    detail: { latitude: lat, longitude: lon, altitude: alt, velocity, azimuth, angleOfAttack }
                }));
            } else {
                console.log('Validation failed for Lat/Lon');
            }
        });
    }

    if (createSatelliteLatLonCircularButton) {
        createSatelliteLatLonCircularButton.addEventListener('click', () => {
            console.log('Create Satellite Lat/Lon Circular button clicked');
            const lat = parseFloat(document.getElementById('lat').value);
            const lon = parseFloat(document.getElementById('lon').value);
            const alt = parseFloat(document.getElementById('alt').value);
            const azimuth = parseFloat(document.getElementById('azimuth').value);

            console.log('Lat:', lat, 'Lon:', lon, 'Alt:', alt, 'Azimuth:', azimuth);

            if (validateLatLonInputs(lat, lon, alt, 0, azimuth, 0)) {
                console.log('Validation passed for Lat/Lon Circular');
                document.dispatchEvent(new CustomEvent('createSatelliteFromLatLonCircular', {
                    detail: { latitude: lat, longitude: lon, altitude: alt, azimuth }
                }));
            } else {
                console.log('Validation failed for Lat/Lon Circular');
            }
        });
    }

    if (createSatelliteOrbitalButton) {
        createSatelliteOrbitalButton.addEventListener('click', () => {
            console.log('Create Satellite Orbital button clicked');
            const sma = parseFloat(document.getElementById('sma').value);
            const ecc = parseFloat(document.getElementById('ecc').value);
            const inc = parseFloat(document.getElementById('inc').value);
            const raan = parseFloat(document.getElementById('raan').value);
            const aop = parseFloat(document.getElementById('aop').value);
            const ta = parseFloat(document.getElementById('ta').value);

            console.log('SMA:', sma, 'ECC:', ecc, 'INC:', inc, 'RAAN:', raan, 'AOP:', aop, 'TA:', ta);

            if (validateOrbitalInputs(sma, ecc, inc, raan, aop, ta)) {
                console.log('Validation passed for Orbital Elements');
                document.dispatchEvent(new CustomEvent('createSatelliteFromOrbitalElements', {
                    detail: { semiMajorAxis: sma, eccentricity: ecc, inclination: inc, raan, argumentOfPeriapsis: aop, trueAnomaly: ta }
                }));
            } else {
                console.log('Validation failed for Orbital Elements');
            }
        });
    }


    function validateLatLonInputs(lat, lon, alt, velocity, azimuth, angleOfAttack) {
        let isValid = true;

        if (lat < -90 || lat > 90) {
            showError('lat-error', true);
            isValid = false;
        } else {
            showError('lat-error', false);
        }

        if (lon < -180 || lon > 180) {
            showError('lon-error', true);
            isValid = false;
        } else {
            showError('lon-error', false);
        }

        if (alt < 100) {
            showError('alt-error', true);
            isValid = false;
        } else {
            showError('alt-error', false);
        }

        if (velocity < 0) {
            showError('velocity-error', true);
            isValid = false;
        } else {
            showError('velocity-error', false);
        }

        if (azimuth < 0 || azimuth > 360) {
            showError('azimuth-error', true);
            isValid = false;
        } else {
            showError('azimuth-error', false);
        }

        if (angleOfAttack < 0 || angleOfAttack > 90) {
            showError('angleOfAttack-error', true);
            isValid = false;
        } else {
            showError('angleOfAttack-error', false);
        }

        return isValid;
    }

    function validateOrbitalInputs(sma, ecc, inc, raan, aop, ta) {
        let isValid = true;

        if (sma < 7000) {
            showError('sma-error', true);
            isValid = false;
        } else {
            showError('sma-error', false);
        }

        if (ecc < 0 || ecc > 1) {
            showError('ecc-error', true);
            isValid = false;
        } else {
            showError('ecc-error', false);
        }

        if (inc < 0 || inc > 180) {
            showError('inc-error', true);
            isValid = false;
        } else {
            showError('inc-error', false);
        }

        if (raan < 0 || raan > 360) {
            showError('raan-error', true);
            isValid = false;
        } else {
            showError('raan-error', false);
        }

        if (aop < 0 || aop > 360) {
            showError('aop-error', true);
            isValid = false;
        } else {
            showError('aop-error', false);
        }

        if (ta < 0 || ta > 360) {
            showError('ta-error', true);
            isValid = false;
        } else {
            showError('ta-error', false);
        }

        return isValid;
    }

    function showError(elementId, show) {
        const element = document.getElementById(elementId);
        if (element) {
            if (show) {
                element.classList.remove('hidden');
            } else {
                element.classList.add('hidden');
            }
        }
    }
}
