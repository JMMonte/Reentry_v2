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

// Store active timeout IDs for cleanup
const activeTimeouts = new Set();

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

// Add cleanup handler for worker termination
messageHandler.addHandler('cleanup', () => {
    // Clear all active timeouts
    activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    activeTimeouts.clear();
    
    // Clear cached data
    physicsState = {
        bodies: {},
        hierarchy: null,
        initialTime: Date.now()
    };
});

// Set up message listener
self.onmessage = (event) => {
    // Handle termination signal
    if (event.data && event.data.type === 'terminate') {
        // Clean up resources
        activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        activeTimeouts.clear();
        self.close();
        return;
    }
    
    messageHandler.handleMessage(event);
};

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
        includeThirdBody: params.includeThirdBody !== false,
        timeWarp: params.timeWarp || 1,
        method: params.method || 'auto', // auto, rk4, or rk45
        maneuverNodes: params.maneuverNodes || [] // Include maneuver nodes for propagation
    };
    
    try {
        // Use UnifiedSatellitePropagator for consistent physics
        const orbitPoints = UnifiedSatellitePropagator.propagateOrbit(propagationParams);
        
        // Send points in larger chunks for better performance
        const pointsPerChunk = params.pointsPerChunk || 1000; // Increased from 100
        
        // For small orbits, send all at once
        if (orbitPoints.length <= pointsPerChunk) {
            messageHandler.sendProgress('chunk', {
                satelliteId,
                points: orbitPoints,
                soiTransitions: [], // TODO: Add SOI transitions if needed
                progress: 1,
                isComplete: true,
                finalSolarSystemState: physicsState.bodies
            });
        } else {
            // For large orbits, send in chunks without artificial delays
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
                
                // Only yield control for very large datasets to prevent blocking
                if (!isComplete && orbitPoints.length > 10000 && i % 5000 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }
        
        // Send completion message
        messageHandler.sendComplete({
            satelliteId,
            message: 'Orbit propagation completed using UnifiedSatellitePropagator'
        });
        
    } catch (error) {
        console.error('[OrbitWorker] Error during propagation:', error);
        messageHandler.sendError({
            satelliteId,
            error: error.message,
            stack: error.stack
        });
    }
}