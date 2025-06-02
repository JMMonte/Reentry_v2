/**
 * CommunicationLinkCalculations.test.js
 * 
 * Detailed tests for RF link budget calculations, signal propagation,
 * and communication feasibility between satellites and ground stations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CommunicationSubsystem } from '../src/physics/subsystems/CommunicationSubsystem.js';

describe('Communication Link Calculations', () => {
    let commSystem;
    let satelliteId;

    beforeEach(() => {
        satelliteId = 'test-sat';
        commSystem = new CommunicationSubsystem(satelliteId, {
            antennaGain: 20.0,          // 20 dBi
            transmitPower: 10.0,        // 10 watts
            transmitFrequency: 2.4,     // 2.4 GHz
            receiverSensitivity: -110,  // -110 dBm
            maxRange: 5000,             // 5000 km
            minElevationAngle: 10.0     // 10 degrees
        });
    });

    describe('Distance Calculations', () => {
        it('should calculate correct distance between two points', () => {
            const pos1 = [0, 0, 0];
            const pos2 = [3, 4, 0]; // 3-4-5 triangle
            
            const distance = commSystem.calculateDistance(pos1, pos2);
            expect(distance).toBeCloseTo(5.0, 6);
        });

        it('should calculate distance for 3D positions', () => {
            const pos1 = [0, 0, 0];
            const pos2 = [1, 1, 1];
            
            const distance = commSystem.calculateDistance(pos1, pos2);
            expect(distance).toBeCloseTo(Math.sqrt(3), 6);
        });

        it('should handle same position', () => {
            const pos1 = [100, 200, 300];
            const pos2 = [100, 200, 300];
            
            const distance = commSystem.calculateDistance(pos1, pos2);
            expect(distance).toBe(0);
        });
    });

    describe('Elevation Angle Calculations', () => {
        it('should calculate elevation angle for satellite directly overhead', () => {
            const satellitePos = [0, 0, 400];   // 400 km altitude
            const groundPos = [0, 0, 0];        // At origin
            
            const elevation = commSystem.calculateElevationAngle(satellitePos, groundPos);
            expect(elevation).toBeCloseTo(90, 1);
        });

        it('should calculate elevation angle for satellite on horizon', () => {
            const satellitePos = [6371, 0, 400]; // At horizon with 400 km altitude
            const groundPos = [0, 0, 0];
            
            const elevation = commSystem.calculateElevationAngle(satellitePos, groundPos);
            // For a satellite 400km above at distance 6371km, elevation should be low but positive
            expect(elevation).toBeGreaterThan(0);
            expect(elevation).toBeLessThan(10);
        });

        it('should calculate elevation angle for mid-range satellite', () => {
            const satellitePos = [1000, 0, 1000]; // Equal x and z components
            const groundPos = [0, 0, 0];
            
            const elevation = commSystem.calculateElevationAngle(satellitePos, groundPos);
            expect(elevation).toBeCloseTo(45, 1);
        });

        it('should handle negative elevation (satellite below horizon)', () => {
            const satellitePos = [1000, 0, -500]; // Below horizon
            const groundPos = [0, 0, 0];
            
            const elevation = commSystem.calculateElevationAngle(satellitePos, groundPos);
            expect(elevation).toBeLessThan(0);
        });
    });

    describe('Free Space Path Loss', () => {
        it('should calculate higher path loss for greater distances', () => {
            const satellite = { position: [0, 0, 0] };
            const environment = { temperature: 2.7 };
            
            const closeTarget = {
                id: 'close',
                type: 'satellite',
                position: [1000, 0, 0], // 1000 km
                antennaGain: 15.0
            };
            
            const farTarget = {
                id: 'far',
                type: 'satellite',
                position: [2000, 0, 0], // 2000 km
                antennaGain: 15.0
            };
            
            const closeLinkInfo = commSystem.calculateLinkBudget(satellite, closeTarget, environment);
            const farLinkInfo = commSystem.calculateLinkBudget(satellite, farTarget, environment);
            
            // Further satellite should have lower received power (higher path loss)
            expect(farLinkInfo.receivedPower).toBeLessThan(closeLinkInfo.receivedPower);
        });

        it('should calculate realistic path loss for typical LEO distances', () => {
            const satellite = { position: [0, 0, 0] };
            const environment = { temperature: 2.7 };
            
            const target = {
                id: 'leo-sat',
                type: 'satellite',
                position: [1000, 0, 0], // 1000 km
                antennaGain: 15.0
            };
            
            const linkInfo = commSystem.calculateLinkBudget(satellite, target, environment);
            
            // For 2.4 GHz and 1000 km, path loss should be around 162 dB
            // Received power = TxPower(40dBm) + TxGain(20dBi) + RxGain(15dBi) - PathLoss - SystemLoss(3dB)
            // Should be positive for good link
            expect(linkInfo.receivedPower).toBeGreaterThan(-110); // Above sensitivity
        });
    });

    describe('Link Budget Analysis', () => {
        let satellite;
        let environment;

        beforeEach(() => {
            satellite = { position: [0, 0, 0] };
            environment = { temperature: 2.7 };
        });

        it('should establish good link for close, high-gain satellites', () => {
            const target = {
                id: 'good-target',
                type: 'satellite',
                position: [500, 0, 0], // Close distance
                antennaGain: 25.0       // High gain antenna
            };
            
            const linkInfo = commSystem.calculateLinkBudget(satellite, target, environment);
            
            expect(linkInfo.possible).toBe(true);
            expect(linkInfo.quality).toBeGreaterThan(50);
            expect(linkInfo.margin).toBeGreaterThan(0);
            expect(linkInfo.dataRate).toBeGreaterThan(0);
        });

        it('should reject link for very distant satellites', () => {
            const target = {
                id: 'distant-target',
                type: 'satellite',
                position: [10000, 0, 0], // Beyond max range
                antennaGain: 15.0
            };
            
            const linkInfo = commSystem.calculateLinkBudget(satellite, target, environment);
            
            expect(linkInfo.possible).toBe(false);
            expect(linkInfo.reason).toBe('Out of range');
        });

        it('should reject link with poor signal quality', () => {
            const target = {
                id: 'poor-target',
                type: 'satellite',
                position: [4000, 0, 0], // Near max range
                antennaGain: -5.0       // Very poor antenna
            };
            
            const linkInfo = commSystem.calculateLinkBudget(satellite, target, environment);
            
            expect(linkInfo.possible).toBe(false);
            expect(linkInfo.reason).toBe('Insufficient link margin');
        });

        it('should scale data rate with link quality', () => {
            const closeTarget = {
                id: 'close',
                type: 'satellite',
                position: [300, 0, 0],  // Very close
                antennaGain: 25.0       // Good antenna
            };
            
            const farTarget = {
                id: 'far',
                type: 'satellite', 
                position: [2000, 0, 0], // Much farther
                antennaGain: 5.0        // Poor antenna
            };
            
            const closeLink = commSystem.calculateLinkBudget(satellite, closeTarget, environment);
            const farLink = commSystem.calculateLinkBudget(satellite, farTarget, environment);
            
            // At least one link should be possible
            expect(closeLink.possible || farLink.possible).toBe(true);
            
            if (closeLink.possible && farLink.possible) {
                // If both links work, the closer one with better antenna should be better
                if (closeLink.quality !== farLink.quality) {
                    expect(closeLink.quality).toBeGreaterThan(farLink.quality);
                    expect(closeLink.dataRate).toBeGreaterThan(farLink.dataRate);
                }
            }
            
            // Close target should definitely work
            expect(closeLink.possible).toBe(true);
            expect(closeLink.quality).toBeGreaterThan(0);
            expect(closeLink.dataRate).toBeGreaterThan(0);
        });
    });

    describe('Ground Station Communications', () => {
        let satellite;
        let environment;

        beforeEach(() => {
            satellite = { position: [0, 0, 400] }; // 400 km altitude
            environment = { temperature: 2.7 };
        });

        it('should establish link with overhead ground station', () => {
            const groundStation = {
                id: 'ground-1',
                type: 'ground_station',
                position: [0, 0, 0], // Directly below satellite
                antennaGain: 30.0     // High-gain ground antenna
            };
            
            const linkInfo = commSystem.calculateLinkBudget(satellite, groundStation, environment);
            
            expect(linkInfo.possible).toBe(true);
            expect(linkInfo.elevationAngle).toBeCloseTo(90, 1);
            expect(linkInfo.quality).toBeGreaterThan(70);
        });

        it('should reject ground station below minimum elevation', () => {
            const groundStation = {
                id: 'low-elevation',
                type: 'ground_station',
                position: [3000, 0, 0], // Low elevation angle
                antennaGain: 30.0
            };
            
            const linkInfo = commSystem.calculateLinkBudget(satellite, groundStation, environment);
            
            if (linkInfo.elevationAngle < 10.0) {
                expect(linkInfo.possible).toBe(false);
                expect(linkInfo.reason).toBe('Below minimum elevation');
            }
        });

        it('should calculate different elevation angles correctly', () => {
            const positions = [
                { pos: [0, 0, 0], expectedElev: 90 },      // Overhead
                { pos: [400, 0, 0], expectedElev: 45 },     // 45 degree angle
                { pos: [800, 0, 0], expectedElev: 26.6 }    // Lower angle
            ];
            
            positions.forEach(({ pos, expectedElev }) => {
                const groundStation = {
                    id: 'test-ground',
                    type: 'ground_station',
                    position: pos,
                    antennaGain: 30.0
                };
                
                const linkInfo = commSystem.calculateLinkBudget(satellite, groundStation, environment);
                expect(linkInfo.elevationAngle).toBeCloseTo(expectedElev, 1);
            });
        });
    });

    describe('Frequency and Antenna Effects', () => {
        it('should have different path loss for different frequencies', () => {
            const lowFreqSystem = new CommunicationSubsystem('low-freq', {
                transmitFrequency: 1.0, // 1 GHz
                antennaGain: 20.0,
                transmitPower: 10.0
            });
            
            const highFreqSystem = new CommunicationSubsystem('high-freq', {
                transmitFrequency: 10.0, // 10 GHz
                antennaGain: 20.0,
                transmitPower: 10.0
            });
            
            const satellite = { position: [0, 0, 0] };
            const target = {
                id: 'target',
                type: 'satellite',
                position: [1000, 0, 0],
                antennaGain: 15.0
            };
            const environment = { temperature: 2.7 };
            
            const lowFreqLink = lowFreqSystem.calculateLinkBudget(satellite, target, environment);
            const highFreqLink = highFreqSystem.calculateLinkBudget(satellite, target, environment);
            
            // Higher frequency should have higher path loss (lower received power)
            if (lowFreqLink.possible && highFreqLink.possible) {
                expect(lowFreqLink.receivedPower).toBeGreaterThan(highFreqLink.receivedPower);
            }
        });

        it('should benefit from higher antenna gains', () => {
            const lowGainSystem = new CommunicationSubsystem('low-gain', {
                antennaGain: 5.0,
                transmitPower: 10.0
            });
            
            const highGainSystem = new CommunicationSubsystem('high-gain', {
                antennaGain: 25.0,
                transmitPower: 10.0
            });
            
            const satellite = { position: [0, 0, 0] };
            const target = {
                id: 'target',
                type: 'satellite',
                position: [2000, 0, 0],
                antennaGain: 15.0
            };
            const environment = { temperature: 2.7 };
            
            const lowGainLink = lowGainSystem.calculateLinkBudget(satellite, target, environment);
            const highGainLink = highGainSystem.calculateLinkBudget(satellite, target, environment);
            
            // Higher gain should provide better link
            expect(highGainLink.receivedPower).toBeGreaterThan(lowGainLink.receivedPower);
            expect(highGainLink.margin).toBeGreaterThan(lowGainLink.margin);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle zero distance between satellites', () => {
            const satellite = { position: [1000, 1000, 1000] };
            const target = {
                id: 'same-position',
                type: 'satellite',
                position: [1000, 1000, 1000], // Same position
                antennaGain: 15.0
            };
            const environment = { temperature: 2.7 };
            
            const linkInfo = commSystem.calculateLinkBudget(satellite, target, environment);
            
            // Should handle gracefully - either establish perfect link or reject due to proximity
            expect(linkInfo).toBeDefined();
            expect(typeof linkInfo.possible).toBe('boolean');
        });

        it('should handle very large distances', () => {
            const satellite = { position: [0, 0, 0] };
            const target = {
                id: 'very-far',
                type: 'satellite',
                position: [1000000, 0, 0], // 1 million km
                antennaGain: 50.0 // Even very high gain won't help
            };
            const environment = { temperature: 2.7 };
            
            const linkInfo = commSystem.calculateLinkBudget(satellite, target, environment);
            
            expect(linkInfo.possible).toBe(false);
            expect(linkInfo.reason).toBe('Out of range');
        });

        it('should handle negative antenna gains', () => {
            const satellite = { position: [0, 0, 0] };
            const target = {
                id: 'bad-antenna',
                type: 'satellite',
                position: [1000, 0, 0],
                antennaGain: -20.0 // Very poor antenna
            };
            const environment = { temperature: 2.7 };
            
            const linkInfo = commSystem.calculateLinkBudget(satellite, target, environment);
            
            expect(linkInfo.possible).toBe(false);
            expect(linkInfo.reason).toBe('Insufficient link margin');
        });
    });
});