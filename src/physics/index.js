/**
 * Physics Module - Self-Sufficient Embedded Backend
 * 
 * This module provides a complete physics backend for orbital mechanics calculations.
 * It's designed to be self-contained and work independently from visualization layers.
 * 
 * External components should interact with physics ONLY through this API.
 */

// Main Physics API - Simple, organized, no initialization required
export { default as Physics } from './PhysicsAPI.js';
export * from './PhysicsAPI.js';

// Direct access to core components (for advanced usage)
export { PhysicsEngine } from './PhysicsEngine.js';
export { PhysicsManager } from './PhysicsManager.js';

// Main unified API (the primary interface)
export { default as PhysicsAPI } from './PhysicsAPI.js';

// Core physics calculations
export { CelestialBody } from './core/CelestialBody.js';
export { PhysicsConstants } from './core/PhysicsConstants.js';
export { UnifiedSatellitePropagator } from './core/UnifiedSatellitePropagator.js';
export { OrbitalMechanics } from './core/OrbitalMechanics.js';
export { GravityCalculator } from './core/GravityCalculator.js';
export { AtmosphericModels } from './core/AtmosphericModels.js';

// Physics utilities
export { PhysicsUtils } from './utils/PhysicsUtils.js';
export { CoordinateTransforms } from './utils/CoordinateTransforms.js';

// Body data
export { solarSystemDataManager as PlanetaryDataManager } from './PlanetaryDataManager.js';

// State management
export { StateVectorCalculator } from './StateVectorCalculator.js';
export { PositionManager } from './PositionManager.js';
export { SolarSystemHierarchy } from './SolarSystemHierarchy.js';

/**
 * Usage Examples:
 * 
 * // Recommended: Domain-specific imports
 * import { Orbital, Bodies, Atmosphere, Utils } from './physics';
 * const elements = Orbital.calculateElements(position, velocity, body);
 * const hohmann = Orbital.calculateHohmannTransfer(params);
 * const density = Atmosphere.getDensity('Earth', 400);
 * const bodyData = Bodies.getData('Mars');
 * const deltaV = Utils.vector.localToWorldDeltaV(localDV, pos, vel);
 * 
 * // Alternative: Main API object
 * import Physics from './physics';
 * const elements = Physics.Orbital.calculateElements(position, velocity, body);
 * 
 * // Advanced: Direct access to core components
 * import { Advanced } from './physics';
 * const propagator = Advanced.UnifiedSatellitePropagator;
 */