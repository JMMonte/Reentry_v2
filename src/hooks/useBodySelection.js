import { useState, useEffect, useRef, useMemo } from 'react';
import {
    formatBodySelection,
    getBodyDisplayName,
    getPlanetOptions,
    getSatelliteOptions
} from '../utils/BodySelectionUtils';


/**
 * Hook to manage celestial body selection (planets & satellites).
 * Defaults to Earth or restores imported focused body when available.
 * @param {Object} params
 * @param {{current: Object}} params.app3dRef - ref to the App3D instance
 * @param {Array|Object} params.satellites - map or array of satellites
 * @param {Object} params.importedState - optional imported simulation state
 * @param {boolean} params.ready - whether the 3D scene is initialized
 * @param {Object} params.centralizedBodies - physics bodies from centralized state
 */
export function useBodySelection({ app3dRef, satellites, importedState, ready, centralizedBodies = {} }) {
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
    
    // Prevent infinite loops in event handling
    const isUpdatingRef = useRef(false);

    // Option lists
    const [planetOptions, setPlanetOptions] = useState([]);
    const [satelliteOptions, setSatelliteOptions] = useState([]);
    
    // Use physics bodies from centralized state instead of separate hook
    const physicsBodies = Object.values(centralizedBodies);

    // Populate planet options when scene is ready
    useEffect(() => {
        if (!ready) return;
        const app = app3dRef.current;
        if (app?.celestialBodies) {
            const newPlanetOptions = getPlanetOptions(app.celestialBodies);
            setPlanetOptions(newPlanetOptions);
            
            // REMOVED: This was causing periodic camera resets
            // The SmartCamera initialization in App3D handles the initial Earth setup
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
                // Only set if it's actually different to prevent infinite loops
                if (selectedBody !== importedFocus) {
                    setSelectedBody(importedFocus);
                }
                setImportSynced(true);
            }
        }
    }, [planetOptions, satelliteOptions, importedFocus, isImported, importSynced]);

    // Create temporary planet options from physics bodies when available
    useEffect(() => {
        if (!ready || isImported || planetOptions.length > 0) return;
        
        // If we have centralized bodies but no planet options yet, create temporary options
        if (physicsBodies.length > 0) {
            const tempOptions = physicsBodies
                .filter(body => body.type === 'planet' || body.type === 'star' || body.name === 'earth')
                .map(body => ({
                    value: body.name,
                    text: body.name.charAt(0).toUpperCase() + body.name.slice(1)
                }));
            
            if (tempOptions.length > 0) {
                setPlanetOptions(tempOptions);
                
                // REMOVED: updateSelectedBody call that was causing camera resets
                // Let the SmartCamera system handle target selection
            }
        }
    }, [ready, isImported, planetOptions.length, physicsBodies]);

    // Listen for bodySelected events from the 3D engine to sync React state
    useEffect(() => {
        const handleBodySelected = (event) => {
            if (isUpdatingRef.current) return; // Prevent infinite loops
            
            const selectedBodyFromEngine = event.detail?.body;
            if (selectedBodyFromEngine && selectedBodyFromEngine !== selectedBody) {
                isUpdatingRef.current = true;
                setSelectedBody(selectedBodyFromEngine);
                // Reset flag immediately after setting state
                requestAnimationFrame(() => {
                    isUpdatingRef.current = false;
                });
            }
        };

        document.addEventListener('bodySelected', handleBodySelected);
        return () => document.removeEventListener('bodySelected', handleBodySelected);
    }, [selectedBody]);

    // Handler for dropdown changes
    const handleBodyChange = (value) => {
        if (isUpdatingRef.current) return; // Prevent infinite loops
        
        const formattedValue = formatBodySelection(value);
        
        // Only update if value actually changed
        if (formattedValue === selectedBody) return;
        
        isUpdatingRef.current = true;
        setSelectedBody(formattedValue);
        
        // Dispatch bodySelected event to notify 3D engine
        document.dispatchEvent(new CustomEvent('bodySelected', {
            detail: { body: formattedValue }
        }));
        
        // Reset flag immediately after dispatching
        requestAnimationFrame(() => {
            isUpdatingRef.current = false;
        });
    };

    // Display name formatter
    const getDisplayValue = (value) => getBodyDisplayName(value, satellites, app3dRef.current?.celestialBodies);

    // MEMOIZED: Build groupedPlanetOptions for UI dynamically from planetOptions
    // This expensive calculation only runs when dependencies actually change
    const groupedPlanetOptions = useMemo(() => {
        // Add Sun as a top-level option if present in planetOptions
        const sunObj = planetOptions.find(o => o.value === 'sun');
        const result = [];
        if (sunObj) {
            result.push({ planet: sunObj, moons: [] });
        }
        
        // Define solar system order for consistent display
        const planetOrder = [
            'mercury', 'venus', 'earth', 'mars', 'jupiter', 
            'saturn', 'uranus', 'neptune', 'pluto',
            'ceres', 'eris', 'makemake', 'haumea'
        ];
        
        // Check if physics bodies actually have moon data
        const physicsHasMoons = physicsBodies.some(b => b.type === 'moon');
        
        if (physicsBodies.length > 0 && ready && physicsHasMoons) {
            // Use dynamic hierarchy from physics bodies
            planetOrder.forEach(planetName => {
                const planetObj = planetOptions.find(o => o.value === planetName);
                if (!planetObj) return; // Planet not available in options
                
                // Find barycenter for this planet
                const barycenterKey = planetName === 'earth' ? 'emb' : `${planetName}_barycenter`;
                const barycenterObj = planetOptions.find(o => o.value === barycenterKey);
                
                // Find moons that orbit this planet's barycenter
                const moonObjs = [];
                for (const config of physicsBodies) {
                    if (config.type === 'moon' && config.parent === barycenterKey) {
                        const moonObj = planetOptions.find(o => o.value === config.name);
                        if (moonObj) {
                            moonObjs.push(moonObj);
                        }
                    }
                }
                
                // Barycenter (if present) should be first in the moons array
                const children = [barycenterObj, ...moonObjs].filter(Boolean);
                result.push({ planet: planetObj, moons: children });
            });
        } else {
            // Fallback to hardcoded moon patterns when physics bodies not yet available
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
                result.push({ planet: planetObj, moons: children });
            });
        }
        
        // Add any bodies not already included
        const includedValues = new Set(result.flatMap(g => [g.planet.value, ...g.moons.map(m => m.value)]));
        (planetOptions || []).forEach(opt => {
            if (!includedValues.has(opt.value)) {
                result.push({ planet: opt, moons: [] });
            }
        });
        
        return result;
    }, [planetOptions, physicsBodies, ready]);

    return { selectedBody, handleBodyChange, planetOptions, satelliteOptions, getDisplayValue, groupedPlanetOptions };
} 