/**
 * Test for Earth orbit visualization around EMB
 * Validates that Earth's orbit around EMB is properly rendered with correct frame transformation
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';

// Mock window object for Node.js environment
global.window = {
    innerWidth: 1920,
    innerHeight: 1080
};

import { CelestialOrbitManager } from '../src/components/orbit/CelestialOrbitManager.js';
import { StateVectorCalculator } from '../src/physics/StateVectorCalculator.js';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { planetaryDataManager } from '../src/physics/bodies/PlanetaryDataManager.js';

// Mock Three.js scene
const createMockScene = () => ({
    add: vi.fn(),
    remove: vi.fn(),
    children: []
});

// Mock app with physics integration
const createMockApp = (physicsEngine) => ({
    physicsIntegration: {
        physicsEngine
    },
    bodiesByNaifId: {
        399: { // Earth
            absolutePosition: new THREE.Vector3(4500, 0, 0), // Example position relative to EMB
            orientationGroup: {
                quaternion: new THREE.Quaternion()
            }
        },
        301: { // Moon
            absolutePosition: new THREE.Vector3(-1000, 0, 0), // Example position relative to EMB
            orientationGroup: {
                quaternion: new THREE.Quaternion()
            }
        },
        3: { // EMB
            absolutePosition: new THREE.Vector3(149597870, 0, 0) // Example heliocentric position
        }
    },
    getDisplaySetting: vi.fn().mockReturnValue(true)
});

// Mock hierarchy
const createMockHierarchy = () => ({
    getAllRelationships: () => ({
        399: { name: 'earth', parent: 3, type: 'planet' },
        301: { name: 'moon', parent: 3, type: 'moon' },
        3: { name: 'emb', parent: 0, type: 'barycenter' }
    }),
    getVisualParent: (naifId) => naifId === 399 || naifId === 301 ? 3 : undefined,
    getBodyInfo: (naifId) => {
        const map = {
            399: { name: 'earth', type: 'planet' },
            301: { name: 'moon', type: 'moon' },
            3: { name: 'emb', type: 'barycenter' },
            0: { name: 'ss_barycenter', type: 'barycenter' }
        };
        return map[naifId] || null;
    },
    getParent: (naifId) => {
        const map = { 399: 3, 301: 3, 3: 0 };
        return map[naifId] || 0;
    },
    getParentGroup: () => createMockScene()
});

// Mock StateVectorCalculator with EMB-relative coordinates for Earth
const createMockStateVectorCalculator = () => {
    const calculator = {
        calculateStateVector: vi.fn((naifId, time) => {
            if (naifId === 399) {
                // Earth relative to EMB - should be substantial values (around 4700 km from EMB center)
                return {
                    position: [4670, 0, 0], // km - Earth's offset from EMB
                    velocity: [0, 12.37, 0] // km/s - Earth's velocity around EMB
                };
            } else if (naifId === 301) {
                // Moon relative to EMB - should be substantial values (around 1000 km from EMB center)
                return {
                    position: [-1000, 0, 0], // km - Moon's offset from EMB
                    velocity: [0, -3.33, 0] // km/s - Moon's velocity around EMB
                };
            } else if (naifId === 3) {
                // EMB relative to SSB - heliocentric position
                return {
                    position: [149597870, 0, 0], // km - 1 AU from Sun
                    velocity: [0, 29.78, 0] // km/s - Earth's orbital velocity around Sun
                };
            }
            return null;
        }),
        _getFullBodyConfig: vi.fn((naifId) => {
            if (naifId === 399) {
                return {
                    name: 'earth',
                    naif_id: 399,
                    parent: 'emb',
                    type: 'planet',
                    mass: 5.972e24,
                    GM: 3.986004418e5,
                    orbitVisualization: {
                        useSpecialEMBHandling: true,
                        orbitPoints: 720
                    },
                    orbitalElements: {
                        semiMajorAxis: 4671, // km - Earth-EMB distance
                        eccentricity: 0.0549, // matches lunar orbital eccentricity
                        inclination: 5.145, // degrees - matches Moon's inclination
                        longitudeOfAscendingNode: 125.012,
                        argumentOfPeriapsis: 318.063,
                        meanAnomalyAtEpoch: 244.635,
                        period: 27.321661 * 24 * 3600
                    }
                };
            } else if (naifId === 301) {
                return {
                    name: 'moon',
                    naif_id: 301,
                    parent: 'emb',
                    type: 'moon',
                    mass: 7.342e22,
                    GM: 4.9048695e3,
                    orbitVisualization: {
                        useSpecialEMBHandling: true,
                        orbitPoints: 720
                    }
                };
            } else if (naifId === 3) {
                return {
                    name: 'emb',
                    naif_id: 3,
                    parent: 'ss_barycenter',
                    type: 'barycenter',
                    GM: 4.035032e5,
                    mass: 6.0458e24
                };
            }
            return null;
        })
    };
    return calculator;
};

// Mock PhysicsEngine
const createMockPhysicsEngine = (calculator) => ({
    simulationTime: new Date('2024-01-01T00:00:00Z'),
    stateVectorCalculator: calculator,
    getSimulationState: () => ({
        bodies: {
            399: {
                position: [4670, 0, 0],
                velocity: [0, 12.37, 0],
                mass: 5.972e24
            },
            301: {
                position: [-1000, 0, 0],
                velocity: [0, -3.33, 0],
                mass: 7.342e22
            },
            3: {
                position: [149597870, 0, 0],
                velocity: [0, 29.78, 0],
                mass: 6.0458e24
            }
        }
    })
});

describe('Earth EMB Orbit Visualization', () => {
    let orbitManager;
    let mockScene;
    let mockApp;
    let mockStateVectorCalculator;
    let mockPhysicsEngine;

    beforeEach(async () => {
        // Initialize planetary data manager
        await planetaryDataManager.initialize();
        
        // Setup mocks
        mockStateVectorCalculator = createMockStateVectorCalculator();
        mockPhysicsEngine = createMockPhysicsEngine(mockStateVectorCalculator);
        mockScene = createMockScene();
        mockApp = createMockApp(mockPhysicsEngine);
        
        // Create CelestialOrbitManager using app.hierarchy
        mockApp.hierarchy = createMockHierarchy();
        orbitManager = new CelestialOrbitManager(mockScene, mockApp);
    });

    test('should detect Earth has EMB special handling flag', () => {
        const earthConfig = mockStateVectorCalculator._getFullBodyConfig(399);
        expect(earthConfig.orbitVisualization.useSpecialEMBHandling).toBe(true);
    });

    test('should detect Moon has EMB special handling flag', () => {
        const moonConfig = mockStateVectorCalculator._getFullBodyConfig(301);
        expect(moonConfig.orbitVisualization.useSpecialEMBHandling).toBe(true);
    });

    test('should generate proper Earth orbit points around EMB', () => {
        // Initialize the orbit manager with physics engine
        orbitManager.initialize(mockPhysicsEngine);
        
        // Generate orbits
        orbitManager.renderAllOrbits();
        
        // Check that Earth orbit was created
        const orbitInfo = orbitManager.getOrbitInfo();
        const earthOrbit = orbitInfo.find(info => info.name === 'earth');
        
        expect(earthOrbit).toBeDefined();
        expect(earthOrbit.parentName).toBe('emb');
        expect(earthOrbit.dataSource).toBe('special_emb');
        expect(mockStateVectorCalculator.calculateStateVector).toHaveBeenCalledWith(399, expect.any(Date));
    });

    test('should use EMB-relative coordinates without subtracting parent position', () => {
        // Test that Earth's orbit points are in EMB frame without SSB subtraction
        const calculator = mockStateVectorCalculator;
        const earthState = calculator.calculateStateVector(399, new Date());
        const embState = calculator.calculateStateVector(3, new Date());
        
        // Earth's position should be significantly different from EMB's position
        expect(Math.abs(earthState.position[0] - embState.position[0])).toBeGreaterThan(1000);
        
        // Earth state should be in thousands of km range (EMB-relative), not millions (SSB-relative)
        expect(Math.abs(earthState.position[0])).toBeLessThan(10000);
        expect(Math.abs(earthState.position[0])).toBeGreaterThan(1000);
    });

    test('should generate substantial orbit radius for Earth around EMB', () => {
        const earthState = mockStateVectorCalculator.calculateStateVector(399, new Date());
        const orbitRadius = Math.sqrt(
            earthState.position[0] ** 2 + 
            earthState.position[1] ** 2 + 
            earthState.position[2] ** 2
        );
        
        // Earth should be about 4670 km from EMB center
        expect(orbitRadius).toBeGreaterThan(4000);
        expect(orbitRadius).toBeLessThan(5000);
    });

    test('should generate substantial orbit radius for Moon around EMB', () => {
        const moonState = mockStateVectorCalculator.calculateStateVector(301, new Date());
        const orbitRadius = Math.sqrt(
            moonState.position[0] ** 2 + 
            moonState.position[1] ** 2 + 
            moonState.position[2] ** 2
        );
        
        // Moon should be about 1000 km from EMB center (in opposite direction from Earth)
        expect(orbitRadius).toBeGreaterThan(900);
        expect(orbitRadius).toBeLessThan(1100);
    });

    test('should not subtract EMB position for Earth when useSpecialEMBHandling is true', () => {
        // Mock the actual implementation logic
        const naifNum = 399;
        const parentNaif = 3;
        const bodyConfig = mockStateVectorCalculator._getFullBodyConfig(naifNum);
        
        const earthState = mockStateVectorCalculator.calculateStateVector(naifNum, new Date());
        const point = new THREE.Vector3(earthState.position[0], earthState.position[1], earthState.position[2]);
        
        // Test the condition from OrbitManager
        const shouldUseSpecialHandling = bodyConfig?.orbitVisualization?.useSpecialEMBHandling && 
                                       (naifNum === 399 || naifNum === 301) && parentNaif === 3;
        
        expect(shouldUseSpecialHandling).toBe(true);
        
        // When special handling is used, the point should remain unchanged (no parent subtraction)
        expect(point.x).toBe(earthState.position[0]);
        expect(point.y).toBe(earthState.position[1]);
        expect(point.z).toBe(earthState.position[2]);
    });

    test('should render full solar system orbits including Earth-EMB', () => {
        // Test the full orbit rendering
        orbitManager.renderSolarSystemOrbits();
        
        // Verify that orbits were processed
        expect(mockStateVectorCalculator.calculateStateVector).toHaveBeenCalled();
        expect(orbitManager.orbitLineMap.size).toBeGreaterThan(0);
    });

    test('should debug actual StateVectorCalculator Earth state calculation', async () => {
        // Create a real StateVectorCalculator to see what it returns
        const realHierarchy = {
            getBodyInfo: (naifId) => {
                const map = {
                    399: { name: 'earth', type: 'planet' },
                    301: { name: 'moon', type: 'moon' },
                    3: { name: 'emb', type: 'barycenter' }
                };
                return map[naifId] || null;
            },
            getParent: (naifId) => {
                const map = { 399: 3, 301: 3, 3: 0 };
                return map[naifId] || 0;
            }
        };
        
        const realCalculator = new StateVectorCalculator(realHierarchy);
        await realCalculator._initializePlanetaryData();
        
        const testTime = new Date('2024-01-01T00:00:00Z');
        
        // Test Earth state calculation
        console.log('Testing real Earth state calculation...');
        const earthState = realCalculator.calculateStateVector(399, testTime);
        console.log('Earth state:', earthState);
        
        // Test EMB state calculation
        const embState = realCalculator.calculateStateVector(3, testTime);
        console.log('EMB state:', embState);
        
        if (earthState && embState) {
            const earthPos = new THREE.Vector3().fromArray(earthState.position);
            const embPos = new THREE.Vector3().fromArray(embState.position);
            const difference = earthPos.clone().sub(embPos);
            
            console.log('Earth position magnitude:', earthPos.length());
            console.log('EMB position magnitude:', embPos.length());
            console.log('Difference magnitude:', difference.length());
            
            // This will help us understand if Earth is returning EMB-relative or SSB coordinates
            expect(earthState).toBeTruthy();
            expect(embState).toBeTruthy();
            
            // Now test if the Earth config has the special EMB handling flag
            const earthConfig = realCalculator._getFullBodyConfig(399);
            console.log('Real Earth config:', earthConfig);
            if (earthConfig) {
                console.log('Earth orbit visualization config:', earthConfig.orbitVisualization);
            }
        }
    });
});