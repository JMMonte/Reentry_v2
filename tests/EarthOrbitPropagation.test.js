import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import PhysicsConstants from '../src/physics/core/PhysicsConstants.js';
import Earth from '../src/physics/data/planets/Earth.js';
import Mars from '../src/physics/data/planets/Mars.js';

describe('Earth Orbit Propagation Issues', () => {
    let physicsEngine;
    
    beforeEach(() => {
        physicsEngine = new PhysicsEngine();
        
        // Set up Earth
        physicsEngine.bodies[399] = {
            name: 'Earth',
            type: 'planet',
            mass: Earth.mass,
            radius: Earth.radius,
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            naifId: 399,
            atmosphericModel: Earth.atmosphericModel,
            j2: Earth.j2,
            equatorialRadius: Earth.radius,
            polarRadius: Earth.polarRadius || Earth.radius * (1 - Earth.oblateness)
        };
        
        // Set up Mars for comparison
        physicsEngine.bodies[499] = {
            name: 'Mars',
            type: 'planet',
            mass: Mars.mass,
            radius: Mars.radius,
            position: new THREE.Vector3(2.28e8, 0, 0), // ~1.5 AU
            velocity: new THREE.Vector3(0, 24.1, 0),
            naifId: 499,
            atmosphericModel: Mars.atmosphericModel,
            j2: Mars.j2,
            equatorialRadius: Mars.radius,
            polarRadius: Mars.polarRadius || Mars.radius
        };
        
        // Set up Moon for Earth perturbations
        physicsEngine.bodies[301] = {
            name: 'Moon',
            type: 'moon',
            mass: 7.342e22,
            radius: 1737.4,
            position: new THREE.Vector3(384400, 0, 0),
            velocity: new THREE.Vector3(0, 1.022, 0),
            naifId: 301
        };
        
        // Set up Sun at realistic distance (1 AU from Earth)
        physicsEngine.bodies[10] = {
            name: 'Sun',
            type: 'star',
            mass: 1.989e30,
            radius: 695700,
            position: new THREE.Vector3(-1.496e8, 0, 0), // 1 AU away from Earth
            velocity: new THREE.Vector3(0, 0, 0),
            naifId: 10
        };
    });

    describe('Orbit Stability Comparison', () => {
        it('should propagate Earth satellite orbits stably at 400km', () => {
            const satellite = {
                id: 'earth-leo',
                centralBodyNaifId: 399,
                position: new THREE.Vector3(6771, 0, 0), // 400 km altitude
                velocity: new THREE.Vector3(0, 7.67, 0), // Circular velocity
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            physicsEngine.satellites = { 'earth-leo': satellite };
            
            // Track orbital parameters
            const initialRadius = satellite.position.length();
            const initialSpeed = satellite.velocity.length();
            const initialEnergy = physicsEngine._calculateOrbitalEnergy(satellite);
            
            // Propagate for one orbit
            const orbitalPeriod = 2 * Math.PI * Math.sqrt(
                Math.pow(initialRadius, 3) / (PhysicsConstants.PHYSICS.G * physicsEngine.bodies[399].mass)
            );
            const dt = 10; // 10 second timestep
            const steps = Math.ceil(orbitalPeriod / dt);
            
            let maxRadiusDeviation = 0;
            let maxSpeedDeviation = 0;
            
            for (let i = 0; i < steps; i++) {
                const accel = physicsEngine._computeSatelliteAcceleration(satellite);
                
                // Log acceleration components if they seem extreme
                if (accel.length() > 0.1) {
                    console.log(`Step ${i}: High acceleration detected`);
                    console.log(`  Total accel: ${accel.length()} km/s²`);
                    console.log(`  Components:`, satellite.a_bodies);
                    console.log(`  J2: ${satellite.a_j2}`);
                    console.log(`  Drag: ${satellite.a_drag}`);
                }
                
                // Simple RK4 integration
                const k1v = accel;
                const k1r = satellite.velocity;
                
                const v2 = satellite.velocity.clone().add(k1v.clone().multiplyScalar(dt/2));
                const r2 = satellite.position.clone().add(k1r.clone().multiplyScalar(dt/2));
                satellite.position.copy(r2);
                satellite.velocity.copy(v2);
                const k2v = physicsEngine._computeSatelliteAcceleration(satellite);
                const k2r = v2;
                
                const v3 = satellite.velocity.clone().add(k2v.clone().multiplyScalar(dt/2));
                const r3 = satellite.position.clone().add(k2r.clone().multiplyScalar(dt/2));
                satellite.position.copy(r3);
                satellite.velocity.copy(v3);
                const k3v = physicsEngine._computeSatelliteAcceleration(satellite);
                const k3r = v3;
                
                const v4 = satellite.velocity.clone().add(k3v.clone().multiplyScalar(dt));
                const r4 = satellite.position.clone().add(k3r.clone().multiplyScalar(dt));
                satellite.position.copy(r4);
                satellite.velocity.copy(v4);
                const k4v = physicsEngine._computeSatelliteAcceleration(satellite);
                const k4r = v4;
                
                // Restore original position for proper update
                satellite.position.copy(r2).sub(k1r.clone().multiplyScalar(dt/2));
                satellite.velocity.copy(v2).sub(k1v.clone().multiplyScalar(dt/2));
                
                // Update position and velocity
                const dv = k1v.clone().add(k2v.multiplyScalar(2)).add(k3v.multiplyScalar(2)).add(k4v).multiplyScalar(dt/6);
                const dr = k1r.clone().add(k2r.multiplyScalar(2)).add(k3r.multiplyScalar(2)).add(k4r).multiplyScalar(dt/6);
                
                satellite.velocity.add(dv);
                satellite.position.add(dr);
                
                // Track deviations
                const currentRadius = satellite.position.length();
                const currentSpeed = satellite.velocity.length();
                maxRadiusDeviation = Math.max(maxRadiusDeviation, Math.abs(currentRadius - initialRadius));
                maxSpeedDeviation = Math.max(maxSpeedDeviation, Math.abs(currentSpeed - initialSpeed));
            }
            
            // Check orbit stability
            const finalRadius = satellite.position.length();
            const finalSpeed = satellite.velocity.length();
            const finalEnergy = physicsEngine._calculateOrbitalEnergy(satellite);
            
            // Orbit should remain relatively stable
            expect(Math.abs(finalRadius - initialRadius)).toBeLessThan(10); // Less than 10 km deviation
            expect(Math.abs(finalSpeed - initialSpeed)).toBeLessThan(0.01); // Less than 10 m/s deviation
            expect(Math.abs(finalEnergy - initialEnergy) / Math.abs(initialEnergy)).toBeLessThan(0.01); // Less than 1% energy change
            
            console.log(`Earth 400km orbit test:`);
            console.log(`  Max radius deviation: ${maxRadiusDeviation.toFixed(3)} km`);
            console.log(`  Max speed deviation: ${maxSpeedDeviation.toFixed(6)} km/s`);
            console.log(`  Energy change: ${((finalEnergy - initialEnergy) / initialEnergy * 100).toFixed(4)}%`);
        });

        it('should propagate Mars satellite orbits stably at 400km', () => {
            const satellite = {
                id: 'mars-leo',
                centralBodyNaifId: 499,
                position: new THREE.Vector3(3790, 0, 0), // 400 km altitude above Mars
                velocity: new THREE.Vector3(0, 3.4, 0), // Circular velocity for Mars
                mass: 1000,
                crossSectionalArea: 10,
                dragCoefficient: 2.2
            };

            // Move satellite to Mars-centric coordinates
            satellite.position.add(physicsEngine.bodies[499].position);
            satellite.velocity.add(physicsEngine.bodies[499].velocity);

            physicsEngine.satellites = { 'mars-leo': satellite };
            
            // Convert to Mars-centric for tracking
            satellite.position.sub(physicsEngine.bodies[499].position);
            satellite.velocity.sub(physicsEngine.bodies[499].velocity);
            
            const initialRadius = satellite.position.length();
            const initialSpeed = satellite.velocity.length();
            
            // Propagate for one orbit
            const orbitalPeriod = 2 * Math.PI * Math.sqrt(
                Math.pow(initialRadius, 3) / (PhysicsConstants.PHYSICS.G * physicsEngine.bodies[499].mass)
            );
            const dt = 10;
            const steps = Math.ceil(orbitalPeriod / dt);
            
            let maxRadiusDeviation = 0;
            let maxSpeedDeviation = 0;
            
            for (let i = 0; i < steps; i++) {
                const accel = physicsEngine._computeSatelliteAcceleration(satellite);
                
                // Simple Euler integration for comparison
                satellite.velocity.add(accel.clone().multiplyScalar(dt));
                satellite.position.add(satellite.velocity.clone().multiplyScalar(dt));
                
                const currentRadius = satellite.position.length();
                const currentSpeed = satellite.velocity.length();
                maxRadiusDeviation = Math.max(maxRadiusDeviation, Math.abs(currentRadius - initialRadius));
                maxSpeedDeviation = Math.max(maxSpeedDeviation, Math.abs(currentSpeed - initialSpeed));
            }
            
            const finalRadius = satellite.position.length();
            const finalSpeed = satellite.velocity.length();
            
            console.log(`Mars 400km orbit test:`);
            console.log(`  Max radius deviation: ${maxRadiusDeviation.toFixed(3)} km`);
            console.log(`  Max speed deviation: ${maxSpeedDeviation.toFixed(6)} km/s`);
            
            // Mars orbits should also be stable
            expect(Math.abs(finalRadius - initialRadius)).toBeLessThan(10);
            expect(Math.abs(finalSpeed - initialSpeed)).toBeLessThan(0.01);
        });
    });

    describe('Perturbation Analysis', () => {
        it('should analyze perturbation magnitudes for Earth satellites', () => {
            const altitudes = [400, 4000, 40000]; // km
            const results = {};
            
            altitudes.forEach(alt => {
                const satellite = {
                    id: `earth-${alt}`,
                    centralBodyNaifId: 399,
                    position: new THREE.Vector3(6371 + alt, 0, 0),
                    velocity: new THREE.Vector3(0, Math.sqrt(PhysicsConstants.PHYSICS.G * Earth.mass / (6371 + alt)), 0),
                    mass: 1000,
                    crossSectionalArea: 10,
                    dragCoefficient: 2.2
                };
                
                physicsEngine.satellites = { [`earth-${alt}`]: satellite };
                
                // Compute acceleration
                const accel = physicsEngine._computeSatelliteAcceleration(satellite);
                
                // Extract components
                results[alt] = {
                    total: accel.length(),
                    earth: satellite.a_bodies?.[399] ? new THREE.Vector3(...satellite.a_bodies[399]).length() : 0,
                    moon: satellite.a_bodies?.[301] ? new THREE.Vector3(...satellite.a_bodies[301]).length() : 0,
                    sun: satellite.a_bodies?.[10] ? new THREE.Vector3(...satellite.a_bodies[10]).length() : 0,
                    j2: satellite.a_j2 ? new THREE.Vector3(...satellite.a_j2).length() : 0,
                    drag: satellite.a_drag ? new THREE.Vector3(...satellite.a_drag).length() : 0
                };
                
                console.log(`\nEarth satellite at ${alt}km altitude:`);
                console.log(`  Total acceleration: ${results[alt].total.toExponential(3)} km/s²`);
                console.log(`  Earth gravity: ${results[alt].earth.toExponential(3)} km/s²`);
                console.log(`  Moon perturbation: ${results[alt].moon.toExponential(3)} km/s²`);
                console.log(`  Sun perturbation: ${results[alt].sun.toExponential(3)} km/s²`);
                console.log(`  J2 perturbation: ${results[alt].j2.toExponential(3)} km/s²`);
                console.log(`  Drag: ${results[alt].drag.toExponential(3)} km/s²`);
            });
            
            // Sanity checks
            results[400].drag > 0 ? expect(results[400].drag).toBeGreaterThan(1e-10) : null;
            expect(results[40000].drag).toBeLessThan(1e-15); // No drag at GEO
            expect(results[400].j2).toBeGreaterThan(results[40000].j2); // J2 decreases with altitude
        });
    });
});

// Helper method for PhysicsEngine
PhysicsEngine.prototype._calculateOrbitalEnergy = function(satellite) {
    const centralBody = this.bodies[satellite.centralBodyNaifId];
    const r = satellite.position.length();
    const v = satellite.velocity.length();
    const mu = PhysicsConstants.PHYSICS.G * centralBody.mass;
    return (v * v / 2) - (mu / r);
};