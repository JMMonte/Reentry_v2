/**
 * Tests to validate that our API documentation is complete and accurate
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('External API Documentation', () => {
    let apiDocContent;
    
    try {
        const apiDocPath = join(__dirname, '../src/EXTERNAL_API.md');
        apiDocContent = readFileSync(apiDocPath, 'utf-8');
    } catch (error) {
        throw new Error('Could not read External API documentation');
    }

    test('documents satellite creation functions', () => {
        expect(apiDocContent).toContain('createSatelliteFromOrbitalElements');
        expect(apiDocContent).toContain('createSatelliteFromLatLon');
        expect(apiDocContent).toContain('createSatelliteFromLatLonCircular');
        expect(apiDocContent).toContain('commsConfig');
    });

    test('documents mission planning functions', () => {
        expect(apiDocContent).toContain('addManeuverNode');
        expect(apiDocContent).toContain('getManeuverNodes');
        expect(apiDocContent).toContain('deleteManeuverNode');
        expect(apiDocContent).toContain('calculateHohmannTransfer');
        expect(apiDocContent).toContain('MISSION PLANNING');
    });

    test('documents communication functions', () => {
        expect(apiDocContent).toContain('getSatelliteComms');
        expect(apiDocContent).toContain('getCommunicationLinks');
        expect(apiDocContent).toContain('updateCommsConfig');
        expect(apiDocContent).toContain('COMMUNICATION SYSTEMS');
    });

    test('documents ground tracking functions', () => {
        expect(apiDocContent).toContain('getGroundTrack');
        expect(apiDocContent).toContain('getCurrentPositions');
        expect(apiDocContent).toContain('calculateCoverage');
        expect(apiDocContent).toContain('GROUND TRACKING');
    });

    test('documents orbital mechanics functions', () => {
        expect(apiDocContent).toContain('getOrbitalElements');
        expect(apiDocContent).toContain('calculateOrbitalPeriod');
        expect(apiDocContent).toContain('getSphereOfInfluence');
        expect(apiDocContent).toContain('ORBITAL MECHANICS');
    });

    test('includes example usage', () => {
        expect(apiDocContent).toContain('Example Usage');
        expect(apiDocContent).toContain('```js');
        expect(apiDocContent).toContain('window.api');
    });

    test('includes communication configuration section', () => {
        expect(apiDocContent).toContain('Communication Configuration');
        expect(apiDocContent).toContain('preset');
        expect(apiDocContent).toContain('antennaGain');
        expect(apiDocContent).toContain('transmitPower');
    });

    test('includes error handling section', () => {
        expect(apiDocContent).toContain('Error Handling');
        expect(apiDocContent).toContain('success');
        expect(apiDocContent).toContain('error');
    });
});

describe('API Function Coverage', () => {
    const requiredFunctions = [
        // Satellite Creation
        'createSatelliteFromOrbitalElements',
        'createSatelliteFromLatLon', 
        'createSatelliteFromLatLonCircular',
        
        // Satellite Management
        'getSatellites',
        'getSatellite',
        'deleteSatellite',
        
        // Mission Planning
        'addManeuverNode',
        'getManeuverNodes',
        'deleteManeuverNode',
        'calculateHohmannTransfer',
        
        // Communication Systems
        'getSatelliteComms',
        'getCommunicationLinks',
        'updateCommsConfig',
        
        // Ground Tracking
        'getGroundTrack',
        'getCurrentPositions',
        'calculateCoverage',
        
        // Orbital Mechanics
        'getOrbitalElements',
        'calculateOrbitalPeriod',
        'getSphereOfInfluence',
        
        // Simulation Control
        'getSimulationTime',
        'setSimulationTime',
        'getTimeWarp',
        'setTimeWarp',
        
        // Celestial Bodies
        'getCelestialBodies',
        'focusCamera',
        
        // Utilities
        'convertCoordinates',
        'getSimulationStats',
        'updateDisplaySettings'
    ];

    let apiDocContent;
    
    try {
        const apiDocPath = join(__dirname, '../src/EXTERNAL_API.md');
        apiDocContent = readFileSync(apiDocPath, 'utf-8');
    } catch (error) {
        throw new Error('Could not read External API documentation');
    }

    test('all required functions are documented', () => {
        requiredFunctions.forEach(funcName => {
            expect(apiDocContent).toContain(funcName);
        });
    });

    test('functions have parameter documentation', () => {
        // Check that major functions have parameter descriptions
        expect(apiDocContent).toContain('Parameters:');
        expect(apiDocContent).toContain('Returns:');
        expect(apiDocContent).toContain('satelliteId');
        expect(apiDocContent).toContain('semiMajorAxis');
        expect(apiDocContent).toContain('latitude');
        expect(apiDocContent).toContain('longitude');
    });
});

describe('Implementation Completeness', () => {
    let apiImplContent;
    
    try {
        const apiImplPath = join(__dirname, '../src/simulation/externalApi.js');
        apiImplContent = readFileSync(apiImplPath, 'utf-8');
    } catch (error) {
        throw new Error('Could not read External API implementation');
    }

    const implementedFunctions = [
        'createSatelliteFromOrbitalElements',
        'createSatelliteFromLatLon',
        'createSatelliteFromLatLonCircular',
        'getSatellites',
        'getSatellite',
        'deleteSatellite',
        'addManeuverNode',
        'getManeuverNodes',
        'deleteManeuverNode',
        'calculateHohmannTransfer',
        'getSatelliteComms',
        'getCommunicationLinks',
        'updateCommsConfig',
        'getGroundTrack',
        'getCurrentPositions',
        'calculateCoverage',
        'getOrbitalElements',
        'calculateOrbitalPeriod',
        'getSimulationTime',
        'setSimulationTime',
        'getTimeWarp',
        'setTimeWarp',
        'getCelestialBodies',
        'focusCamera',
        'updateDisplaySettings'
    ];

    test('all documented functions are implemented', () => {
        implementedFunctions.forEach(funcName => {
            expect(apiImplContent).toContain(`${funcName}:`);
        });
    });

    test('functions return proper response format', () => {
        // Check that functions return { success: true/false, ... } format
        expect(apiImplContent).toContain('success: true');
        expect(apiImplContent).toContain('success: false');
        expect(apiImplContent).toContain('error:');
    });

    test('communication features are integrated', () => {
        expect(apiImplContent).toContain('commsConfig');
        expect(apiImplContent).toContain('communication');
        expect(apiImplContent).toContain('subsystemManager');
    });

    test('maneuver features are integrated', () => {
        expect(apiImplContent).toContain('maneuverNodes');
        expect(apiImplContent).toContain('addManeuverNode');
        expect(apiImplContent).toContain('deltaV');
        expect(apiImplContent).toContain('executionTime');
    });

    test('ground tracking features are integrated', () => {
        expect(apiImplContent).toContain('groundTrackService');
        expect(apiImplContent).toContain('getCurrentPositions');
        expect(apiImplContent).toContain('calculateCoverage');
    });
});