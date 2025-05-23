// PhysicsEngine.js
import * as THREE from 'three';
import { Constants } from '../utils/Constants.js';
// Try importing the whole Astronomy module then destructuring
import * as Astronomy from 'astronomy-engine';

// Extract the functions we need from the Astronomy module
const { Body, BaryState, MakeTime, Rotation_EQJ_ECL, RotateVector, GeoMoon, RotationAxis } = Astronomy;

/**
 * Comprehensive Physics Engine for astronomical simulations
 * Integrates Astronomy Engine with N-body dynamics, barycenter calculations,
 * and high-precision orbital mechanics
 */
export class PhysicsEngine {
    constructor() {
        this.bodies = {}; // NAIF ID -> body data (changed from Map to Object)
        this.satellites = new Map(); // Custom satellites
        this.barycenters = new Map(); // Computed barycenters
        this.simulationTime = new Date(); // Current simulation time
        this.timeStep = 60; // seconds
        this.integrator = 'rk4'; // rk4, rk8, leapfrog, hermite
        this.relativistic = false; // Enable post-Newtonian corrections

        // Solar system hierarchy
        this.hierarchy = this._buildHierarchy();
    }

    /**
     * Initialize the physics engine with solar system bodies
     */
    async initialize(initialTime = new Date()) {
        // Validate the initial time parameter
        if (!initialTime || !(initialTime instanceof Date) || isNaN(initialTime.getTime())) {
            console.warn('[PhysicsEngine] Invalid initial time provided, using current time');
            initialTime = new Date();
        }
        
        this.simulationTime = new Date(initialTime.getTime());
        console.log('[PhysicsEngine] Initializing with time:', this.simulationTime.toISOString());

        // Initialize all solar system bodies using Astronomy Engine
        await this._initializeSolarSystemBodies();

        // Compute initial barycenters
        this._updateBarycenters();

        // Verify coordinate system alignment
        const coordTest = this.verifyCoordinateSystem();
        if (coordTest.isValid) {
            console.log('[PhysicsEngine] ✓ ECLIPJ2000 coordinate system verified');
        } else {
            console.warn('[PhysicsEngine] ⚠ Coordinate system verification failed:', coordTest);
        }

        return this;
    }

    /**
     * Add a satellite to the simulation
     */
    addSatellite(satellite) {
        this.satellites.set(satellite.id, {
            ...satellite,
            position: new THREE.Vector3().fromArray(satellite.position),
            velocity: new THREE.Vector3().fromArray(satellite.velocity),
            acceleration: new THREE.Vector3(),
            mass: satellite.mass || 1000, // kg
            dragCoefficient: satellite.dragCoefficient || 2.2,
            crossSectionalArea: satellite.crossSectionalArea || 10, // m²
            lastUpdate: this.simulationTime
        });
    }

    /**
     * Remove a satellite from the simulation
     */
    removeSatellite(id) {
        return this.satellites.delete(id);
    }

    /**
     * Advance the simulation by one time step
     */
    async step(deltaTime) {
        const actualDeltaTime = deltaTime || this.timeStep;

        // Update simulation time
        this.simulationTime = new Date(this.simulationTime.getTime() + actualDeltaTime * 1000);

        // Update all solar system body positions using Astronomy Engine
        await this._updateSolarSystemBodies();

        // Update barycenters
        this._updateBarycenters();

        // Integrate satellite dynamics
        await this._integrateSatellites(actualDeltaTime);

        return {
            time: this.simulationTime,
            bodies: this._getBodyStates(),
            satellites: this._getSatelliteStates()
        };
    }

    /**
     * Get current state of all bodies for rendering
     */
    getSimulationState() {
        return {
            time: this.simulationTime,
            bodies: this._getBodyStates(),
            satellites: this._getSatelliteStates(),
            barycenters: this._getBarycenterStates()
        };
    }

    /**
     * Set simulation time and immediately update all body positions
     */
    async setTime(newTime) {
        // Validate the new time
        if (!newTime || !(newTime instanceof Date) || isNaN(newTime.getTime())) {
            console.warn('[PhysicsEngine] Invalid time provided to setTime, keeping current time');
            return;
        }

        // Update simulation time
        this.simulationTime = new Date(newTime.getTime());
        
        // Immediately update all body positions and orientations for the new time
        // This ensures perfect synchronization between displayed time and orbital positions
        await this._updateSolarSystemBodies();
        
        // Update barycenters for the new time
        this._updateBarycenters();
        
        // console.log(`[PhysicsEngine] Time updated to ${this.simulationTime.toISOString()} with synchronized positions`);
    }

    /**
     * Set integration method
     */
    setIntegrator(method) {
        const validMethods = ['rk4', 'rk8', 'leapfrog', 'hermite'];
        if (validMethods.includes(method)) {
            this.integrator = method;
        }
    }

    /**
     * Enable/disable relativistic corrections
     */
    setRelativisticCorrections(enabled) {
        this.relativistic = enabled;
    }

    /**
     * Initialize solar system bodies using Astronomy Engine
     * @private
     */
    _initializeSolarSystemBodies() {
        // Define the solar system bodies we want to track
        const solarSystemBodies = [
            { name: 'Sun', naif: 10, mass: 1.989e30 },
            { name: 'Mercury', naif: 199, mass: 3.301e23 },
            { name: 'Venus', naif: 299, mass: 4.867e24 },
            { name: 'Earth', naif: 399, mass: 5.972e24 },
            { name: 'Mars', naif: 499, mass: 6.417e23 },
            { name: 'Jupiter', naif: 599, mass: 1.898e27 },
            { name: 'Saturn', naif: 699, mass: 5.683e26 },
            { name: 'Uranus', naif: 799, mass: 8.681e25 },
            { name: 'Neptune', naif: 899, mass: 1.024e26 },
            { name: 'Moon', naif: 301, mass: 7.342e22 }
        ];

        for (const body of solarSystemBodies) {
            try {
                let state = null;

                // Try different methods for getting the state
                if (body.name === 'Moon') {
                    // Special handling for Moon - try geocentric first
                    try {
                        const moonGeo = GeoMoon(this.simulationTime);
                        const earthState = this._getAstronomyEngineState('Earth', this.simulationTime);

                        if (earthState) {
                            const AU_TO_KM = 149597870.7;
                            state = {
                                position: [
                                    earthState.position[0] + moonGeo.x / AU_TO_KM * AU_TO_KM,
                                    earthState.position[1] + moonGeo.y / AU_TO_KM * AU_TO_KM,
                                    earthState.position[2] + moonGeo.z / AU_TO_KM * AU_TO_KM
                                ],
                                velocity: [0, 0, 0] // Will be calculated later
                            };
                        }
                    } catch (moonError) {
                        console.warn(`Failed to get Moon geocentric position:`, moonError);
                    }
                }

                // If no specific handling or it failed, try standard methods
                if (!state) {
                    // Try barycentric state first
                    state = this._getBarycentricState(body.name, this.simulationTime);

                    // If that fails, try heliocentric
                    if (!state) {
                        state = this._getAstronomyEngineState(body.name, this.simulationTime);
                    }
                }

                if (state) {
                    // Calculate orientation for this body
                    const orientation = this._calculateBodyOrientation(body.name, this.simulationTime);
                    
                    this.bodies[body.naif] = {
                        naif: body.naif,
                        name: body.name,
                        mass: body.mass,
                        position: new THREE.Vector3(state.position[0], state.position[1], state.position[2]),
                        velocity: new THREE.Vector3(state.velocity[0], state.velocity[1], state.velocity[2]),
                        acceleration: new THREE.Vector3(),
                        radius: this._getBodyRadius(body.naif),
                        isActive: true,
                        // Orientation data
                        quaternion: orientation.quaternion,
                        poleRA: orientation.poleRA,
                        poleDec: orientation.poleDec,
                        spin: orientation.spin,
                        northPole: orientation.northPole
                    };
                    console.log(`[PhysicsEngine] Initialized ${body.name} successfully with orientation`);
                } else {
                    // Create with default/fallback data
                    console.warn(`[PhysicsEngine] Failed to get state for ${body.name}, using defaults`);
                    const fallbackOrientation = this._calculateBodyOrientation(body.name, this.simulationTime);
                    
                    this.bodies[body.naif] = {
                        naif: body.naif,
                        name: body.name,
                        mass: body.mass,
                        position: new THREE.Vector3(0, 0, 0),
                        velocity: new THREE.Vector3(0, 0, 0),
                        acceleration: new THREE.Vector3(),
                        radius: this._getBodyRadius(body.naif),
                        isActive: false,
                        // Orientation data
                        quaternion: fallbackOrientation.quaternion,
                        poleRA: fallbackOrientation.poleRA,
                        poleDec: fallbackOrientation.poleDec,
                        spin: fallbackOrientation.spin,
                        northPole: fallbackOrientation.northPole
                    };
                }
            } catch (error) {
                console.error(`Failed to initialize ${body.name}:`, error);
                // Create placeholder body so the system doesn't break
                const fallbackOrientation = this._calculateBodyOrientation(body.name, this.simulationTime);
                
                this.bodies[body.naif] = {
                    naif: body.naif,
                    name: body.name,
                    mass: body.mass,
                    position: new THREE.Vector3(0, 0, 0),
                    velocity: new THREE.Vector3(0, 0, 0),
                    acceleration: new THREE.Vector3(),
                    radius: this._getBodyRadius(body.naif),
                    isActive: false,
                    // Orientation data
                    quaternion: fallbackOrientation.quaternion,
                    poleRA: fallbackOrientation.poleRA,
                    poleDec: fallbackOrientation.poleDec,
                    spin: fallbackOrientation.spin,
                    northPole: fallbackOrientation.northPole
                };
            }
        }

        console.log(`[PhysicsEngine] Initialized ${Object.keys(this.bodies).length} solar system bodies`);
    }

    /**
     * Update solar system body positions using Astronomy Engine
     * @private
     */
    _updateSolarSystemBodies() {
        for (const body of Object.values(this.bodies)) {
            if (!body.isActive) continue; // Skip inactive bodies

            try {
                let state = null;

                // Try different methods based on body type
                if (body.name === 'Moon') {
                    // Special Moon handling
                    try {
                        const moonGeo = GeoMoon(this.simulationTime);
                        const earthBody = this.bodies[399]; // Earth's NAIF ID
                        if (earthBody) {
                            const AU_TO_KM = 149597870.7;
                            state = {
                                position: [
                                    earthBody.position.x + moonGeo.x / AU_TO_KM * AU_TO_KM,
                                    earthBody.position.y + moonGeo.y / AU_TO_KM * AU_TO_KM,
                                    earthBody.position.z + moonGeo.z / AU_TO_KM * AU_TO_KM
                                ],
                                velocity: [0, 0, 0] // Simplified for now
                            };
                        }
                    } catch (moonError) {
                        console.warn(`Failed to update Moon position:`, moonError);
                    }
                }

                // If no special handling or it failed, try standard methods
                if (!state) {
                    // Try barycentric first, then heliocentric
                    state = this._getBarycentricState(body.name, this.simulationTime) ||
                        this._getAstronomyEngineState(body.name, this.simulationTime);
                }

                if (state) {
                    body.position.set(state.position[0], state.position[1], state.position[2]);
                    body.velocity.set(state.velocity[0], state.velocity[1], state.velocity[2]);
                    
                    // Update orientation for current time
                    const orientation = this._calculateBodyOrientation(body.name, this.simulationTime);
                    body.quaternion.copy(orientation.quaternion);
                    body.poleRA = orientation.poleRA;
                    body.poleDec = orientation.poleDec;
                    body.spin = orientation.spin;
                    body.northPole.copy(orientation.northPole);
                } else {
                    console.warn(`Failed to update ${body.name}: no state available`);
                }
            } catch (error) {
                console.warn(`Failed to update ${body.name}:`, error);
            }
        }
    }

    /**
     * Get state using Astronomy Engine for supported bodies
     * @private
     */
    _getAstronomyEngineState(bodyName, time) {
        try {
            // Validate the time parameter
            if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
                console.warn(`[PhysicsEngine] Invalid time for ${bodyName}, using current time`);
                time = new Date();
            }
            
            // Create AstroTime object for Astronomy Engine
            const astroTime = MakeTime(time);
            
            // Use Body function for heliocentric positions
            const helioState = Body(bodyName, astroTime);

            // Convert from AU to km
            const AU_TO_KM = 149597870.7;
            
            // Create position vector in J2000 equatorial coordinates
            const eqjPosition = {
                x: helioState.x * AU_TO_KM,
                y: helioState.y * AU_TO_KM,
                z: helioState.z * AU_TO_KM,
                t: astroTime
            };

            // Calculate velocity using finite differences
            const dt = 60; // 60 seconds
            const futureTime = new Date(time.getTime() + dt * 1000);
            const futureAstroTime = MakeTime(futureTime);
            const futureState = Body(bodyName, futureAstroTime);

            const eqjVelocity = {
                x: (futureState.x - helioState.x) * AU_TO_KM / dt,
                y: (futureState.y - helioState.y) * AU_TO_KM / dt,
                z: (futureState.z - helioState.z) * AU_TO_KM / dt,
                t: astroTime
            };

            // Transform from J2000 equatorial (EQJ) to J2000 ecliptic (ECL)
            const rotationMatrix = Rotation_EQJ_ECL();
            
            // Transform position vector
            const eclPosition = RotateVector(rotationMatrix, eqjPosition);
            
            // Transform velocity vector
            const eclVelocity = RotateVector(rotationMatrix, eqjVelocity);

            return {
                position: [eclPosition.x, eclPosition.y, eclPosition.z],
                velocity: [eclVelocity.x, eclVelocity.y, eclVelocity.z]
            };
        } catch (error) {
            console.warn(`[PhysicsEngine] Failed to get Astronomy Engine state for ${bodyName}:`, error);
            return null;
        }
    }

    /**
     * Get barycentric state for bodies
     * @private  
     */
    _getBarycentricState(bodyName, time) {
        try {
            // Validate the time parameter
            if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
                console.warn(`[PhysicsEngine] Invalid time for ${bodyName}, using current time`);
                time = new Date();
            }
            
            // Create AstroTime object and use direct BaryState import
            const astroTime = MakeTime(time);
            const baryState = BaryState(bodyName, astroTime);

            // Convert from AU to km and AU/day to km/s
            const AU_TO_KM = 149597870.7;
            const DAYS_TO_SEC = 86400;

            // Create position and velocity vectors in J2000 equatorial coordinates
            const eqjPosition = {
                x: baryState.x * AU_TO_KM,
                y: baryState.y * AU_TO_KM,
                z: baryState.z * AU_TO_KM,
                t: astroTime
            };

            const eqjVelocity = {
                x: baryState.vx * AU_TO_KM / DAYS_TO_SEC,
                y: baryState.vy * AU_TO_KM / DAYS_TO_SEC,
                z: baryState.vz * AU_TO_KM / DAYS_TO_SEC,
                t: astroTime
            };

            // Transform from J2000 equatorial (EQJ) to J2000 ecliptic (ECL)
            const rotationMatrix = Rotation_EQJ_ECL();
            
            // Transform position vector
            const eclPosition = RotateVector(rotationMatrix, eqjPosition);
            
            // Transform velocity vector
            const eclVelocity = RotateVector(rotationMatrix, eqjVelocity);

            return {
                position: [eclPosition.x, eclPosition.y, eclPosition.z],
                velocity: [eclVelocity.x, eclVelocity.y, eclVelocity.z]
            };
        } catch (error) {
            console.warn(`[PhysicsEngine] Failed to get barycentric state for ${bodyName}:`, error);
            return null;
        }
    }

    /**
     * Private: Update barycenter positions
     */
    _updateBarycenters() {
        // Solar System Barycenter (SSB) - always at origin
        this.barycenters.set(0, {
            naif: 0,
            name: 'Solar System Barycenter',
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            mass: 0 // Computed dynamically
        });

        // Earth-Moon Barycenter
        const earth = this.bodies[399];
        const moon = this.bodies[301];
        if (earth && moon) {
            const totalMass = earth.mass + moon.mass;
            const baryPos = new THREE.Vector3()
                .addScaledVector(earth.position, earth.mass / totalMass)
                .addScaledVector(moon.position, moon.mass / totalMass);
            const baryVel = new THREE.Vector3()
                .addScaledVector(earth.velocity, earth.mass / totalMass)
                .addScaledVector(moon.velocity, moon.mass / totalMass);

            this.barycenters.set(3, {
                naif: 3,
                name: 'Earth-Moon Barycenter',
                position: baryPos,
                velocity: baryVel,
                mass: totalMass
            });
        }
    }

    /**
     * Private: Integrate satellite dynamics
     */
    async _integrateSatellites(deltaTime) {
        for (const [, satellite] of this.satellites) {
            const acceleration = this._computeSatelliteAcceleration(satellite);

            switch (this.integrator) {
                case 'rk4':
                    this._integrateRK4(satellite, acceleration, deltaTime);
                    break;
                case 'rk8':
                    this._integrateRK8(satellite, acceleration, deltaTime);
                    break;
                case 'leapfrog':
                    this._integrateLeapfrog(satellite, acceleration, deltaTime);
                    break;
                case 'hermite':
                    this._integrateHermite(satellite, acceleration, deltaTime);
                    break;
            }

            satellite.lastUpdate = new Date(this.simulationTime.getTime());
        }
    }

    /**
     * Private: Compute total acceleration on a satellite
     */
    _computeSatelliteAcceleration(satellite) {
        const totalAccel = new THREE.Vector3();

        // Gravitational forces from all bodies
        for (const body of Object.values(this.bodies)) {
            const r = new THREE.Vector3().subVectors(body.position, satellite.position);
            const distance = r.length();

            if (distance > 0) {
                const gravAccel = (Constants.G * body.mass) / (distance * distance * distance);
                totalAccel.addScaledVector(r, gravAccel);
            }
        }

        // Add atmospheric drag if applicable
        if (this._isInAtmosphere(satellite)) {
            const dragAccel = this._computeDragAcceleration(satellite);
            totalAccel.add(dragAccel);
        }

        // Add relativistic corrections if enabled
        if (this.relativistic) {
            const relativisticAccel = this._computeRelativisticCorrections();
            totalAccel.add(relativisticAccel);
        }

        return totalAccel;
    }

    /**
     * Private: Check if satellite is in atmosphere
     */
    _isInAtmosphere(satellite) {
        // Find closest body (typically Earth for most satellites)
        let closestBody = null;
        let minDistance = Infinity;

        for (const body of Object.values(this.bodies)) {
            const distance = satellite.position.distanceTo(body.position);
            if (distance < minDistance) {
                minDistance = distance;
                closestBody = body;
            }
        }

        if (closestBody && closestBody.naif === 399) { // Earth
            const altitude = minDistance - Constants.earthRadius;
            return altitude < Constants.atmosphereCutoffAltitude;
        }

        return false;
    }

    /**
     * Private: Compute atmospheric drag acceleration
     */
    _computeDragAcceleration(satellite) {
        // Implementation similar to your existing drag calculation
        const earth = this.bodies[399];
        if (!earth) return new THREE.Vector3();

        const r = satellite.position.distanceTo(earth.position);
        const altitude = r - Constants.earthRadius;

        if (altitude > Constants.atmosphereCutoffAltitude) {
            return new THREE.Vector3();
        }

        // Atmospheric density model (simplified)
        const density = Math.exp(-(altitude - 0) / 8500) * 1.225; // kg/m³

        // Relative velocity (accounting for Earth's rotation)
        const omega = 2 * Math.PI / Constants.siderialDay;
        const earthRelPos = new THREE.Vector3().subVectors(satellite.position, earth.position);
        const rotVel = new THREE.Vector3(-omega * earthRelPos.y, omega * earthRelPos.x, 0);
        const relVel = new THREE.Vector3().subVectors(satellite.velocity, earth.velocity).sub(rotVel);

        const speed = relVel.length();
        if (speed === 0) return new THREE.Vector3();

        // Drag force: F = -0.5 * ρ * v² * Cd * A * (v/|v|)
        const dragMagnitude = 0.5 * density * speed * speed *
            satellite.dragCoefficient * satellite.crossSectionalArea / satellite.mass;

        return relVel.clone().normalize().multiplyScalar(-dragMagnitude);
    }

    /**
     * Private: Compute relativistic corrections (placeholder)
     */
    _computeRelativisticCorrections() {
        // Post-Newtonian corrections for high precision
        // This is a simplified implementation
        return new THREE.Vector3();
    }

    /**
     * Private: Get body radius
     */
    _getBodyRadius(naifId) {
        const radii = {
            10: 696000,   // Sun
            199: 2439.7,  // Mercury
            299: 6051.8,  // Venus
            399: 6371.0,  // Earth
            499: 3389.5,  // Mars
            599: 69911,   // Jupiter
            699: 58232,   // Saturn
            799: 25362,   // Uranus
            899: 24622,   // Neptune
            301: 1737.4   // Moon
        };
        return radii[naifId] || 1000;
    }

    /**
     * Private: Build solar system hierarchy
     */
    _buildHierarchy() {
        return {
            0: { // SSB
                children: [10, 1, 2, 3, 4, 5, 6, 7, 8, 9]
            },
            3: { // Earth-Moon Barycenter
                children: [399, 301]
            }
        };
    }

    /**
     * Private: Get current body states for rendering
     */
    _getBodyStates() {
        const states = {};
        for (const [naifId, body] of Object.entries(this.bodies)) {
            states[naifId] = {
                naif: naifId,
                name: body.name,
                position: body.position.toArray(),
                velocity: body.velocity.toArray(),
                mass: body.mass,
                radius: body.radius,
                // Orientation data for Three.js rendering
                quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
                poleRA: body.poleRA,
                poleDec: body.poleDec,
                spin: body.spin,
                northPole: body.northPole.toArray()
            };
        }
        return states;
    }

    /**
     * Private: Get current satellite states
     */
    _getSatelliteStates() {
        const states = {};
        for (const [id, satellite] of this.satellites) {
            states[id] = {
                id: id,
                position: satellite.position.toArray(),
                velocity: satellite.velocity.toArray(),
                acceleration: satellite.acceleration.toArray(),
                mass: satellite.mass
            };
        }
        return states;
    }

    /**
     * Private: Get current barycenter states
     */
    _getBarycenterStates() {
        const states = {};
        for (const [naifId, barycenter] of this.barycenters) {
            states[naifId] = {
                naif: naifId,
                name: barycenter.name,
                position: barycenter.position.toArray(),
                velocity: barycenter.velocity.toArray(),
                mass: barycenter.mass
            };
        }
        return states;
    }

    // Placeholder implementations for other integrators
    _integrateRK8(satellite, acceleration, dt) {
        // 8th order Runge-Kutta implementation
        this._integrateRK4(satellite, acceleration, dt); // Fallback to RK4 for now
    }

    _integrateLeapfrog(satellite, acceleration, dt) {
        // Leapfrog integration implementation
        this._integrateRK4(satellite, acceleration, dt); // Fallback to RK4 for now
    }

    _integrateHermite(satellite, acceleration, dt) {
        // Hermite integration implementation
        this._integrateRK4(satellite, acceleration, dt); // Fallback to RK4 for now
    }

    /**
     * Private: RK4 integration
     */
    _integrateRK4(satellite, acceleration, dt) {
        const pos0 = satellite.position.clone();
        const vel0 = satellite.velocity.clone();
        const acc0 = acceleration;

        // k1
        const k1v = acc0.clone().multiplyScalar(dt);
        const k1p = vel0.clone().multiplyScalar(dt);

        // k2
        const pos1 = pos0.clone().addScaledVector(k1p, 0.5);
        const vel1 = vel0.clone().addScaledVector(k1v, 0.5);
        satellite.position.copy(pos1);
        satellite.velocity.copy(vel1);
        const acc1 = this._computeSatelliteAcceleration(satellite);
        const k2v = acc1.clone().multiplyScalar(dt);
        const k2p = vel1.clone().multiplyScalar(dt);

        // k3
        const pos2 = pos0.clone().addScaledVector(k2p, 0.5);
        const vel2 = vel0.clone().addScaledVector(k2v, 0.5);
        satellite.position.copy(pos2);
        satellite.velocity.copy(vel2);
        const acc2 = this._computeSatelliteAcceleration(satellite);
        const k3v = acc2.clone().multiplyScalar(dt);
        const k3p = vel2.clone().multiplyScalar(dt);

        // k4
        const pos3 = pos0.clone().add(k3p);
        const vel3 = vel0.clone().add(k3v);
        satellite.position.copy(pos3);
        satellite.velocity.copy(vel3);
        const acc3 = this._computeSatelliteAcceleration(satellite);
        const k4v = acc3.clone().multiplyScalar(dt);
        const k4p = vel3.clone().multiplyScalar(dt);

        // Final update
        satellite.position.copy(pos0)
            .addScaledVector(k1p, 1 / 6)
            .addScaledVector(k2p, 1 / 3)
            .addScaledVector(k3p, 1 / 3)
            .addScaledVector(k4p, 1 / 6);

        satellite.velocity.copy(vel0)
            .addScaledVector(k1v, 1 / 6)
            .addScaledVector(k2v, 1 / 3)
            .addScaledVector(k3v, 1 / 3)
            .addScaledVector(k4v, 1 / 6);

        satellite.acceleration.copy(acceleration);
    }

    /**
     * Verify ECLIPJ2000 coordinate system alignment
     * This method checks that our coordinate transformations properly respect
     * the vernal equinox as the X-axis direction
     */
    verifyCoordinateSystem(time = null) {
        const testTime = time || this.simulationTime;
        const astroTime = MakeTime(testTime);
        
        try {
            // Test 1: Verify that the vernal equinox direction is indeed the X-axis
            // The vernal equinox is at RA=0h, Dec=0° in J2000 equatorial coordinates
            const vernalEquinoxEQJ = {
                x: 1, // cos(0°) * cos(0°)
                y: 0, // cos(0°) * sin(0°)  
                z: 0, // sin(0°)
                t: astroTime
            };
            
            // Transform to ECLIPJ2000
            const rotationMatrix = Rotation_EQJ_ECL();
            const vernalEquinoxECL = RotateVector(rotationMatrix, vernalEquinoxEQJ);
            
            console.log(`[PhysicsEngine] Vernal Equinox in ECLIPJ2000: (${vernalEquinoxECL.x.toFixed(6)}, ${vernalEquinoxECL.y.toFixed(6)}, ${vernalEquinoxECL.z.toFixed(6)})`);
            console.log(`[PhysicsEngine] Should be close to (1, 0, 0) for proper X-axis alignment`);
            
            // Test 2: Check obliquity of ecliptic (should be ~23.4°)
            const celestialNorthPoleEQJ = {
                x: 0,
                y: 0, 
                z: 1, // North celestial pole in equatorial coordinates
                t: astroTime
            };
            
            const celestialNorthPoleECL = RotateVector(rotationMatrix, celestialNorthPoleEQJ);
            const obliquity = Math.acos(celestialNorthPoleECL.z) * (180 / Math.PI);
            
            console.log(`[PhysicsEngine] Obliquity of ecliptic: ${obliquity.toFixed(4)}° (expected ~23.4°)`);
            
            return {
                vernalEquinoxDirection: [vernalEquinoxECL.x, vernalEquinoxECL.y, vernalEquinoxECL.z],
                obliquity: obliquity,
                isValid: Math.abs(vernalEquinoxECL.x - 1.0) < 0.001 && 
                        Math.abs(vernalEquinoxECL.y) < 0.001 && 
                        Math.abs(vernalEquinoxECL.z) < 0.001
            };
            
        } catch (error) {
            console.error('[PhysicsEngine] Coordinate system verification failed:', error);
            return { isValid: false, error: error.message };
        }
    }

    /**
     * Calculate planetary orientation using Astronomy Engine
     * @private
     */
    _calculateBodyOrientation(bodyName, time) {
        try {
            // Validate the time parameter
            if (!time || !(time instanceof Date) || isNaN(time.getTime())) {
                console.warn(`[PhysicsEngine] Invalid time for ${bodyName} orientation, using current time`);
                time = new Date();
            }
            
            const astroTime = MakeTime(time);
            const axisInfo = RotationAxis(bodyName, astroTime);
            
            // The axis info gives us (in J2000 equatorial coordinates):
            // - ra: right ascension of north pole (hours) - measured from vernal equinox
            // - dec: declination of north pole (degrees) - measured from celestial equator
            // - spin: rotation angle of prime meridian (degrees) - measured from ascending node of equator on fixed plane
            
            // Convert RA from hours to radians (15° per hour)
            const raRad = axisInfo.ra * (Math.PI / 12);
            
            // Convert declination from degrees to radians
            const decRad = axisInfo.dec * (Math.PI / 180);
            
            // Convert spin from degrees to radians
            const spinRad = axisInfo.spin * (Math.PI / 180);
            
            // Create the pole direction vector in J2000 equatorial coordinates
            // This is the planet's rotation axis (north pole direction)
            const poleX_eqj = Math.cos(decRad) * Math.cos(raRad);
            const poleY_eqj = Math.cos(decRad) * Math.sin(raRad);
            const poleZ_eqj = Math.sin(decRad);
            
            // Transform pole vector from J2000 equatorial (EQJ) to J2000 ecliptic (ECL)
            const poleVector_eqj = {
                x: poleX_eqj,
                y: poleY_eqj,
                z: poleZ_eqj,
                t: astroTime
            };
            
            const rotationMatrix = Rotation_EQJ_ECL();
            const poleVector_ecl = RotateVector(rotationMatrix, poleVector_eqj);
            
            // Create Three.js vector from transformed coordinates (now in ECLIPJ2000)
            const poleVector = new THREE.Vector3(poleVector_ecl.x, poleVector_ecl.y, poleVector_ecl.z);
            
            // Now we need to construct the orientation properly
            // In ECLIPJ2000: X-axis points to vernal equinox, Z-axis points to north ecliptic pole
            
            // Step 1: Find the prime meridian direction in the equatorial plane of the planet
            // The spin angle is measured from the ascending node of the planet's equator
            // We need to use the vernal equinox direction as the reference
            
            // Start with the vernal equinox direction (ECLIPJ2000 X-axis)
            const vernalEquinox = new THREE.Vector3(1, 0, 0);
            
            // Project the vernal equinox onto the planet's equatorial plane
            // by removing the component parallel to the pole
            const poleComponent = vernalEquinox.clone().projectOnVector(poleVector);
            const primeReference = vernalEquinox.clone().sub(poleComponent).normalize();
            
            // If the result is too small (pole nearly parallel to vernal equinox), use Y-axis
            if (primeReference.length() < 0.1) {
                const yAxis = new THREE.Vector3(0, 1, 0);
                const poleComponentY = yAxis.clone().projectOnVector(poleVector);
                primeReference.copy(yAxis).sub(poleComponentY).normalize();
            }
            
            // Step 2: Apply the spin rotation to get the actual prime meridian direction
            const spinQuaternion = new THREE.Quaternion().setFromAxisAngle(poleVector, spinRad);
            const primeMeridianDirection = primeReference.clone().applyQuaternion(spinQuaternion);
            
            // Apply 90° correction around the pole to fix surface orientation
            const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(poleVector, Math.PI / 2);
            primeMeridianDirection.applyQuaternion(correctionQuaternion);
            
            // Step 3: Construct the planet's coordinate system
            // For a Z-up system (after base rotation):
            // Z-axis: pole direction (rotation axis)
            // X-axis: prime meridian direction 
            // Y-axis: completes right-handed system (X cross Z, not Z cross X)
            const planetZ = poleVector.clone().normalize();
            const planetX = primeMeridianDirection.clone().normalize();
            const planetY = new THREE.Vector3().crossVectors(planetX, planetZ).normalize(); // Fixed order
            
            // Ensure right-handed system
            if (planetX.dot(new THREE.Vector3().crossVectors(planetY, planetZ)) < 0) {
                planetY.negate();
            }
            
            // Step 4: Create rotation matrix that transforms FROM planet frame TO ECLIPJ2000
            // In planet frame: X=prime meridian, Y=completes system, Z=north pole
            // In ECLIPJ2000: X=vernal equinox, Y=90° east ecliptic, Z=north ecliptic pole
            // This matrix has planet frame axes as COLUMNS
            const rotMatrix = new THREE.Matrix3().set(
                planetX.x, planetY.x, planetZ.x,
                planetX.y, planetY.y, planetZ.y,
                planetX.z, planetY.z, planetZ.z
            );
            
            // Convert rotation matrix to quaternion
            const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().setFromMatrix3(rotMatrix));
            
            // No base rotation compensation needed - coordinate transformation handled at orbital level
            
            return {
                quaternion: quaternion,
                poleRA: axisInfo.ra,
                poleDec: axisInfo.dec,
                spin: axisInfo.spin,
                northPole: poleVector // Now in ECLIPJ2000
            };
        } catch (error) {
            console.warn(`[PhysicsEngine] Failed to calculate orientation for ${bodyName}:`, error);
            // Return identity quaternion as fallback
            return {
                quaternion: new THREE.Quaternion(),
                poleRA: 0,
                poleDec: 90,
                spin: 0,
                northPole: new THREE.Vector3(0, 0, 1)
            };
        }
    }
} 