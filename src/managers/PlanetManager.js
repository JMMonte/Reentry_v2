/**
 * PlanetManager - Centralized planet instance management
 * Replaces static Planet.instances array to improve memory management
 * and provide better encapsulation of planet lifecycle
 */
export class PlanetManager {
    constructor() {
        // Use Map for O(1) lookups by name
        this._planetsByName = new Map();
        // Array for iteration (maintains order)
        this._planetsArray = [];
        // WeakMap for metadata that should be GC'd with planets
        this._planetMetadata = new WeakMap();
    }

    /**
     * Add a planet to the manager
     * @param {Planet} planet 
     */
    addPlanet(planet) {
        if (!planet || !planet.name) {
            console.warn('[PlanetManager] Cannot add planet without name');
            return;
        }

        // Check for duplicates
        if (this._planetsByName.has(planet.name)) {
            console.warn(`[PlanetManager] Planet ${planet.name} already exists`);
            return;
        }

        this._planetsByName.set(planet.name, planet);
        this._planetsArray.push(planet);
        
        // Initialize metadata
        this._planetMetadata.set(planet, {
            addedAt: Date.now(),
            disposed: false
        });
    }

    /**
     * Remove a planet from the manager
     * @param {Planet|string} planetOrName 
     */
    removePlanet(planetOrName) {
        const planet = typeof planetOrName === 'string' 
            ? this._planetsByName.get(planetOrName)
            : planetOrName;

        if (!planet) return false;

        // Remove from collections
        this._planetsByName.delete(planet.name);
        const index = this._planetsArray.indexOf(planet);
        if (index !== -1) {
            this._planetsArray.splice(index, 1);
        }

        // Mark as disposed in metadata
        const metadata = this._planetMetadata.get(planet);
        if (metadata) {
            metadata.disposed = true;
            metadata.disposedAt = Date.now();
        }

        return true;
    }

    /**
     * Get planet by name
     * @param {string} name 
     * @returns {Planet|undefined}
     */
    getPlanetByName(name) {
        return this._planetsByName.get(name);
    }

    /**
     * Get all planets
     * @returns {Planet[]}
     */
    getAllPlanets() {
        return [...this._planetsArray];
    }

    /**
     * Get planets matching a predicate
     * @param {Function} predicate 
     * @returns {Planet[]}
     */
    getPlanetsWhere(predicate) {
        return this._planetsArray.filter(predicate);
    }

    /**
     * Iterate over all planets
     * @param {Function} callback 
     */
    forEach(callback) {
        this._planetsArray.forEach(callback);
    }

    /**
     * Get planet count
     * @returns {number}
     */
    get count() {
        return this._planetsArray.length;
    }

    /**
     * Check if manager has a planet
     * @param {string} name 
     * @returns {boolean}
     */
    hasPlanet(name) {
        return this._planetsByName.has(name);
    }

    /**
     * Clear all planets (useful for scene reset)
     */
    clear() {
        // Dispose all planets first
        this._planetsArray.forEach(planet => {
            if (typeof planet.dispose === 'function') {
                planet.dispose();
            }
        });

        this._planetsByName.clear();
        this._planetsArray = [];
        // WeakMap will auto-cleanup
    }

    /**
     * Get planet metadata
     * @param {Planet} planet 
     * @returns {Object|undefined}
     */
    getMetadata(planet) {
        return this._planetMetadata.get(planet);
    }

    /**
     * Update visibility for all planets
     * @param {string} settingKey 
     * @param {boolean} visible 
     */
    updateVisibilitySetting(settingKey, visible) {
        const methodMap = {
            showLatLon: 'setSurfaceLinesVisible',
            showCountryBorders: 'setCountryBordersVisible',
            showStates: 'setStatesVisible',
            showCities: 'setCitiesVisible',
            showAirports: 'setAirportsVisible',
            showSpaceports: 'setSpaceportsVisible',
            showGroundStations: 'setGroundStationsVisible',
            showObservatories: 'setObservatoriesVisible',
            showMissions: 'setMissionsVisible',
            showSOI: 'setSOIVisible',
            showGrid: 'setRadialGridVisible',
            showRings: 'setRingsVisible'
        };

        const method = methodMap[settingKey];
        if (!method) return;

        this._planetsArray.forEach(planet => {
            if (typeof planet[method] === 'function') {
                planet[method](visible);
            }
        });
    }


}

// Singleton instance
let _instance = null;

/**
 * Get or create the singleton PlanetManager instance
 * @returns {PlanetManager}
 */
export function getPlanetManager() {
    if (!_instance) {
        _instance = new PlanetManager();
    }
    return _instance;
}

/**
 * Reset the planet manager (useful for testing)
 */
export function resetPlanetManager() {
    if (_instance) {
        _instance.clear();
        _instance = null;
    }
}