/**
 * orbitPropagationWorker.js
 * 
 * Web Worker for satellite orbit propagation
 * Demonstrates maximum code reusability with shared classes
 */

import { UnifiedSatellitePropagator } from '../core/UnifiedSatellitePropagator.js';
import { WorkerMessageHandler } from '../../utils/WorkerMessageHandler.js';

// Store physics state for propagation
let physicsState = {
    bodies: {},
    hierarchy: null,
    initialTime: Date.now()
};

const messageHandler = new WorkerMessageHandler();

// Set up message handlers
messageHandler.onInitialize((data) => {
    physicsState = {
        bodies: data.bodies || {},
        hierarchy: data.hierarchy || null,
        initialTime: data.currentTime || Date.now()
    };
    
    // UnifiedSatellitePropagator doesn't need explicit initialization
    
});

messageHandler.addHandler('propagate', async (data) => {
    await propagateOrbitUsingUnifiedPropagator(data);
});

// Set up message listener
self.onmessage = (event) => messageHandler.handleMessage(event);

// Clean propagation function using UnifiedSatellitePropagator
async function propagateOrbitUsingUnifiedPropagator(params) {
    const { satelliteId } = params;
    
    // Convert parameters to UnifiedSatellitePropagator format
    const satellite = {
        position: params.position || [7000, 0, 0],
        velocity: params.velocity || [0, 7.546, 0],
        centralBodyNaifId: params.centralBodyNaifId || 399,
        mass: params.mass || 1000,
        crossSectionalArea: params.crossSectionalArea || 10,
        dragCoefficient: params.dragCoefficient || 2.2
    };
    
    const propagationParams = {
        satellite,
        bodies: physicsState.bodies,
        duration: params.duration || 5400, // 90 minutes default
        timeStep: params.timeStep || 60,    // 1 minute default
        startTime: params.startTime || 0,
        maxPoints: params.maxPoints, // No default limit - let UI control this
        includeJ2: params.includeJ2 !== false,
        includeDrag: params.includeDrag !== false,
        includeThirdBody: params.includeThirdBody !== false
    };
    
    try {
        // Use UnifiedSatellitePropagator for consistent physics
        const orbitPoints = UnifiedSatellitePropagator.propagateOrbit(propagationParams);
        
        // Send points in chunks to avoid overwhelming main thread
        const pointsPerChunk = params.pointsPerChunk || 100;
        
        for (let i = 0; i < orbitPoints.length; i += pointsPerChunk) {
            const chunk = orbitPoints.slice(i, i + pointsPerChunk);
            const progress = (i + chunk.length) / orbitPoints.length;
            const isComplete = i + chunk.length >= orbitPoints.length;
            
            // Send chunk to main thread
            messageHandler.sendProgress('chunk', {
                satelliteId,
                points: chunk,
                soiTransitions: [], // TODO: Add SOI transitions if needed
                progress,
                isComplete,
                finalSolarSystemState: isComplete ? physicsState.bodies : null
            });
            
            // Small delay to avoid overwhelming main thread
            if (!isComplete) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        
        // Send completion message
        messageHandler.sendComplete({
            satelliteId,
            message: 'Orbit propagation completed using UnifiedSatellitePropagator'
        });
        
    } catch (error) {
        messageHandler.sendError({
            satelliteId,
            error: error.message,
            stack: error.stack
        });
    }
}