/**
 * Tests for Trajectory Stitching functionality across SOI boundaries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { OrbitVisualizationManager } from '../src/managers/OrbitVisualizationManager.js';

describe('Trajectory Stitching Tests', () => {
    let vizManager;
    let mockApp;
    let mockPhysicsEngine;
    
    beforeEach(() => {
        // Mock app object
        mockApp = {
            celestialBodies: [
                { naifId: 399, name: 'Earth', orbitGroup: { add: vi.fn() } },
                { naifId: 301, name: 'Moon', orbitGroup: { add: vi.fn() } },
                { naifId: 10, name: 'Sun', orbitGroup: { add: vi.fn() } }
            ],
            sceneManager: {
                scene: { add: vi.fn() }
            }
        };
        
        // Mock physics engine with hierarchy
        mockPhysicsEngine = {
            bodies: {
                10: { // Sun
                    name: 'Sun',
                    position: [0, 0, 0],
                    velocity: [0, 0, 0],
                    naifId: 10
                },
                399: { // Earth
                    name: 'Earth',
                    position: [149597870.7, 0, 0],
                    velocity: [0, 29.78, 0],
                    naifId: 399
                },
                301: { // Moon
                    name: 'Moon',
                    position: [149597870.7 + 384400, 0, 0],
                    velocity: [0, 29.78 + 1.022, 0],
                    naifId: 301
                }
            },
            hierarchy: {
                10: { name: 'Sun', type: 'star', parent: null, children: [399] },
                399: { name: 'Earth', type: 'planet', parent: 10, children: [301] },
                301: { name: 'Moon', type: 'moon', parent: 399, children: [] }
            },
            satellites: new Map([
                ['test-sat', { color: 0xffff00, id: 'test-sat' }]
            ])
        };
        
        vizManager = new OrbitVisualizationManager(mockApp);
    });

    describe('Orbit Segment Creation', () => {
        it('should create separate segments for different central bodies', () => {
            const orbitPoints = [
                { position: [100000, 0, 0], centralBodyId: 399, time: 0, isSOIEntry: false },
                { position: [200000, 0, 0], centralBodyId: 399, time: 100, isSOIEntry: false },
                { position: [300000, 0, 0], centralBodyId: 399, time: 200, isSOIExit: true },
                { position: [50000, 0, 0], centralBodyId: 301, time: 200, isSOIEntry: true },
                { position: [40000, 0, 0], centralBodyId: 301, time: 300, isSOIEntry: false }
            ];
            
            // Test the segmentation logic (simulate what happens in updateSatelliteOrbit)
            const orbitSegments = [];
            let currentSegment = null;
            let currentBodyId = null;
            
            for (let i = 0; i < orbitPoints.length; i++) {
                const point = orbitPoints[i];
                
                if (!currentSegment || currentBodyId !== point.centralBodyId || point.isSOIEntry) {
                    if (currentSegment && currentSegment.points.length > 0) {
                        orbitSegments.push(currentSegment);
                    }
                    
                    currentSegment = {
                        centralBodyId: point.centralBodyId,
                        points: [],
                        isAfterSOITransition: point.isSOIEntry || false,
                        startIndex: i
                    };
                    currentBodyId = point.centralBodyId;
                }
                
                currentSegment.points.push(point);
            }
            
            if (currentSegment && currentSegment.points.length > 0) {
                orbitSegments.push(currentSegment);
            }
            
            expect(orbitSegments).toHaveLength(2);
            expect(orbitSegments[0].centralBodyId).toBe(399);
            expect(orbitSegments[0].points).toHaveLength(3);
            expect(orbitSegments[1].centralBodyId).toBe(301);
            expect(orbitSegments[1].points).toHaveLength(2);
            expect(orbitSegments[1].isAfterSOITransition).toBeTruthy();
        });
    });

    describe('Trajectory Stitching', () => {
        it('should stitch two segments together with connection segment', () => {
            const segment1 = {
                centralBodyId: 399,
                points: [
                    { position: [100000, 0, 0], time: 0, centralBodyId: 399 },
                    { position: [300000, 0, 0], time: 200, centralBodyId: 399 }
                ],
                isAfterSOITransition: false
            };
            
            const segment2 = {
                centralBodyId: 301,
                points: [
                    { position: [50000, 0, 0], time: 200, centralBodyId: 301 },
                    { position: [40000, 0, 0], time: 300, centralBodyId: 301 }
                ],
                isAfterSOITransition: true
            };
            
            const orbitSegments = [segment1, segment2];
            const stitchedSegments = vizManager._stitchTrajectorySegments(orbitSegments, mockPhysicsEngine);
            
            expect(stitchedSegments).toHaveLength(3); // 2 original + 1 connection
            expect(stitchedSegments[0]).toBe(segment1);
            expect(stitchedSegments[1].isConnectionSegment).toBeTruthy();
            expect(stitchedSegments[2]).toBe(segment2);
        });

        it('should not add connection for single segment', () => {
            const singleSegment = {
                centralBodyId: 399,
                points: [
                    { position: [100000, 0, 0], time: 0, centralBodyId: 399 }
                ],
                isAfterSOITransition: false
            };
            
            const stitchedSegments = vizManager._stitchTrajectorySegments([singleSegment], mockPhysicsEngine);
            
            expect(stitchedSegments).toHaveLength(1);
            expect(stitchedSegments[0]).toBe(singleSegment);
        });
    });

    describe('Coordinate Transformations for Stitching', () => {
        it('should transform orbit points to global positions correctly', () => {
            const earthPoint = {
                position: [100000, 0, 0],
                centralBodyId: 399
            };
            
            const globalPos = vizManager._transformToGlobalPosition(earthPoint, mockPhysicsEngine);
            
            // Earth is at [149597870.7, 0, 0], satellite at [100000, 0, 0] relative to Earth
            expect(globalPos.x).toBeCloseTo(149697870.7, 1);
            expect(globalPos.y).toBeCloseTo(0, 5);
            expect(globalPos.z).toBeCloseTo(0, 5);
        });

        it('should transform global positions to relative positions correctly', () => {
            const globalPos = new THREE.Vector3(149697870.7, 0, 0);
            const relativePos = vizManager._transformToRelativePosition(globalPos, 399, mockPhysicsEngine);
            
            // Should subtract Earth's position [149597870.7, 0, 0]
            expect(relativePos.x).toBeCloseTo(100000, 1);
            expect(relativePos.y).toBeCloseTo(0, 5);
            expect(relativePos.z).toBeCloseTo(0, 5);
        });
    });

    describe('Common Parent Finding', () => {
        it('should find Earth as common parent for Earth-Moon transition', () => {
            const commonParent = vizManager._findCommonParent(399, 301, mockPhysicsEngine);
            expect(commonParent).toBe(399);
        });

        it('should find Sun as common parent for Earth-Sun transition', () => {
            const commonParent = vizManager._findCommonParent(399, 10, mockPhysicsEngine);
            expect(commonParent).toBe(10);
        });

        it('should use hierarchy when available', () => {
            const commonParent = vizManager._findCommonParentUsingHierarchy(301, 399, mockPhysicsEngine.hierarchy);
            expect(commonParent).toBe(399); // Earth is parent of Moon
        });

        it('should find correct common ancestor for distant bodies', () => {
            // Add Mars to hierarchy for testing
            const extendedHierarchy = {
                ...mockPhysicsEngine.hierarchy,
                499: { name: 'Mars', type: 'planet', parent: 10, children: [] }
            };
            
            const commonParent = vizManager._findCommonParentUsingHierarchy(301, 499, extendedHierarchy);
            expect(commonParent).toBe(10); // Sun is common ancestor of Moon and Mars
        });
    });

    describe('Connection Segment Creation', () => {
        it('should create valid connection segment between Earth and Moon segments', () => {
            const earthSegment = {
                centralBodyId: 399,
                points: [
                    { position: [300000, 0, 0], time: 200, centralBodyId: 399 }
                ]
            };
            
            const moonSegment = {
                centralBodyId: 301,
                points: [
                    { position: [50000, 0, 0], time: 200, centralBodyId: 301 }
                ]
            };
            
            const connectionSegment = vizManager._createConnectionSegment(
                earthSegment, 
                moonSegment, 
                mockPhysicsEngine
            );
            
            expect(connectionSegment).not.toBeNull();
            expect(connectionSegment.centralBodyId).toBe(399); // Earth is common parent
            expect(connectionSegment.isConnectionSegment).toBeTruthy();
            expect(connectionSegment.isAfterSOITransition).toBeTruthy();
            expect(connectionSegment.points).toHaveLength(2);
            
            // Both points should have the same time (transition time)
            expect(connectionSegment.points[0].time).toBe(200);
            expect(connectionSegment.points[1].time).toBe(200);
        });

        it('should handle empty segments gracefully', () => {
            const emptySegment = { centralBodyId: 399, points: [] };
            const validSegment = {
                centralBodyId: 301,
                points: [{ position: [50000, 0, 0], time: 200, centralBodyId: 301 }]
            };
            
            const connectionSegment = vizManager._createConnectionSegment(
                emptySegment,
                validSegment,
                mockPhysicsEngine
            );
            
            expect(connectionSegment).toBeNull();
        });
    });

    describe('Multi-Segment Trajectory', () => {
        it('should handle Earth→Moon→Earth trajectory correctly', () => {
            const earthToMoonSegment = {
                centralBodyId: 399,
                points: [
                    { position: [100000, 0, 0], time: 0, centralBodyId: 399 },
                    { position: [300000, 0, 0], time: 200, centralBodyId: 399 }
                ]
            };
            
            const moonSegment = {
                centralBodyId: 301,
                points: [
                    { position: [50000, 0, 0], time: 200, centralBodyId: 301 },
                    { position: [40000, 0, 0], time: 300, centralBodyId: 301 },
                    { position: [60000, 0, 0], time: 400, centralBodyId: 301 }
                ]
            };
            
            const moonToEarthSegment = {
                centralBodyId: 399,
                points: [
                    { position: [350000, 0, 0], time: 400, centralBodyId: 399 },
                    { position: [200000, 0, 0], time: 500, centralBodyId: 399 }
                ]
            };
            
            const orbitSegments = [earthToMoonSegment, moonSegment, moonToEarthSegment];
            const stitchedSegments = vizManager._stitchTrajectorySegments(orbitSegments, mockPhysicsEngine);
            
            // Should have: Earth + Connection + Moon + Connection + Earth = 5 segments
            expect(stitchedSegments).toHaveLength(5);
            expect(stitchedSegments[0].centralBodyId).toBe(399); // Earth segment
            expect(stitchedSegments[1].isConnectionSegment).toBeTruthy(); // Earth→Moon connection
            expect(stitchedSegments[2].centralBodyId).toBe(301); // Moon segment
            expect(stitchedSegments[3].isConnectionSegment).toBeTruthy(); // Moon→Earth connection
            expect(stitchedSegments[4].centralBodyId).toBe(399); // Earth segment
        });
    });
});