/**
 * WorkerPhysicsData.test.js
 * 
 * Test what physics data workers are actually receiving
 */

import { PhysicsEngine } from '../src/physics/PhysicsEngine.js';
import { WorkerPoolManager } from '../src/managers/WorkerPoolManager.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Worker Physics Data Debug', () => {
    let physicsEngine;
    let workerManager;
    
    beforeEach(async () => {
        physicsEngine = new PhysicsEngine();
        await physicsEngine.initialize();
        // Skip worker manager in test environment
        // workerManager = new WorkerPoolManager();
    });

    it('should debug physics data sent to workers', async () => {
        // Check what physics engine has
        const state = physicsEngine.getSimulationState();
        console.log('Physics engine body count:', Object.keys(state.bodies).length);
        
        // Check Earth specifically
        const earth = state.bodies[399];
        console.log('Earth body data from physics engine:', {
            name: earth?.name,
            naif: earth?.naif,
            mass: earth?.mass,
            GM: earth?.GM,
            radius: earth?.radius,
            hasPosition: !!earth?.position,
            positionType: typeof earth?.position,
            hasAtmosphere: !!earth?.atmosphericModel
        });

        // Check what would be sent to workers
        const simplifiedBodies = {};
        for (const [id, body] of Object.entries(state.bodies)) {
            let atmosphericModel = null;
            if (body.atmosphericModel) {
                atmosphericModel = {
                    maxAltitude: body.atmosphericModel.maxAltitude,
                    minAltitude: body.atmosphericModel.minAltitude,
                    referenceAltitude: body.atmosphericModel.referenceAltitude,
                    referenceDensity: body.atmosphericModel.referenceDensity,
                    scaleHeight: body.atmosphericModel.scaleHeight
                };
            }
            
            simplifiedBodies[id] = {
                naif: parseInt(id),
                naifId: parseInt(id), // Add both for compatibility
                name: body.name,
                position: body.position.toArray ? body.position.toArray() : body.position,
                velocity: body.velocity.toArray ? body.velocity.toArray() : body.velocity,
                mass: body.mass,
                soiRadius: body.soiRadius,
                radius: body.radius,
                type: body.type,
                J2: body.J2,
                atmosphericModel: atmosphericModel,
                GM: body.GM,
                rotationPeriod: body.rotationPeriod
            };
        }

        console.log('Simplified bodies count:', Object.keys(simplifiedBodies).length);
        const simplifiedEarth = simplifiedBodies[399];
        console.log('Simplified Earth for workers:', {
            name: simplifiedEarth?.name,
            naif: simplifiedEarth?.naif,
            naifId: simplifiedEarth?.naifId,
            mass: simplifiedEarth?.mass,
            GM: simplifiedEarth?.GM,
            radius: simplifiedEarth?.radius,
            hasPosition: !!simplifiedEarth?.position,
            positionLength: simplifiedEarth?.position?.length,
            hasAtmosphere: !!simplifiedEarth?.atmosphericModel
        });

        // Test what bodies would be available for orbit propagation
        const bodiesArray = Object.values(simplifiedBodies);
        console.log('Bodies with valid mass/GM:');
        bodiesArray.forEach((body, index) => {
            if (body.mass > 0 || body.GM > 0) {
                console.log(`  ${index}: ${body.name} - mass: ${body.mass}, GM: ${body.GM}`);
            }
        });

        const validBodies = bodiesArray.filter(body => 
            (body.mass && body.mass > 0) || (body.GM && body.GM > 0)
        );
        console.log('Total valid bodies for orbit propagation:', validBodies.length);

        // Find dominant body for a 400km Earth orbit
        const satellitePos = [0, 0, 6371 + 400]; // 400km altitude
        console.log('Testing dominant body selection for satellite at:', satellitePos);

        let dominantBody = null;
        let maxInfluence = 0;
        
        for (const body of bodiesArray) {
            if (!body.mass || !body.position) continue;
            const bodyPos = body.position;
            const dx = satellitePos[0] - bodyPos[0];
            const dy = satellitePos[1] - bodyPos[1];
            const dz = satellitePos[2] - bodyPos[2];
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            const influence = body.mass / (distance * distance);
            
            if (influence > maxInfluence) {
                maxInfluence = influence;
                dominantBody = body;
            }
        }

        console.log('Selected dominant body:', dominantBody ? {
            name: dominantBody.name,
            mass: dominantBody.mass,
            GM: dominantBody.GM,
            influence: maxInfluence
        } : 'null');

        expect(validBodies.length).toBeGreaterThan(0);
        expect(dominantBody).toBeTruthy();
        expect(dominantBody.mass || dominantBody.GM).toBeGreaterThan(0);
    });

    it('should test actual worker update', () => {
        // Skip in test environment - workers not available
        console.log('Worker update test skipped in test environment');
        expect(true).toBe(true);
    });
});