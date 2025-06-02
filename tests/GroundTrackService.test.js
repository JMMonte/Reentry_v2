import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { GroundTrackService } from '../src/services/GroundTrackService.js';
import { Bodies } from '../src/physics/PhysicsAPI.js';
import { CoordinateTransforms } from '../src/physics/utils/CoordinateTransforms.js';

// Mock dependencies
vi.mock('../src/physics/PhysicsAPI.js');
vi.mock('../src/physics/utils/CoordinateTransforms.js');

describe('GroundTrackService', () => {
    let service;
    const mockEarthData = {
        naifId: 399,
        radius: 6371.0,
        name: 'Earth'
    };

    beforeEach(() => {
        service = new GroundTrackService();
        vi.clearAllMocks();
        
        // Mock Bodies API
        Bodies.getData = vi.fn().mockReturnValue(mockEarthData);
        Bodies.getCelestialBodyData = vi.fn().mockResolvedValue(mockEarthData); // Keep for backwards compatibility
        
        // Mock CoordinateTransforms
        CoordinateTransforms.transformCoordinates = vi.fn().mockReturnValue({
            position: [1000, 2000, 3000]
        });
        CoordinateTransforms.planetFixedToLatLonAlt = vi.fn().mockReturnValue([45.0, -122.0, 400.0]);
    });

    afterEach(() => {
        service.dispose();
    });

    describe('transformECIToSurface', () => {
        test('should transform ECI coordinates to surface coordinates', async () => {
            const eciPosition = [7000, 0, 0]; // km from Earth center
            const planetNaifId = 399;
            const timeMs = Date.now();

            const result = await service.transformECIToSurface(eciPosition, planetNaifId, timeMs);

            expect(Bodies.getData).toHaveBeenCalledWith(399);
            expect(CoordinateTransforms.transformCoordinates).toHaveBeenCalledWith(
                eciPosition,
                [0, 0, 0],
                'PCI',
                'PF',
                mockEarthData,
                new Date(timeMs)
            );
            expect(result).toEqual({
                lat: 45.0,
                lon: -122.0,
                alt: 400.0
            });
        });

        test('should handle invalid inputs gracefully', async () => {
            const result1 = await service.transformECIToSurface(null, 399, Date.now());
            const result2 = await service.transformECIToSurface([7000, 0, 0], undefined, Date.now());

            expect(result1).toEqual({ lat: 0, lon: 0, alt: 0 });
            expect(result2).toEqual({ lat: 0, lon: 0, alt: 0 });
        });

        test('should handle Bodies API errors gracefully', async () => {
            Bodies.getCelestialBodyData.mockRejectedValue(new Error('API Error'));

            const result = await service.transformECIToSurface([7000, 0, 0], 399, Date.now());

            expect(result).toEqual({ lat: 0, lon: 0, alt: 0 });
        });
    });

    describe('projectToCanvas', () => {
        test('should project lat/lon to canvas coordinates correctly', () => {
            const result = service.projectToCanvas(45.0, -122.0, 1024, 512);

            expect(result).toEqual({
                x: ((-122.0 + 180) / 360) * 1024,
                y: ((90 - 45.0) / 180) * 512
            });
        });

        test('should normalize longitude correctly', () => {
            // Test longitude wrapping
            const result1 = service.projectToCanvas(0, 270, 360, 180); // 270° = -90°
            const result2 = service.projectToCanvas(0, -270, 360, 180); // -270° = 90°

            expect(result1.x).toBeCloseTo(((-90 + 180) / 360) * 360); // 90px
            expect(result2.x).toBeCloseTo(((90 + 180) / 360) * 360); // 270px
        });

        test('should handle edge cases', () => {
            // North pole
            const northPole = service.projectToCanvas(90, 0, 360, 180);
            expect(northPole.y).toBe(0);

            // South pole  
            const southPole = service.projectToCanvas(-90, 0, 360, 180);
            expect(southPole.y).toBe(180);

            // Date line
            const dateLine1 = service.projectToCanvas(0, 180, 360, 180);
            const dateLine2 = service.projectToCanvas(0, -180, 360, 180);
            expect(dateLine1.x).toBeCloseTo(dateLine2.x);
        });
    });

    describe('isDatelineCrossing', () => {
        test('should detect dateline crossings correctly', () => {
            expect(service.isDatelineCrossing(170, -170)).toBe(true);  // East crossing
            expect(service.isDatelineCrossing(-170, 170)).toBe(true);  // West crossing
            expect(service.isDatelineCrossing(10, 20)).toBe(false);    // Normal movement
            expect(service.isDatelineCrossing(-10, 10)).toBe(false);   // Normal movement
            expect(service.isDatelineCrossing(undefined, 10)).toBe(false); // Invalid input
        });
    });

    describe('processGroundTrack', () => {
        test('should process raw ECI points into canvas coordinates', async () => {
            const rawPoints = [
                { time: Date.now(), position: { x: 7000, y: 0, z: 0 } },
                { time: Date.now() + 1000, position: { x: 6000, y: 3000, z: 1000 } }
            ];
            const planetNaifId = 399;
            const width = 1024;
            const height = 512;

            const result = await service.processGroundTrack(rawPoints, planetNaifId, width, height);

            expect(result).toHaveLength(2);
            expect(result[0]).toHaveProperty('x');
            expect(result[0]).toHaveProperty('y');
            expect(result[0]).toHaveProperty('lat');
            expect(result[0]).toHaveProperty('lon');
            expect(result[0]).toHaveProperty('alt');
            expect(result[0]).toHaveProperty('isDatelineCrossing');
        });

        test('should handle empty input', async () => {
            const result = await service.processGroundTrack([], 399, 1024, 512);
            expect(result).toEqual([]);
        });
    });

    describe('calculateCoverageRadius', () => {
        test('should calculate coverage radius correctly', async () => {
            const surfacePos = { lat: 45, lon: -122, alt: 400 }; // 400km altitude
            const planetNaifId = 399;

            const radius = await service.calculateCoverageRadius(surfacePos, planetNaifId);

            expect(Bodies.getData).toHaveBeenCalledWith(399);
            expect(radius).toBeGreaterThan(0);
            expect(radius).toBeLessThan(90); // Should be less than 90 degrees
        });

        test('should handle Bodies API errors gracefully', async () => {
            Bodies.getCelestialBodyData.mockRejectedValue(new Error('API Error'));

            const radius = await service.calculateCoverageRadius({ alt: 400 }, 399);

            expect(radius).toBe(0);
        });
    });

    describe('getCurrentPositions', () => {
        test('should get current positions for satellites', async () => {
            const satellites = {
                'sat1': {
                    id: 'sat1',
                    centralBodyNaifId: 399,
                    position: [7000, 0, 0],
                    color: 0xff0000
                },
                'sat2': {
                    id: 'sat2',
                    centralBodyNaifId: 301, // Moon
                    position: [2000, 0, 0],
                    color: 0x00ff00
                }
            };
            const planetNaifId = 399;
            const currentTime = Date.now();

            const result = await service.getCurrentPositions(satellites, planetNaifId, currentTime);

            expect(result).toHaveLength(1); // Only Earth satellites
            expect(result[0]).toEqual({
                id: 'sat1',
                lat: 45.0,
                lon: -122.0,
                alt: 400.0,
                color: 0xff0000
            });
        });

        test('should handle empty satellites', async () => {
            const result = await service.getCurrentPositions({}, 399, Date.now());
            expect(result).toEqual([]);
        });
    });

    describe('subscription system', () => {
        test('should handle subscriptions correctly', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            const unsubscribe1 = service.subscribe(callback1);
            const unsubscribe2 = service.subscribe(callback2);

            service.notifySubscribers({ test: 'data' });

            expect(callback1).toHaveBeenCalledWith({ test: 'data' });
            expect(callback2).toHaveBeenCalledWith({ test: 'data' });

            unsubscribe1();
            service.notifySubscribers({ test: 'data2' });

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(2);
        });

        test('should handle subscriber errors gracefully', () => {
            const errorCallback = vi.fn().mockImplementation(() => {
                throw new Error('Subscriber error');
            });
            const normalCallback = vi.fn();

            service.subscribe(errorCallback);
            service.subscribe(normalCallback);

            // Should not throw and should call both callbacks
            expect(() => service.notifySubscribers({ test: 'data' })).not.toThrow();
            expect(errorCallback).toHaveBeenCalled();
            expect(normalCallback).toHaveBeenCalled();
        });
    });
});