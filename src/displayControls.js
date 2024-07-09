// displayControls.js
import * as THREE from 'three';

let scene, earth, moon, satellites, vectors;

const displayOptions = [
    { key: 'showGrid', name: 'Grid', icon: 'bx-grid-alt' },
    { key: 'showVectors', name: 'Vectors', icon: 'bx-move' },
    { key: 'showSatVectors', name: 'Sat Vectors', icon: 'bx-radio-circle-marked' },
    { key: 'showSurfaceLines', name: 'Surface Lines', icon: 'bx-landscape' },
    { key: 'showOrbits', name: 'Sat Orbits', icon: 'bx-circle' },
    { key: 'showTraces', name: 'Sat Traces', icon: 'bx-line-chart' },
    { key: 'showGroundTraces', name: 'Ground Traces', icon: 'bx-map-alt' },
    { key: 'showCities', name: 'Cities', icon: 'bx-buildings' },
    { key: 'showAirports', name: 'Airports', icon: 'bx-plane' },
    { key: 'showSpaceports', name: 'Spaceports', icon: 'bx-rocket' },
    { key: 'showObservatories', name: 'Observatories', icon: 'bx-telescope' },
    { key: 'showGroundStations', name: 'Ground Stations', icon: 'bx-broadcast' },
    { key: 'showCountryBorders', name: 'Country Borders', icon: 'bx-border-all' },
    { key: 'showStates', name: 'States', icon: 'bx-map' },
    { key: 'showMoonOrbit', name: 'Moon Orbit', icon: 'bx-moon' },
    { key: 'showMoonTraces', name: 'Moon Trace Lines', icon: 'bx-line-chart' },
    { key: 'showMoonSurfaceLines', name: 'Moon Surface Lines', icon: 'bx-landscape' }
];

let settings = {
    showGrid: false,
    showVectors: false,
    showSatVectors: true,
    showSurfaceLines: false,
    showOrbits: true,
    showTraces: true,
    showGroundTraces: true,
    showCities: false,
    showAirports: false,
    showSpaceports: false,
    showObservatories: false,
    showGroundStations: false,
    showCountryBorders: false,
    showStates: false,
    showMoonOrbit: false,
    showMoonTraces: false,
    showMoonSurfaceLines: false,
};

function updateSetting(key, value) {
    if (settings.hasOwnProperty(key)) {
        settings[key] = value;
        applySetting(key, value);
    }
}

function applySetting(key, value) {
    const methodName = `toggle${key.charAt(4).toUpperCase() + key.slice(5)}Visibility`;
    if (typeof window.displayControls[methodName] === 'function') {
        window.displayControls[methodName](value);
    } else {
        console.warn(`No toggle method found for ${key}`);
    }
}

const displayControls = {
    initializeGridHelper() {
        if (scene) {
            this.gridHelper = scene.getObjectByName('gridHelper');
            if (!this.gridHelper) {
                this.gridHelper = new THREE.PolarGridHelper(40000, 100, 100, 64, 0x888888, 0x444444);
                this.gridHelper.name = 'gridHelper';
                this.gridHelper.visible = settings.showGrid;
                this.gridHelper.material.transparent = true;
                this.gridHelper.material.opacity = 0.5;
                scene.add(this.gridHelper);
            }
        }
    },
    
    toggleGridVisibility(value) {
        const gridHelper = scene.getObjectByName('gridHelper');
        if (gridHelper) {
            gridHelper.visible = value;
        }
    },

    toggleVectorsVisibility(value) {
        if (vectors) {
            vectors.setVisible(value);
        }
    },

    toggleSatVectorsVisibility(value) {
        if (vectors) {
            vectors.setSatVisible(value);
        }
    },

    toggleSurfaceLinesVisibility(value) {
        if (earth) {
            earth.setSurfaceLinesVisible(value);
        }
    },

    toggleOrbitsVisibility(value) {
        if (satellites) {
            satellites.forEach(satellite => satellite.setOrbitVisible(value));
        }
    },

    toggleTracesVisibility(value) {
        if (satellites) {
            satellites.forEach(satellite => satellite.setTraceVisible(value));
        }
    },

    toggleGroundTracesVisibility(value) {
        if (satellites) {
            satellites.forEach(satellite => satellite.setGroundTraceVisible(value));
        }
    },

    toggleCitiesVisibility(value) {
        if (earth) {
            earth.setCitiesVisible(value);
        }
    },

    toggleAirportsVisibility(value) {
        if (earth) {
            earth.setAirportsVisible(value);
        }
    },

    toggleSpaceportsVisibility(value) {
        if (earth) {
            earth.setSpaceportsVisible(value);
        }
    },

    toggleObservatoriesVisibility(value) {
        if (earth) {
            earth.setObservatoriesVisible(value);
        }
    },

    toggleGroundStationsVisibility(value) {
        if (earth) {
            earth.setGroundStationsVisible(value);
        }
    },

    toggleCountryBordersVisibility(value) {
        if (earth) {
            earth.setCountryBordersVisible(value);
        }
    },

    toggleStatesVisibility(value) {
        if (earth) {
            earth.setStatesVisible(value);
        }
    },

    toggleMoonOrbitVisibility(value) {
        if (moon) {
            moon.setOrbitVisible(value);
        }
    },

    toggleMoonTracesVisibility(value) {
        if (moon) {
            moon.setTraceVisible(value);
        }
    },

    toggleMoonSurfaceLinesVisibility(value) {
        if (moon) {
            moon.setSurfaceDetailsVisible(value);
        }
    }
};

export function initDisplayControls(params) {
    ({ scene, earth, moon, satellites, vectors } = params);

    window.displayControls = displayControls; // Ensure displayControls is globally accessible

    // Initialize grid helper
    displayControls.initializeGridHelper();

    const displayOptionsWindow = document.getElementById('display-options-window');
    const toggleDisplayOptionsBtn = document.getElementById('toggle-display-options');

    if (!displayOptionsWindow) {
        console.error('Display options window element not found!');
        return;
    }

    if (!toggleDisplayOptionsBtn) {
        console.error('Toggle display options button not found!');
        return;
    }

    toggleDisplayOptionsBtn.addEventListener('click', () => {
        displayOptionsWindow.classList.toggle('visible');
    });

    displayOptions.forEach(option => {
        const optionElement = document.createElement('div');
        optionElement.className = 'option-toggle';
        optionElement.innerHTML = `
            <input type="checkbox" id="${option.key}" name="${option.key}">
            <label for="${option.key}"><i class='bx ${option.icon}'></i>${option.name}</label>
        `;
        displayOptionsWindow.appendChild(optionElement);

        const checkbox = optionElement.querySelector('input');
        checkbox.addEventListener('change', (event) => {
            updateSetting(option.key, event.target.checked);
        });
    });

    applyInitialSettings();
}

function applyInitialSettings() {
    Object.keys(settings).forEach(key => {
        const checkbox = document.getElementById(key);
        if (checkbox) {
            checkbox.checked = settings[key];
            applySetting(key, settings[key]);
        }
    });
}
