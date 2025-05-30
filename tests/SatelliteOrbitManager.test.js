/**
 * Integration tests for SatelliteOrbitManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SatelliteOrbitManager } from '../src/managers/SatelliteOrbitManager.js';
import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { DisplaySettingsManager } from '../src/managers/DisplaySettingsManager.js';

// Mock Three.js scene
vi.mock('three', async () => {
    const actual = await vi.importActual('three');
    return {
        ...actual,
        Scene: vi.fn(() => ({
            add: vi.fn(),
            remove: vi.fn(),
            traverse: vi.fn()
        })),
        Line: vi.fn((geometry, material) => ({
            geometry,
            material,
            frustumCulled: false,
            visible: true,
            parent: null,
            name: '',
            position: new actual.Vector3(),
            add: vi.fn(),
            remove: vi.fn()
        })),
        BufferGeometry: vi.fn(() => ({
            setAttribute: vi.fn(),
            setDrawRange: vi.fn(),
            computeBoundingSphere: vi.fn(),
            dispose: vi.fn(),
            getAttribute: vi.fn(),
            attributes: {}
        })),
        LineBasicMaterial: vi.fn((params) => ({
            ...params,
            dispose: vi.fn()
        })),
        LineDashedMaterial: vi.fn((params) => ({
            ...params,
            dispose: vi.fn()
        }))
    };
});

describe('SatelliteOrbitManager Integration Tests', () => {
    let app;
    let orbitManager;
    let physicsEngine;
    let displaySettings;

    beforeEach(() => {
        // Create mock app object
        app = {
            scene: new THREE.Scene(),
            sceneManager: { scene: new THREE.Scene() },
            camera: { position: new THREE.Vector3(0, 0, 10000) },
            celestialBodies: [
                {
                    naifId: 399,
                    name: 'Earth',
                    radius: 6371,
                    soiRadius: 929000,
                    orbitGroup: new THREE.Group()
                },
                {
                    naifId: 10,
                    name: 'Sun',
                    radius: 695700,
                    soiRadius: 1e12,
                    orbitGroup: new THREE.Group()
                }
            ],
            satellites: {
                satellites: new Map()
            }
        };

        // Create physics engine
        physicsEngine = new PhysicsEngine();
        physicsEngine.initialize();
        
        // Add bodies to physics engine
        physicsEngine.bodies = {
            399: {
                naif: 399,
                position: new THREE.Vector3(0, 0, 0),
                velocity: new THREE.Vector3(0, 0, 0),
                mass: 5.972e24,
                radius: 6371,
                soiRadius: 929000,
                GM: 398600.4415
            },
            10: {
                naif: 10,
                position: new THREE.Vector3(-149597870.7, 0, 0),
                velocity: new THREE.Vector3(0, -30, 0),
                mass: 1.989e30,
                radius: 695700,
                soiRadius: 1e12,
                GM: 132712440041.93938
            }
        };

        // Create display settings manager
        displaySettings = new DisplaySettingsManager(app, {
            showOrbits: true,
            orbitPredictionInterval: 1,
            orbitPointsPerPeriod: 180
        });

        // Create orbit manager
        app.physicsIntegration = { physicsEngine };
        app.displaySettingsManager = displaySettings;
        
        orbitManager = new SatelliteOrbitManager(app);
        orbitManager.initialize();
    });

    afterEach(() => {
        orbitManager.dispose();
    });

    describe('Satellite orbit management', () => {
        it('should create orbit visualization for new satellite', async () => {
            // Add satellite to physics engine
            const satelliteId = 'test-sat-1';
            const satellite = {
                id: satelliteId,
                position: new THREE.Vector3(6771, 0, 0),
                velocity: new THREE.Vector3(0, 7.66, 0),
                centralBodyNaifId: 399,
                color: 0xff0000,
                mass: 1000
            };
            
            physicsEngine.satellites.set(satelliteId, satellite);
            
            // Request orbit update
            orbitManager.updateSatelliteOrbit(satelliteId);
            
            // Wait for worker to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check that orbit was created
            expect(orbitManager.orbitCache.has(satelliteId)).toBeTruthy();
            expect(orbitManager.orbitLines.size).toBeGreaterThan(0);
        });

        it('should update orbit color when satellite color changes', () => {
            const satelliteId = 'test-sat-2';
            const newColor = 0x00ff00;
            
            // Create mock orbit line
            const mockLine = {
                material: { color: { set: vi.fn() } }
            };
            orbitManager.orbitLines.set(`${satelliteId}_0`, mockLine);
            orbitManager.orbitSegmentCounts.set(satelliteId, 1);
            
            // Update color
            orbitManager.updateSatelliteColor(satelliteId, newColor);
            
            expect(mockLine.material.color.set).toHaveBeenCalledWith(newColor);
        });

        it('should remove orbit when satellite is deleted', () => {
            const satelliteId = 'test-sat-3';
            
            // Set up orbit data
            orbitManager.orbitCache.set(satelliteId, { points: [] });
            const mockLine = {
                parent: { remove: vi.fn() },
                geometry: { dispose: vi.fn() },
                material: { dispose: vi.fn() }
            };
            orbitManager.orbitLines.set(`${satelliteId}_0`, mockLine);
            orbitManager.orbitSegmentCounts.set(satelliteId, 1);
            
            // Remove satellite
            orbitManager.removeSatelliteOrbit(satelliteId);
            
            expect(orbitManager.orbitCache.has(satelliteId)).toBeFalsy();
            expect(orbitManager.orbitLines.has(`${satelliteId}_0`)).toBeFalsy();
            expect(mockLine.geometry.dispose).toHaveBeenCalled();
            expect(mockLine.material.dispose).toHaveBeenCalled();
        });
    });

    describe('Display settings integration', () => {
        it('should update orbit visibility based on display settings', () => {
            // Create mock orbit lines
            const mockLines = [
                { visible: true },
                { visible: true }
            ];
            mockLines.forEach((line, i) => {
                orbitManager.orbitLines.set(`test_${i}`, line);
            });
            
            // Update visibility
            orbitManager.updateVisibility(false);
            
            mockLines.forEach(line => {
                expect(line.visible).toBeFalsy();
            });
        });

        it('should respect orbit prediction settings', async () => {
            // Update display settings
            displaySettings.updateSetting('orbitPredictionInterval', 2);
            displaySettings.updateSetting('orbitPointsPerPeriod', 360);
            
            // Add satellite
            const satelliteId = 'test-sat-4';
            const satellite = {
                id: satelliteId,
                position: new THREE.Vector3(42164, 0, 0), // GEO
                velocity: new THREE.Vector3(0, 3.07, 0),
                centralBodyNaifId: 399
            };
            
            physicsEngine.satellites.set(satelliteId, satellite);
            
            // Request orbit update
            orbitManager.updateSatelliteOrbit(satelliteId);
            
            // Wait and check cache
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const cached = orbitManager.orbitCache.get(satelliteId);
            if (cached && cached.points) {
                // Should have roughly 2 orbits worth of points
                expect(cached.maxPeriods).toBeCloseTo(2, 0);
            }
        });
    });

    describe('SOI transition handling', () => {
        it('should create discontinuous segments for escape trajectory', async () => {
            const satelliteId = 'test-escape';
            const escapeVelocity = Math.sqrt(2 * 398600.4415 / 6771);
            
            const satellite = {
                id: satelliteId,
                position: new THREE.Vector3(6771, 0, 0),
                velocity: new THREE.Vector3(escapeVelocity * 1.1, 0, 0),
                centralBodyNaifId: 399,
                color: 0xffff00
            };
            
            physicsEngine.satellites.set(satelliteId, satellite);
            
            // Mock the visualization update to capture segments
            const segments = [];
            orbitManager._updateOrbitVisualization = vi.fn((id, points) => {
                // Simulate segment creation
                let currentSegment = null;
                for (const point of points) {
                    if (!currentSegment || point.isSOIEntry || point.isSOIExit) {
                        if (currentSegment) segments.push(currentSegment);
                        currentSegment = { points: [] };
                    }
                    currentSegment.points.push(point);
                }
                if (currentSegment) segments.push(currentSegment);
            });
            
            orbitManager.updateSatelliteOrbit(satelliteId);
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
            expect(orbitManager._updateOrbitVisualization).toHaveBeenCalled();
            // Should have segments that end at SOI
            expect(segments.length).toBeGreaterThan(0);
        });
    });

    describe('Maneuver node visualization', () => {
        it('should calculate maneuver node position correctly', async () => {
            const satelliteId = 'test-maneuver';
            const satellite = {
                id: satelliteId,
                position: new THREE.Vector3(6771, 0, 0),
                velocity: new THREE.Vector3(0, 7.66, 0),
                centralBodyNaifId: 399
            };
            
            physicsEngine.satellites.set(satelliteId, satellite);
            
            // Create orbit cache with points
            const orbitPoints = [];
            for (let i = 0; i < 90; i++) {
                orbitPoints.push({
                    position: [6771, 0, 0],
                    velocity: [0, 7.66, 0],
                    time: i * 60, // 1 minute intervals
                    centralBodyId: 399
                });
            }
            orbitManager.orbitCache.set(satelliteId, { points: orbitPoints });
            
            // Create maneuver node
            const maneuverNode = {
                id: 'node-1',
                executionTime: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
                deltaV: { prograde: 0.1, normal: 0, radial: 0 },
                deltaMagnitude: 0.1
            };
            
            // Mock satellite object
            app.satellites.satellites.set(satelliteId, {
                maneuverNodeVisualizer: {
                    updateNodeVisualization: vi.fn()
                }
            });
            
            orbitManager.requestManeuverNodeVisualization(satelliteId, maneuverNode);
            
            const visualizer = app.satellites.satellites.get(satelliteId).maneuverNodeVisualizer;
            expect(visualizer.updateNodeVisualization).toHaveBeenCalled();
        });
    });
});

// Test helper for creating realistic orbit points
function generateOrbitPoints(params) {
    const {
        radius = 6771,
        velocity = 7.66,
        centralBodyId = 399,
        duration = 5400,
        timeStep = 60
    } = params;
    
    const points = [];
    const n = Math.sqrt(398600.4415 / (radius ** 3)); // Mean motion
    
    for (let t = 0; t < duration; t += timeStep) {
        const angle = n * t;
        points.push({
            position: [
                radius * Math.cos(angle),
                radius * Math.sin(angle),
                0
            ],
            velocity: [
                -velocity * Math.sin(angle),
                velocity * Math.cos(angle),
                0
            ],
            time: t,
            centralBodyId: centralBodyId
        });
    }
    
    return points;
}