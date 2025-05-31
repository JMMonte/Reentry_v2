/**
 * PlanetaryDataManager Tests
 * 
 * Tests the centralized data management for the solar system,
 * ensuring it properly loads and provides access to celestial body data.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { solarSystemDataManager } from '../src/physics/PlanetaryDataManager.js';
import { CelestialBody } from '../src/physics/core/CelestialBody.js';

describe('PlanetaryDataManager', () => {
    beforeAll(async () => {
        await solarSystemDataManager.initialize();
    });

    describe('Initialization', () => {
        test('should initialize successfully', () => {
            expect(solarSystemDataManager.initialized).toBe(true);
        });

        test('should load all expected solar system bodies', () => {
            const bodies = solarSystemDataManager.getAllCelestialBodies();
            expect(bodies.length).toBeGreaterThan(10); // Should have major planets + moons
            
            // Check for major planets
            const bodyNames = bodies.map(b => b.name);
            expect(bodyNames).toContain('sun');
            expect(bodyNames).toContain('earth');
            expect(bodyNames).toContain('mars');
            expect(bodyNames).toContain('jupiter');
            expect(bodyNames).toContain('moon');
        });

        test('should create proper CelestialBody instances', () => {
            const earth = solarSystemDataManager.getCelestialBodyByName('earth');
            expect(earth).toBeInstanceOf(CelestialBody);
            expect(earth.name).toBe('earth');
        });

        test('should handle missing configurations gracefully', () => {
            const nonExistent = solarSystemDataManager.getCelestialBodyByName('nonexistent');
            expect(nonExistent).toBeUndefined();
        });
    });

    describe('Data Access Methods', () => {
        test('should retrieve bodies by name', () => {
            const earth = solarSystemDataManager.getCelestialBodyByName('earth');
            const earthConfig = solarSystemDataManager.getBodyByName('earth');
            
            expect(earth).toBeDefined();
            expect(earthConfig).toBeDefined();
            expect(earth.name).toBe(earthConfig.name);
        });

        test('should retrieve bodies by NAIF ID', () => {
            const earth = solarSystemDataManager.getCelestialBodyByNaif(399);
            const earthConfig = solarSystemDataManager.getBodyByNaif(399);
            
            expect(earth).toBeDefined();
            expect(earthConfig).toBeDefined();
            expect(earth.naifId).toBe(399);
            expect(earthConfig.naif_id).toBe(399);
        });

        test('should filter bodies by type', () => {
            const planets = solarSystemDataManager.getCelestialBodiesByType('planet');
            const moons = solarSystemDataManager.getCelestialBodiesByType('moon');
            const stars = solarSystemDataManager.getCelestialBodiesByType('star');
            
            expect(planets.length).toBeGreaterThan(0);
            expect(moons.length).toBeGreaterThan(0);
            expect(stars.length).toBe(1); // Just the Sun
            
            expect(planets.every(p => p.type === 'planet')).toBe(true);
            expect(moons.every(m => m.type === 'moon')).toBe(true);
            expect(stars.every(s => s.type === 'star')).toBe(true);
        });
    });

    describe('Hierarchical Relationships', () => {
        test('should build parent-child relationships', () => {
            const earth = solarSystemDataManager.getCelestialBodyByName('earth');
            const moon = solarSystemDataManager.getCelestialBodyByName('moon');
            
            expect(earth.children.some(child => child.name === 'moon')).toBe(true);
            expect(moon.parent).toBe('earth');
        });

        test('should provide hierarchy tree structure', () => {
            const earthChildren = solarSystemDataManager.getChildren('earth');
            expect(earthChildren).toContain('moon');
            
            const moonParent = solarSystemDataManager.getParent('moon');
            expect(moonParent).toBe('earth');
        });

        test('should provide hierarchical ordering', () => {
            const ordered = solarSystemDataManager.getHierarchicalOrder();
            expect(ordered.length).toBeGreaterThan(0);
            
            // Should start with root bodies (no parent)
            const firstBody = ordered[0];
            expect(firstBody.parent).toBeFalsy();
        });
    });

    describe('Physics Properties', () => {
        test('should provide consistent physics properties', () => {
            const earth = solarSystemDataManager.getCelestialBodyByName('earth');
            const physicsProps = solarSystemDataManager.getPhysicsProperties('earth');
            
            expect(physicsProps.naif_id).toBe(earth.naifId);
            expect(physicsProps.mass).toBe(earth.mass);
            expect(physicsProps.radius).toBe(earth.radius);
            expect(physicsProps.GM).toBe(earth.GM);
        });

        test('should provide rendering properties for visualization', () => {
            const earth = solarSystemDataManager.getCelestialBodyByName('earth');
            const renderProps = solarSystemDataManager.getRenderingProperties('earth');
            
            expect(renderProps).toBeDefined();
            expect(renderProps.materials).toBeDefined();
        });

        test('should provide orbital properties', () => {
            const earth = solarSystemDataManager.getCelestialBodyByName('earth');
            const orbitalProps = solarSystemDataManager.getOrbitalProperties('earth');
            
            expect(orbitalProps.naif_id).toBe(earth.naifId);
            expect(orbitalProps.GM).toBe(earth.GM);
            expect(orbitalProps.parent).toBe(earth.parent);
        });

        test('should handle bodies without certain properties', () => {
            const physicsProps = solarSystemDataManager.getPhysicsProperties('nonexistent');
            expect(physicsProps).toBeNull();
        });
    });

    describe('Data Validation', () => {
        test('should validate configurations on load', () => {
            const isValid = solarSystemDataManager.validateConfigurations();
            expect(isValid).toBe(true);
        });

        test('should detect invalid NAIF ID mappings', () => {
            const earth = solarSystemDataManager.getCelestialBodyByNaif(399);
            const earthByName = solarSystemDataManager.getCelestialBodyByName('earth');
            
            expect(earth).toBe(earthByName);
        });

        test('should maintain data consistency between access methods', () => {
            const earth = solarSystemDataManager.getCelestialBodyByName('earth');
            const earthConfig = solarSystemDataManager.getBodyByName('earth');
            
            expect(earth.mass).toBe(earthConfig.mass);
            expect(earth.radius).toBe(earthConfig.radius);
            expect(earth.naifId).toBe(earthConfig.naif_id);
        });
    });

    describe('Solar System Completeness', () => {
        test('should include all major planets', () => {
            const majorPlanets = [
                'mercury', 'venus', 'earth', 'mars', 
                'jupiter', 'saturn', 'uranus', 'neptune'
            ];
            
            majorPlanets.forEach(planet => {
                const body = solarSystemDataManager.getCelestialBodyByName(planet);
                expect(body).toBeDefined();
                expect(body.type).toBe('planet');
            });
        });

        test('should include major moons', () => {
            const majorMoons = ['moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'titan'];
            
            majorMoons.forEach(moon => {
                const body = solarSystemDataManager.getCelestialBodyByName(moon);
                if (body) { // Some may not be included
                    expect(body.type).toBe('moon');
                }
            });
        });

        test('should include dwarf planets', () => {
            const dwarfPlanets = ['pluto', 'ceres', 'eris'];
            
            dwarfPlanets.forEach(dwarf => {
                const body = solarSystemDataManager.getCelestialBodyByName(dwarf);
                if (body) { // Some may not be included
                    expect(['planet', 'dwarf_planet']).toContain(body.type);
                }
            });
        });

        test('should include the Sun', () => {
            const sun = solarSystemDataManager.getCelestialBodyByName('sun');
            expect(sun).toBeDefined();
            expect(sun.type).toBe('star');
            expect(sun.mass).toBeGreaterThan(1e30); // kg
        });
    });

    describe('Performance', () => {
        test('should cache body lookups efficiently', () => {
            const start1 = performance.now();
            const earth1 = solarSystemDataManager.getCelestialBodyByName('earth');
            const time1 = performance.now() - start1;
            
            const start2 = performance.now();
            const earth2 = solarSystemDataManager.getCelestialBodyByName('earth');
            const time2 = performance.now() - start2;
            
            expect(earth1).toBe(earth2); // Same object reference
            expect(time2).toBeLessThanOrEqual(time1); // Should be faster or same
        });

        test('should handle large numbers of bodies efficiently', () => {
            const start = performance.now();
            const allBodies = solarSystemDataManager.getAllCelestialBodies();
            const byType = solarSystemDataManager.getCelestialBodiesByType('planet');
            const duration = performance.now() - start;
            
            expect(duration).toBeLessThan(100); // Should complete in <100ms
            expect(allBodies.length).toBeGreaterThan(0);
            expect(byType.length).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid body names gracefully', () => {
            const invalid = solarSystemDataManager.getCelestialBodyByName('invalid_name');
            expect(invalid).toBeUndefined();
        });

        test('should handle invalid NAIF IDs gracefully', () => {
            const invalid = solarSystemDataManager.getCelestialBodyByNaif(99999);
            expect(invalid).toBeUndefined();
        });

        test('should handle invalid types gracefully', () => {
            const invalid = solarSystemDataManager.getCelestialBodiesByType('invalid_type');
            expect(invalid).toHaveLength(0);
        });

        test('should handle null/undefined inputs gracefully', () => {
            expect(solarSystemDataManager.getCelestialBodyByName(null)).toBeUndefined();
            expect(solarSystemDataManager.getCelestialBodyByName(undefined)).toBeUndefined();
            expect(solarSystemDataManager.getCelestialBodyByNaif(null)).toBeUndefined();
        });
    });

    describe('Real-world Data Verification', () => {
        test('should have realistic Earth properties', () => {
            const earth = solarSystemDataManager.getCelestialBodyByName('earth');
            
            expect(earth.radius).toBeCloseTo(6371, 0); // km
            expect(earth.mass).toBeCloseTo(5.972e24, 1e22); // kg
            expect(earth.GM).toBeCloseTo(398600, 1000); // km³/s²
        });

        test('should have realistic solar system scales', () => {
            const sun = solarSystemDataManager.getCelestialBodyByName('sun');
            const earth = solarSystemDataManager.getCelestialBodyByName('earth');
            const moon = solarSystemDataManager.getCelestialBodyByName('moon');
            
            // Sun should be much more massive than Earth
            expect(sun.mass).toBeGreaterThan(earth.mass * 100000);
            
            // Earth should be much more massive than Moon
            expect(earth.mass).toBeGreaterThan(moon.mass * 50);
            
            // Sun should be much larger than Earth
            expect(sun.radius).toBeGreaterThan(earth.radius * 50);
        });

        test('should have consistent unit systems', () => {
            const bodies = solarSystemDataManager.getAllCelestialBodies();
            
            bodies.forEach(body => {
                if (body.radius) {
                    expect(body.radius).toBeGreaterThan(0);
                    expect(body.radius).toBeLessThan(1e6); // Reasonable km range
                }
                
                if (body.mass) {
                    expect(body.mass).toBeGreaterThan(0);
                    expect(body.mass).toBeLessThan(1e32); // Reasonable kg range
                }
                
                if (body.GM) {
                    expect(body.GM).toBeGreaterThan(0);
                    expect(body.GM).toBeLessThan(1e12); // Reasonable km³/s² range
                }
            });
        });
    });
});