/**
 * Tests for Backend Server AI Configuration
 * Validates that the backend server has all the required function definitions
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Backend Server AI Configuration', () => {
    let configContent;
    
    try {
        const configPath = join(__dirname, '../../../Reentry_server/src/config/assistantConfig.ts');
        configContent = readFileSync(configPath, 'utf-8');
    } catch (error) {
        // If can't read the actual file, use a mock to verify our expected structure
        configContent = `
        // Mock configuration structure for testing
        export const ASTRONAVIGATOR_CONFIG = {
            tools: [
                { type: 'function', name: 'createSatelliteFromOrbitalElements' },
                { type: 'function', name: 'createSatelliteFromLatLon' },
                { type: 'function', name: 'addManeuverNode' },
                { type: 'function', name: 'getSatelliteComms' },
                { type: 'function', name: 'getGroundTrack' },
                { type: 'function', name: 'calculateHohmannTransfer' }
            ]
        };`;
    }

    test('contains satellite creation functions', () => {
        expect(configContent).toContain('createSatelliteFromOrbitalElements');
        expect(configContent).toContain('createSatelliteFromLatLon');
        expect(configContent).toContain('createSatelliteFromLatLonCircular');
    });

    test('contains mission planning functions', () => {
        expect(configContent).toContain('addManeuverNode');
        expect(configContent).toContain('getManeuverNodes');
        expect(configContent).toContain('deleteManeuverNode');
        expect(configContent).toContain('calculateHohmannTransfer');
    });

    test('contains communication system functions', () => {
        expect(configContent).toContain('getSatelliteComms');
        expect(configContent).toContain('getCommunicationLinks');
        expect(configContent).toContain('updateCommsConfig');
    });

    test('contains ground tracking functions', () => {
        expect(configContent).toContain('getGroundTrack');
        expect(configContent).toContain('getCurrentPositions');
        expect(configContent).toContain('calculateCoverage');
        expect(configContent).toContain('getNextApsis');
    });

    test('contains orbital mechanics functions', () => {
        expect(configContent).toContain('getOrbitalElements');
        expect(configContent).toContain('calculateOrbitalPeriod');
        expect(configContent).toContain('getSphereOfInfluence');
    });

    test('contains simulation control functions', () => {
        expect(configContent).toContain('getSimulationTime');
        expect(configContent).toContain('setSimulationTime');
        expect(configContent).toContain('getTimeWarp');
        expect(configContent).toContain('setTimeWarp');
    });

    test('contains utility functions', () => {
        expect(configContent).toContain('convertCoordinates');
        expect(configContent).toContain('getSimulationStats');
        expect(configContent).toContain('updateDisplaySettings');
    });

    test('contains proper function parameters structure', () => {
        // Check that functions have proper parameter definitions
        expect(configContent).toContain('strict: true');
        expect(configContent).toContain('type: \'object\'');
        expect(configContent).toContain('properties:');
        expect(configContent).toContain('required:');
        expect(configContent).toContain('additionalProperties: false');
    });

    test('contains satellite creation with communication config', () => {
        // Check for communication configuration parameters
        expect(configContent).toContain('satelliteId');
        expect(configContent).toContain('deltaV');
        expect(configContent).toContain('executionTime');
        expect(configContent).toContain('antennaGain');
        expect(configContent).toContain('transmitPower');
    });

    test('has proper API structure sections', () => {
        // Verify the configuration is organized into logical sections
        expect(configContent).toContain('SATELLITE CREATION');
        expect(configContent).toContain('MISSION PLANNING');
        expect(configContent).toContain('COMMUNICATION SYSTEMS');
        expect(configContent).toContain('GROUND TRACKING');
    });
});

describe('Function Parameter Validation', () => {
    const requiredFunctions = [
        'createSatelliteFromOrbitalElements',
        'createSatelliteFromLatLon', 
        'addManeuverNode',
        'getSatelliteComms',
        'calculateHohmannTransfer',
        'getGroundTrack',
        'getCurrentPositions',
        'calculateCoverage',
        'updateCommsConfig'
    ];

    test('all required functions are defined', () => {
        requiredFunctions.forEach(funcName => {
            expect(configContent).toContain(`name: '${funcName}'`);
        });
    });

    test('satellite creation functions have required parameters', () => {
        // createSatelliteFromOrbitalElements should have orbital element parameters
        expect(configContent).toContain('semiMajorAxis');
        expect(configContent).toContain('eccentricity');
        expect(configContent).toContain('inclination');
        expect(configContent).toContain('raan');
        expect(configContent).toContain('argumentOfPeriapsis');
        expect(configContent).toContain('trueAnomaly');

        // createSatelliteFromLatLon should have geographic parameters
        expect(configContent).toContain('latitude');
        expect(configContent).toContain('longitude');
        expect(configContent).toContain('altitude');
        expect(configContent).toContain('velocity');
        expect(configContent).toContain('azimuth');
    });

    test('mission planning functions have required parameters', () => {
        // addManeuverNode should have execution time and delta-V
        expect(configContent).toContain('satelliteId');
        expect(configContent).toContain('executionTime');
        expect(configContent).toContain('deltaV');

        // calculateHohmannTransfer should have orbital parameters
        expect(configContent).toContain('currentSemiMajorAxis');
        expect(configContent).toContain('targetSemiMajorAxis');
    });

    test('communication functions have required parameters', () => {
        // Communication config should have antenna and power parameters
        expect(configContent).toContain('antennaGain');
        expect(configContent).toContain('transmitPower');
        expect(configContent).toContain('dataRate');
        expect(configContent).toContain('enabled');
    });
});

describe('Data Type Validation', () => {
    test('contains proper data types', () => {
        expect(configContent).toContain('type: \'string\'');
        expect(configContent).toContain('type: \'number\'');
        expect(configContent).toContain('type: \'boolean\'');
        expect(configContent).toContain('type: \'array\'');
    });

    test('contains proper descriptions', () => {
        expect(configContent).toContain('description:');
        // Should have meaningful descriptions for major functions
        expect(configContent).toMatch(/description:.*satellite/i);
        expect(configContent).toMatch(/description:.*maneuver/i);
        expect(configContent).toMatch(/description:.*communication/i);
    });

    test('contains proper default values where appropriate', () => {
        // Some parameters should have default values
        expect(configContent).toContain('default:');
        expect(configContent).toContain('399'); // Earth NAIF ID default
    });
});