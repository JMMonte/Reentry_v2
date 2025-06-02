import { describe, test, expect, beforeEach, vi } from 'vitest';
import { 
    projectToGeodetic, 
    latLonToCanvas, 
    projectWorldPosToCanvas, 
    projectToPlanetLatLon 
} from '../src/utils/MapProjection.js';
import { groundTrackService } from '../src/services/GroundTrackService.js';

// Mock the GroundTrackService
vi.mock('../src/services/GroundTrackService.js', () => ({
    groundTrackService: {
        transformECIToSurface: vi.fn()
    }
}));

describe('MapProjection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('latLonToCanvas', () => {
        test('should convert lat/lon to canvas coordinates correctly', () => {
            // Test equator and prime meridian (0, 0)
            const result1 = latLonToCanvas(0, 0, 360, 180);
            expect(result1).toEqual({ x: 180, y: 90 });

            // Test north pole (90, 0)
            const result2 = latLonToCanvas(90, 0, 360, 180);
            expect(result2).toEqual({ x: 180, y: 0 });

            // Test south pole (-90, 0)
            const result3 = latLonToCanvas(-90, 0, 360, 180);
            expect(result3).toEqual({ x: 180, y: 180 });

            // Test International Date Line (0, 180)
            const result4 = latLonToCanvas(0, 180, 360, 180);
            expect(result4).toEqual({ x: 360, y: 90 });

            // Test International Date Line (0, -180)
            const result5 = latLonToCanvas(0, -180, 360, 180);
            expect(result5).toEqual({ x: 0, y: 90 });
        });

        test('should handle longitude wrapping correctly', () => {
            // Longitude > 180 should wrap
            const result1 = latLonToCanvas(0, 270, 360, 180);
            expect(result1.x).toBeCloseTo(90); // 270° wraps to -90°, which maps to 90px

            // Longitude < -180 should wrap
            const result2 = latLonToCanvas(0, -270, 360, 180);
            expect(result2.x).toBeCloseTo(270); // -270° wraps to 90°, which maps to 270px
        });

        test('should work with different canvas sizes', () => {
            const result1 = latLonToCanvas(45, -90, 1024, 512);
            expect(result1).toEqual({
                x: (((-90 + 180) % 360) / 360) * 1024, // 256
                y: ((90 - 45) / 180) * 512 // 128
            });

            const result2 = latLonToCanvas(-30, 120, 800, 400);
            expect(result2).toEqual({
                x: (((120 + 180) % 360) / 360) * 800, // 666.67
                y: ((90 - (-30)) / 180) * 400 // 266.67
            });
        });
    });

    describe('projectToGeodetic', () => {
        test('should call groundTrackService with correct parameters', async () => {
            const mockResult = { lat: 45.0, lon: -122.0, alt: 400.0 };
            groundTrackService.transformECIToSurface.mockResolvedValue(mockResult);

            const worldPos = [7000, 0, 0];
            const planetNaifId = 399;
            const time = new Date('2024-01-01T00:00:00Z');

            const result = await projectToGeodetic(worldPos, planetNaifId, time);

            expect(groundTrackService.transformECIToSurface).toHaveBeenCalledWith(
                worldPos,
                planetNaifId,
                time.getTime()
            );
            expect(result).toEqual({
                latitude: 45.0,
                longitude: -122.0,
                altitude: 400.0
            });
        });

        test('should handle object input format', async () => {
            const mockResult = { lat: 30.0, lon: 90.0, alt: 500.0 };
            groundTrackService.transformECIToSurface.mockResolvedValue(mockResult);

            const worldPos = { x: 6000, y: 2000, z: 1000 };
            const planetNaifId = 399;
            const time = Date.now();

            const result = await projectToGeodetic(worldPos, planetNaifId, time);

            expect(groundTrackService.transformECIToSurface).toHaveBeenCalledWith(
                [6000, 2000, 1000],
                planetNaifId,
                time
            );
            expect(result).toEqual({
                latitude: 30.0,
                longitude: 90.0,
                altitude: 500.0
            });
        });

        test('should handle invalid inputs', async () => {
            const result1 = await projectToGeodetic(null, 399, new Date());
            const result2 = await projectToGeodetic([7000, 0, 0], undefined, new Date());

            expect(result1).toEqual({ latitude: 0, longitude: 0, altitude: 0 });
            expect(result2).toEqual({ latitude: 0, longitude: 0, altitude: 0 });
        });

        test('should handle timestamp input', async () => {
            const mockResult = { lat: 0, lon: 0, alt: 0 };
            groundTrackService.transformECIToSurface.mockResolvedValue(mockResult);

            const timestamp = 1609459200000; // 2021-01-01 00:00:00 UTC
            await projectToGeodetic([7000, 0, 0], 399, timestamp);

            expect(groundTrackService.transformECIToSurface).toHaveBeenCalledWith(
                [7000, 0, 0],
                399,
                timestamp
            );
        });
    });

    describe('projectWorldPosToCanvas', () => {
        test('should combine geodetic projection with canvas projection', async () => {
            const mockGeoResult = { lat: 45.0, lon: -122.0, alt: 400.0 };
            groundTrackService.transformECIToSurface.mockResolvedValue(mockGeoResult);

            const worldPos = [7000, 0, 0];
            const planetNaifId = 399;
            const width = 1024;
            const height = 512;
            const time = new Date();

            const result = await projectWorldPosToCanvas(worldPos, planetNaifId, width, height, time);

            expect(result.latitude).toBe(45.0);
            expect(result.longitude).toBe(-122.0);
            expect(result.altitude).toBe(400.0);
            expect(result.x).toBeCloseTo(((-122.0 + 180) / 360) * 1024);
            expect(result.y).toBeCloseTo(((90 - 45.0) / 180) * 512);
        });
    });

    describe('projectToPlanetLatLon', () => {
        test('should return simplified lat/lon format', async () => {
            const mockResult = { lat: 60.0, lon: 30.0, alt: 300.0 };
            groundTrackService.transformECIToSurface.mockResolvedValue(mockResult);

            const satPos = { x: 5000, y: 3000, z: 2000 };
            const planetNaifId = 399;
            const time = new Date();

            const result = await projectToPlanetLatLon(satPos, planetNaifId, time);

            expect(groundTrackService.transformECIToSurface).toHaveBeenCalledWith(
                [5000, 3000, 2000],
                planetNaifId,
                time.getTime()
            );
            expect(result).toEqual(mockResult);
        });

        test('should handle array input format', async () => {
            const mockResult = { lat: -45.0, lon: 170.0, alt: 600.0 };
            groundTrackService.transformECIToSurface.mockResolvedValue(mockResult);

            const satPos = [4000, -2000, 3000];
            const planetNaifId = 301; // Moon
            const timestamp = Date.now();

            const result = await projectToPlanetLatLon(satPos, planetNaifId, timestamp);

            expect(groundTrackService.transformECIToSurface).toHaveBeenCalledWith(
                satPos,
                planetNaifId,
                timestamp
            );
            expect(result).toEqual(mockResult);
        });
    });

    describe('coordinate transformation consistency', () => {
        test('should maintain consistency between different projection methods', async () => {
            const mockGeoResult = { lat: 37.7749, lon: -122.4194, alt: 100.0 }; // San Francisco
            groundTrackService.transformECIToSurface.mockResolvedValue(mockGeoResult);

            const worldPos = [6400, 0, 0]; // Approximate position
            const planetNaifId = 399;
            const time = new Date();

            // Test both methods return consistent results
            const geoResult = await projectToGeodetic(worldPos, planetNaifId, time);
            const planetResult = await projectToPlanetLatLon(worldPos, planetNaifId, time);

            expect(geoResult.latitude).toBe(planetResult.lat);
            expect(geoResult.longitude).toBe(planetResult.lon);
            expect(geoResult.altitude).toBe(planetResult.alt);
        });

        test('should handle edge cases in coordinate conversion', async () => {
            // Test poles
            groundTrackService.transformECIToSurface.mockResolvedValueOnce({ lat: 90, lon: 0, alt: 0 });
            const northPole = await projectToGeodetic([0, 0, 6371], 399, new Date());
            expect(northPole.latitude).toBe(90);

            groundTrackService.transformECIToSurface.mockResolvedValueOnce({ lat: -90, lon: 0, alt: 0 });
            const southPole = await projectToGeodetic([0, 0, -6371], 399, new Date());
            expect(southPole.latitude).toBe(-90);

            // Test date line
            groundTrackService.transformECIToSurface.mockResolvedValueOnce({ lat: 0, lon: 180, alt: 0 });
            const dateLine1 = await projectToGeodetic([6371, 0, 0], 399, new Date());
            expect(Math.abs(dateLine1.longitude)).toBe(180);

            groundTrackService.transformECIToSurface.mockResolvedValueOnce({ lat: 0, lon: -180, alt: 0 });
            const dateLine2 = await projectToGeodetic([-6371, 0, 0], 399, new Date());
            expect(Math.abs(dateLine2.longitude)).toBe(180);
        });
    });
});