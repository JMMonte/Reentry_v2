/**
 * CelestialBody Class
 * 
 * Represents a celestial body in the physics simulation with all necessary
 * properties and methods for orbital mechanics calculations.
 * 
 * This class provides a standardized interface for physics operations,
 * eliminating the need for hardcoded constants and providing caching
 * for expensive calculations.
 */

import * as THREE from 'three';
import { PhysicsConstants } from './PhysicsConstants.js';

export class CelestialBody {
    constructor(config) {
        // Validate required properties
        if (!config.name) {
            throw new Error('CelestialBody requires a name');
        }
        
        // Core identification
        this.name = config.name;
        this.naifId = config.naif_id || config.naifId;
        this.astronomyEngineName = config.astronomyEngineName || config.name;
        this.type = config.type; // 'planet', 'moon', 'star', 'barycenter', 'asteroid'
        this.symbol = config.symbol;
        
        // Hierarchy relationships
        this.parent = config.parent;
        this.children = [];
        
        // Physical properties
        this.mass = config.mass; // kg
        this.radius = config.radius; // km
        this.equatorialRadius = config.equatorialRadius || config.radius;
        this.polarRadius = config.polarRadius || config.radius;
        this.oblateness = config.oblateness || 0;
        this.J2 = config.J2 || 0; // Second zonal harmonic coefficient
        
        // Rotation properties
        this.rotationPeriod = config.rotationPeriod; // seconds
        this.rotationRate = config.rotationRate || (config.rotationPeriod ? 2 * Math.PI / config.rotationPeriod : 0); // rad/s
        this.tilt = config.tilt || 0; // degrees - axial tilt
        
        // Orbital properties
        this.orbitalElements = config.orbitalElements;
        this.canonicalOrbit = config.canonicalOrbit;
        this.orbitalPeriod = config.orbitalPeriod;
        this.semiMajorAxis = config.semiMajorAxis;
        
        // Atmospheric model
        this.atmosphericModel = config.atmosphericModel;
        this.atmosphere = config.atmosphere;
        
        // Cached computed properties
        this._GM = config.GM; // Will be computed if not provided
        this._soiRadius = config.soiRadius;
        this._hillSphere = config.hillSphere;
        this._escapeVelocity = null;
        this._surfaceGravity = null;
        this._synodicPeriod = null;
        
        // Dynamic properties (updated during simulation)
        this.position = new THREE.Vector3(); // km from SSB
        this.velocity = new THREE.Vector3(); // km/s
        this.lastUpdateTime = 0; // JD
        
        // Physics state cache
        this._gravityCache = new Map();
        this._atmosphereCache = new Map();
    }
    
    /**
     * Get gravitational parameter (GM) in km³/s²
     * Computed once and cached for performance
     */
    get GM() {
        if (this._GM === undefined || this._GM === null) {
            if (this.mass !== undefined && this.mass !== null) {
                this._GM = PhysicsConstants.PHYSICS.G * this.mass;
            } else {
                console.warn(`[CelestialBody] No mass data for ${this.name}, GM unavailable`);
                this._GM = 0;
            }
        }
        return this._GM;
    }
    
    /**
     * Set gravitational parameter directly (overrides mass-based calculation)
     */
    set GM(value) {
        this._GM = value;
    }
    
    /**
     * Get sphere of influence radius in km
     * Computed based on parent body if not explicitly set
     */
    get soiRadius() {
        if (this._soiRadius === undefined && this.parent && this.mass) {
            // Will be computed by parent relationship later
            return null;
        }
        return this._soiRadius;
    }
    
    set soiRadius(value) {
        this._soiRadius = value;
    }
    
    /**
     * Get escape velocity from surface in km/s
     */
    getEscapeVelocity(altitude = 0) {
        if (altitude < 0) return 0; // Handle negative altitude
        
        if (this._escapeVelocity === null || altitude > 0) {
            const r = this.radius + altitude;
            if (this.GM && r > 0) {
                const velocity = Math.sqrt(2 * this.GM / r);
                if (altitude === 0) {
                    this._escapeVelocity = velocity;
                }
                return velocity;
            }
            return 0;
        }
        return this._escapeVelocity;
    }
    
    /**
     * Get surface gravity in m/s²
     */
    getSurfaceGravity() {
        if (this._surfaceGravity === null) {
            if (this.GM && this.radius) {
                // Convert from km/s² to m/s²
                this._surfaceGravity = (this.GM / (this.radius * this.radius)) * 1000;
            } else {
                this._surfaceGravity = 0;
            }
        }
        return this._surfaceGravity;
    }
    
    /**
     * Get circular orbital velocity at given distance in km/s
     */
    getOrbitalVelocity(distance) {
        if (!this.GM || distance <= 0) return 0;
        return Math.sqrt(this.GM / distance);
    }
    
    /**
     * Get orbital velocity using vis-viva equation
     */
    getOrbitalVelocityAtRadius(semiMajorAxis, currentRadius) {
        if (!this.GM || semiMajorAxis <= 0 || currentRadius <= 0) return 0;
        return Math.sqrt(this.GM * (2 / currentRadius - 1 / semiMajorAxis));
    }
    
    /**
     * Compute gravitational acceleration at a position
     */
    computeGravitationalAcceleration(position) {
        const relativePos = this.position.clone().sub(position); // Vector from position to body center
        const distance = relativePos.length();
        
        if (distance === 0) return new THREE.Vector3();
        
        const accelMagnitude = this.GM / (distance * distance);
        return relativePos.normalize().multiplyScalar(accelMagnitude);
    }
    
    /**
     * Compute J2 perturbation acceleration (oblateness effect)
     */
    computeJ2Acceleration(position) {
        if (!this.J2 || !this.radius) return new THREE.Vector3();
        
        const relativePos = position.clone().sub(this.position);
        const r = relativePos.length();
        
        if (r < this.radius) return new THREE.Vector3();
        
        const x = relativePos.x;
        const y = relativePos.y;
        const z = relativePos.z;
        const r2 = r * r;
        const r5 = r2 * r2 * r;
        const Re2 = this.radius * this.radius;
        
        const factor = 1.5 * this.J2 * this.GM * Re2 / r5;
        const z2_r2 = (z * z) / r2;
        
        const ax = factor * x * (5 * z2_r2 - 1);
        const ay = factor * y * (5 * z2_r2 - 1);
        const az = factor * z * (5 * z2_r2 - 3);
        
        return new THREE.Vector3(ax, ay, az);
    }
    
    /**
     * Check if position is within sphere of influence
     */
    isWithinSOI(position) {
        if (!this.soiRadius) return false;
        return position.distanceTo(this.position) < this.soiRadius;
    }
    
    /**
     * Get atmospheric density at altitude (if body has atmosphere)
     */
    getAtmosphericDensity(altitude) {
        if (!this.atmosphericModel) return 0;
        
        const cacheKey = Math.floor(altitude);
        if (this._atmosphereCache.has(cacheKey)) {
            return this._atmosphereCache.get(cacheKey);
        }
        
        let density = 0;
        const model = this.atmosphericModel;
        
        if (altitude >= model.minAltitude && altitude <= model.maxAltitude) {
            if (typeof model.getDensity === 'function') {
                density = model.getDensity(altitude);
            } else {
                // Simple exponential model
                const h = altitude - (model.referenceAltitude || 0);
                const scaleHeight = model.scaleHeight || 10;
                const refDensity = model.referenceDensity || 0;
                density = refDensity * Math.exp(-h / scaleHeight);
            }
        }
        
        // Cache result for performance
        this._atmosphereCache.set(cacheKey, density);
        return density;
    }
    
    /**
     * Update position and velocity (called during simulation)
     */
    updateState(position, velocity, time) {
        this.position.copy(position);
        this.velocity.copy(velocity);
        this.lastUpdateTime = time;
        
        // Clear position-dependent caches
        this._gravityCache.clear();
    }
    
    /**
     * Add a child body to this body's system
     */
    addChild(childBody) {
        if (!this.children.includes(childBody)) {
            this.children.push(childBody);
            childBody.parent = this.name;
        }
    }
    
    /**
     * Remove a child body from this body's system
     */
    removeChild(childBody) {
        const index = this.children.indexOf(childBody);
        if (index > -1) {
            this.children.splice(index, 1);
            childBody.parent = null;
        }
    }
    
    /**
     * Get all bodies in this body's hierarchical system
     */
    getAllChildren() {
        const allChildren = [];
        const traverse = (body) => {
            body.children.forEach(child => {
                allChildren.push(child);
                traverse(child);
            });
        };
        traverse(this);
        return allChildren;
    }
    
    /**
     * Check if this body is a moon (has a planet parent)
     */
    isMoon() {
        return this.type === 'moon' || (!!this.parent && this.parent !== 'sun' && this.parent !== 'ss_barycenter');
    }
    
    /**
     * Check if this body is a planet
     */
    isPlanet() {
        return this.type === 'planet';
    }
    
    /**
     * Check if this body is a star
     */
    isStar() {
        return this.type === 'star';
    }
    
    /**
     * Check if this body is a barycenter
     */
    isBarycenter() {
        return this.type === 'barycenter';
    }
    
    /**
     * Get physics properties as a plain object (for compatibility)
     */
    toPhysicsObject() {
        return {
            name: this.name,
            naifId: this.naifId,
            mass: this.mass,
            radius: this.radius,
            GM: this.GM,
            J2: this.J2,
            position: this.position.toArray(),
            velocity: this.velocity.toArray(),
            soiRadius: this.soiRadius,
            type: this.type
        };
    }
    
    /**
     * Create a CelestialBody from configuration data
     */
    static fromConfig(config) {
        const validation = this.validateConfig(config);
        if (!validation.isValid) {
            throw new Error(`Invalid CelestialBody configuration: ${validation.errors.join(', ')}`);
        }
        return new CelestialBody(config);
    }
    
    /**
     * Validate configuration data before creating CelestialBody
     */
    static validateConfig(config) {
        const errors = [];
        
        if (!config.name) errors.push('Missing required field: name');
        if (config.naifId === undefined && config.naif_id === undefined) {
            errors.push('Missing required field: naifId or naif_id');
        }
        if (!config.type) errors.push('Missing required field: type');
        
        if (config.type !== 'barycenter') {
            if (!config.mass && !config.GM) {
                errors.push('Non-barycenter bodies require mass or GM');
            }
            if (!config.radius) {
                errors.push('Non-barycenter bodies require radius');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

export default CelestialBody;