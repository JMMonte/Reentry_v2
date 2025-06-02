/**
 * SubsystemManager.test.js
 * 
 * Tests for the subsystem manager that coordinates all satellite subsystems
 * within the physics engine, focusing on communication system integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubsystemManager } from '../src/physics/subsystems/SubsystemManager.js';
import { CommunicationSubsystem } from '../src/physics/subsystems/CommunicationSubsystem.js';

describe('SubsystemManager', () => {
    let subsystemManager;
    let mockPhysicsEngine;

    beforeEach(() => {
        // Mock physics engine
        mockPhysicsEngine = {
            satellites: new Map([
                ['sat-1', { 
                    position: [0, 0, 0], 
                    velocity: [0, 7.5, 0],
                    centralBodyNaifId: 399 
                }],
                ['sat-2', { 
                    position: [1000, 0, 0], 
                    velocity: [0, 7.2, 0],
                    centralBodyNaifId: 399 
                }]
            ])
        };

        subsystemManager = new SubsystemManager(mockPhysicsEngine);
    });

    describe('Initialization', () => {
        it('should initialize with physics engine reference', () => {
            expect(subsystemManager.physicsEngine).toBe(mockPhysicsEngine);
            expect(subsystemManager.subsystems).toBeInstanceOf(Map);
            expect(subsystemManager.subsystemTypes.has('communication')).toBe(true);
        });

        it('should have correct subsystem types registered', () => {
            const types = subsystemManager.getAvailableSubsystemTypes();
            expect(types).toContain('communication');
        });
    });

    describe('Subsystem Management', () => {
        it('should add communication subsystem to satellite', () => {
            const config = {
                antennaGain: 20.0,
                transmitPower: 15.0
            };

            const subsystem = subsystemManager.addSubsystem('sat-1', 'communication', config);

            expect(subsystem).toBeInstanceOf(CommunicationSubsystem);
            expect(subsystem.satelliteId).toBe('sat-1');
            expect(subsystem.config.antennaGain).toBe(20.0);
            expect(subsystem.getPhysicsEngine()).toBe(mockPhysicsEngine);
        });

        it('should replace existing subsystem of same type', () => {
            const subsystem1 = subsystemManager.addSubsystem('sat-1', 'communication', { antennaGain: 10.0 });
            const destroySpy = vi.spyOn(subsystem1, 'destroy');

            const subsystem2 = subsystemManager.addSubsystem('sat-1', 'communication', { antennaGain: 20.0 });

            expect(destroySpy).toHaveBeenCalled();
            expect(subsystem2.config.antennaGain).toBe(20.0);
            expect(subsystemManager.getSubsystem('sat-1', 'communication')).toBe(subsystem2);
        });

        it('should get subsystem by satellite ID and type', () => {
            const subsystem = subsystemManager.addSubsystem('sat-1', 'communication');
            const retrieved = subsystemManager.getSubsystem('sat-1', 'communication');

            expect(retrieved).toBe(subsystem);
        });

        it('should return null for non-existent subsystem', () => {
            const retrieved = subsystemManager.getSubsystem('non-existent', 'communication');
            expect(retrieved).toBeNull();
        });

        it('should get all subsystems for a satellite', () => {
            subsystemManager.addSubsystem('sat-1', 'communication');
            
            const satelliteSubsystems = subsystemManager.getSatelliteSubsystems('sat-1');
            expect(satelliteSubsystems.size).toBe(1);
            expect(satelliteSubsystems.has('communication')).toBe(true);
        });

        it('should remove specific subsystem', () => {
            const subsystem = subsystemManager.addSubsystem('sat-1', 'communication');
            const destroySpy = vi.spyOn(subsystem, 'destroy');

            const removed = subsystemManager.removeSubsystem('sat-1', 'communication');

            expect(removed).toBe(true);
            expect(destroySpy).toHaveBeenCalled();
            expect(subsystemManager.getSubsystem('sat-1', 'communication')).toBeNull();
        });

        it('should remove all subsystems when satellite is removed', () => {
            const commSubsystem = subsystemManager.addSubsystem('sat-1', 'communication');
            const commDestroySpy = vi.spyOn(commSubsystem, 'destroy');

            subsystemManager.removeSatellite('sat-1');

            expect(commDestroySpy).toHaveBeenCalled();
            expect(subsystemManager.getSatelliteSubsystems('sat-1').size).toBe(0);
        });
    });

    describe('Status Management', () => {
        beforeEach(() => {
            subsystemManager.addSubsystem('sat-1', 'communication', {
                antennaGain: 15.0,
                transmitPower: 10.0
            });
        });

        it('should get subsystem status', () => {
            const status = subsystemManager.getSubsystemStatus('sat-1', 'communication');

            expect(status).toBeDefined();
            expect(status.subsystemType).toBe('communication');
            expect(status.satelliteId).toBe('sat-1');
            expect(status.config).toBeDefined();
            expect(status.state).toBeDefined();
        });

        it('should get all subsystem statuses for satellite', () => {
            const statuses = subsystemManager.getAllSubsystemStatuses('sat-1');

            expect(statuses.communication).toBeDefined();
            expect(statuses.communication.subsystemType).toBe('communication');
        });

        it('should return empty object for satellite with no subsystems', () => {
            const statuses = subsystemManager.getAllSubsystemStatuses('non-existent');
            expect(Object.keys(statuses)).toHaveLength(0);
        });
    });

    describe('Configuration Management', () => {
        beforeEach(() => {
            subsystemManager.addSubsystem('sat-1', 'communication', {
                antennaGain: 15.0,
                transmitPower: 10.0
            });
        });

        it('should update subsystem configuration', () => {
            const success = subsystemManager.updateSubsystemConfig('sat-1', 'communication', {
                transmitPower: 25.0,
                dataRate: 2000
            });

            expect(success).toBe(true);

            const status = subsystemManager.getSubsystemStatus('sat-1', 'communication');
            expect(status.config.transmitPower).toBe(25.0);
            expect(status.config.dataRate).toBe(2000);
            expect(status.config.antennaGain).toBe(15.0); // Should preserve existing
        });

        it('should fail to update non-existent subsystem', () => {
            const success = subsystemManager.updateSubsystemConfig('non-existent', 'communication', {
                transmitPower: 25.0
            });

            expect(success).toBe(false);
        });

        it('should enable/disable subsystem', () => {
            const success = subsystemManager.setSubsystemEnabled('sat-1', 'communication', false);
            expect(success).toBe(true);

            const status = subsystemManager.getSubsystemStatus('sat-1', 'communication');
            expect(status.isEnabled).toBe(false);
            expect(status.state.status).toBe('offline');
        });
    });

    describe('Physics Updates', () => {
        beforeEach(() => {
            subsystemManager.addSubsystem('sat-1', 'communication');
            subsystemManager.addSubsystem('sat-2', 'communication');
        });

        it('should update all subsystems during physics step', () => {
            const commSubsystem1 = subsystemManager.getSubsystem('sat-1', 'communication');
            const commSubsystem2 = subsystemManager.getSubsystem('sat-2', 'communication');

            const updateSpy1 = vi.spyOn(commSubsystem1, 'update');
            const updateSpy2 = vi.spyOn(commSubsystem2, 'update');

            const deltaTime = 1.0;
            subsystemManager.update(deltaTime);

            expect(updateSpy1).toHaveBeenCalledWith(
                deltaTime,
                mockPhysicsEngine.satellites.get('sat-1'),
                expect.objectContaining({ solarRadiation: 1361 })
            );
            expect(updateSpy2).toHaveBeenCalledWith(
                deltaTime,
                mockPhysicsEngine.satellites.get('sat-2'),
                expect.objectContaining({ solarRadiation: 1361 })
            );
        });

        it('should handle missing satellite during update', () => {
            subsystemManager.addSubsystem('missing-sat', 'communication');
            
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();
            
            subsystemManager.update(1.0);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Satellite missing-sat not found')
            );
            
            consoleSpy.mockRestore();
        });

        it('should handle subsystem update errors gracefully', () => {
            const commSubsystem = subsystemManager.getSubsystem('sat-1', 'communication');
            const updateSpy = vi.spyOn(commSubsystem, 'update').mockImplementation(() => {
                throw new Error('Test error');
            });
            const failureSpy = vi.spyOn(commSubsystem, 'onFailure');

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation();

            subsystemManager.update(1.0);

            expect(consoleSpy).toHaveBeenCalled();
            expect(failureSpy).toHaveBeenCalledWith('Update error: Test error');

            consoleSpy.mockRestore();
            updateSpy.mockRestore();
        });
    });

    describe('Performance Monitoring', () => {
        beforeEach(() => {
            subsystemManager.addSubsystem('sat-1', 'communication');
            subsystemManager.addSubsystem('sat-2', 'communication');
        });

        it('should track performance statistics', () => {
            const initialStats = subsystemManager.getPerformanceStats();
            expect(initialStats.totalUpdates).toBe(0);
            expect(initialStats.activeSatellites).toBe(2);
            expect(initialStats.totalSubsystems).toBe(2);

            subsystemManager.update(1.0);

            const updatedStats = subsystemManager.getPerformanceStats();
            expect(updatedStats.totalUpdates).toBe(1);
            expect(updatedStats.averageUpdateTime).toBeGreaterThan(0);
            expect(updatedStats.lastUpdateTime).toBeGreaterThan(0);
        });

        it('should calculate total power consumption', () => {
            const totalPower = subsystemManager.getTotalPowerConsumption('sat-1');
            expect(totalPower).toBe(5.0); // Base power for communication subsystem
        });

        it('should calculate total thermal output', () => {
            const totalThermal = subsystemManager.getTotalThermalOutput('sat-1');
            expect(totalThermal).toBe(3.5); // 70% of 5W base power
        });
    });

    describe('Environmental Conditions', () => {
        it('should provide environmental conditions for subsystems', () => {
            const environment = subsystemManager.getEnvironmentalConditions();

            expect(environment.solarRadiation).toBe(1361);
            expect(environment.temperature).toBe(2.7);
            expect(environment.magneticField).toBe(0);
            expect(environment.plasmaDensity).toBe(0);
            expect(typeof environment.timestamp).toBe('number');
        });
    });

    describe('Subsystem Type Registration', () => {
        it('should register new subsystem type', () => {
            class TestSubsystem {
                constructor(satelliteId, config) {
                    this.satelliteId = satelliteId;
                    this.config = config;
                }
            }

            subsystemManager.registerSubsystemType('test', TestSubsystem);

            expect(subsystemManager.subsystemTypes.has('test')).toBe(true);
            expect(subsystemManager.getAvailableSubsystemTypes()).toContain('test');
        });

        it('should throw error for unknown subsystem type', () => {
            expect(() => {
                subsystemManager.addSubsystem('sat-1', 'unknown-type');
            }).toThrow('Unknown subsystem type: unknown-type');
        });
    });

    describe('Cleanup', () => {
        beforeEach(() => {
            subsystemManager.addSubsystem('sat-1', 'communication');
            subsystemManager.addSubsystem('sat-2', 'communication');
        });

        it('should destroy all subsystems on cleanup', () => {
            const commSubsystem1 = subsystemManager.getSubsystem('sat-1', 'communication');
            const commSubsystem2 = subsystemManager.getSubsystem('sat-2', 'communication');

            const destroySpy1 = vi.spyOn(commSubsystem1, 'destroy');
            const destroySpy2 = vi.spyOn(commSubsystem2, 'destroy');

            subsystemManager.destroy();

            expect(destroySpy1).toHaveBeenCalled();
            expect(destroySpy2).toHaveBeenCalled();
            expect(subsystemManager.subsystems.size).toBe(0);
        });
    });
});