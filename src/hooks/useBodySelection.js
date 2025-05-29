import { useState, useEffect } from 'react';
import {
    formatBodySelection,
    getBodyDisplayName,
    getPlanetOptions,
    getSatelliteOptions
} from '../utils/BodySelectionUtils';
import { solarSystemDataManager } from '../physics/bodies/PlanetaryDataManager.js';


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
        }
    }, [planetOptions, satelliteOptions, importedFocus, isImported, selectedBody, importSynced]);

    // Handler for dropdown changes
    const handleBodyChange = (value) => {
        setSelectedBody(formatBodySelection(value));
    };

    // Display name formatter
    const getDisplayValue = (value) => getBodyDisplayName(value, satellites, app3dRef.current?.celestialBodies);

    // Build groupedPlanetOptions for UI dynamically from planetOptions
    // This avoids the complexity of accessing Planet instance configs
    
    // Add Sun as a top-level option if present in planetOptions
    const sunObj = planetOptions.find(o => o.value === 'sun');
    const groupedPlanetOptions = [];
    if (sunObj) {
        groupedPlanetOptions.push({ planet: sunObj, moons: [] });
    }
    
    // Define solar system order for consistent display
    const planetOrder = [
        'mercury', 'venus', 'earth', 'mars', 'jupiter', 
        'saturn', 'uranus', 'neptune', 'pluto',
        'ceres', 'eris', 'makemake', 'haumea'
    ];
    
    // Use imported PlanetaryDataManager
    
    if (solarSystemDataManager) {
        // Use dynamic hierarchy from PlanetaryDataManager
        planetOrder.forEach(planetName => {
            const planetObj = planetOptions.find(o => o.value === planetName);
            if (!planetObj) return; // Planet not available in options
            
            // Find barycenter for this planet
            const barycenterKey = planetName === 'earth' ? 'emb' : `${planetName}_barycenter`;
            const barycenterObj = planetOptions.find(o => o.value === barycenterKey);
            
            // Find moons that orbit this planet's barycenter using PlanetaryDataManager
            const moonObjs = [];
            const allBodies = Array.from(solarSystemDataManager.bodies.values());
            for (const config of allBodies) {
                if (config.type === 'moon' && config.parent === barycenterKey) {
                    const moonObj = planetOptions.find(o => o.value === config.name);
                    if (moonObj) {
                        moonObjs.push(moonObj);
                    }
                }
            }
            
            // Barycenter (if present) should be first in the moons array
            const children = [barycenterObj, ...moonObjs].filter(Boolean);
            
            groupedPlanetOptions.push({ planet: planetObj, moons: children });
        });
    } else {
        // Fallback to hardcoded moon patterns if PlanetaryDataManager not available
        console.warn('[useBodySelection] PlanetaryDataManager not available, using fallback moon patterns');
        
        planetOrder.forEach(planetName => {
            const planetObj = planetOptions.find(o => o.value === planetName);
            if (!planetObj) return;
            
            const barycenterKey = planetName === 'earth' ? 'emb' : `${planetName}_barycenter`;
            const barycenterObj = planetOptions.find(o => o.value === barycenterKey);
            
            const moonPatterns = {
                mars: ['phobos', 'deimos'],
                jupiter: ['io', 'europa', 'ganymede', 'callisto', 'amalthea', 'himalia', 'elara', 'pasiphae', 'sinope', 'lysithea', 'carme', 'ananke', 'leda', 'thebe', 'adrastea', 'metis'],
                saturn: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus'],
                uranus: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'],
                neptune: ['triton', 'proteus', 'nereid'],
                pluto: ['charon', 'nix', 'hydra', 'kerberos', 'styx']
            };
            
            const moonObjs = planetOptions.filter(option => {
                if (option.value === planetName || option.value === barycenterKey) return false;
                if (planetName === 'earth' && option.value === 'moon') return true;
                return moonPatterns[planetName]?.includes(option.value) || false;
            });
            
            const children = [barycenterObj, ...moonObjs].filter(Boolean);
            groupedPlanetOptions.push({ planet: planetObj, moons: children });
        });
    }
    
    // --- PATCH: Add any bodies not already included ---
    const includedValues = new Set(groupedPlanetOptions.flatMap(g => [g.planet.value, ...g.moons.map(m => m.value)]));
    (planetOptions || []).forEach(opt => {
        if (!includedValues.has(opt.value)) {
            groupedPlanetOptions.push({ planet: opt, moons: [] });
        }
    });

    return { selectedBody, handleBodyChange, planetOptions, satelliteOptions, getDisplayValue, groupedPlanetOptions };
} 