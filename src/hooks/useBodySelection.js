import { useState, useEffect } from 'react';
import {
    formatBodySelection,
    getBodyDisplayName,
    getPlanetOptions,
    getSatelliteOptions
} from '../utils/BodySelectionUtils';

// --- Solar System Order for Planets and Moons ---
const planetMoonOrder = [
    { planet: 'mercury', moons: [] },
    { planet: 'venus', moons: [] },
    { planet: 'earth', moons: ['moon'] },
    { planet: 'mars', moons: ['phobos', 'deimos'] },
    { planet: 'jupiter', moons: ['io', 'europa', 'ganymede', 'callisto'] },
    { planet: 'saturn', moons: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus'] },
    { planet: 'uranus', moons: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'] },
    { planet: 'neptune', moons: ['triton', 'proteus', 'nereid'] },
    { planet: 'pluto', moons: ['charon', 'nix', 'hydra', 'kerberos', 'styx'] },
];

/**
 * Hook to manage celestial body selection (planets & satellites).
 * Defaults to Earth or restores imported focused body when available.
 * @param {Object} params
 * @param {{current: Object}} params.app3dRef - ref to the App3D instance
 * @param {Array|Object} params.satellites - map or array of satellites
 * @param {Object} params.importedState - optional imported simulation state
 * @param {boolean} params.ready - whether the 3D scene is initialized
 */
export function useBodySelection({ app3dRef, satellites, importedState, ready }) {
    const importedFocus = importedState?.camera?.focusedBody;
    const isImported = typeof importedFocus === 'string';

    // Track if we've applied the imported focus already
    const [importSynced, setImportSynced] = useState(false);
    // Reset sync flag whenever importedFocus changes
    useEffect(() => {
        setImportSynced(false);
    }, [importedFocus]);

    // Selection state: imported focus or default 'earth'
    const [selectedBody, setSelectedBody] = useState(importedFocus ?? 'earth');

    // Option lists
    const [planetOptions, setPlanetOptions] = useState([]);
    const [satelliteOptions, setSatelliteOptions] = useState([]);

    // Populate planet options when scene is ready
    useEffect(() => {
        if (!ready) return;
        const app = app3dRef.current;
        if (app?.celestialBodies) {
            setPlanetOptions(getPlanetOptions(app.celestialBodies));
        }
    }, [ready, app3dRef]);

    // Populate satellite options whenever satellites change
    useEffect(() => {
        setSatelliteOptions(getSatelliteOptions(satellites));
    }, [satellites]);

    // Sync selection: imported focus when available, else default to Earth once listed
    useEffect(() => {
        if (isImported && !importSynced) {
            // Apply imported focus once when it appears in options
            if (
                importedFocus &&
                (planetOptions.find(o => o.value === importedFocus) || satelliteOptions.find(o => o.value === importedFocus))
            ) {
                setSelectedBody(importedFocus);
                setImportSynced(true);
            }
        } else if (!isImported) {
            // Default to Earth once it's listed
            if (
                planetOptions.find(o => o.value === 'earth') &&
                !planetOptions.find(o => o.value === selectedBody) &&
                !satelliteOptions.find(o => o.value === selectedBody)
            ) {
                setSelectedBody('earth');
            }
        }
    }, [planetOptions, satelliteOptions, importedFocus, isImported, selectedBody, importSynced]);

    // Handler for dropdown changes
    const handleBodyChange = (value) => {
        setSelectedBody(formatBodySelection(value));
    };

    // Display name formatter
    const getDisplayValue = (value) => getBodyDisplayName(value, satellites, app3dRef.current?.celestialBodies);

    // Build groupedPlanetOptions for UI
    const groupedPlanetOptions = planetMoonOrder.map(({ planet, moons }) => {
        const planetObj = planetOptions.find(o => o.value === planet);
        const moonObjs = moons.map(moon => planetOptions.find(o => o.value === moon)).filter(Boolean);
        return planetObj ? { planet: planetObj, moons: moonObjs } : null;
    }).filter(Boolean);

    return { selectedBody, handleBodyChange, planetOptions, satelliteOptions, getDisplayValue, groupedPlanetOptions };
} 