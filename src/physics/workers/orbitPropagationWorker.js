/**
 * orbitPropagationWorker.js
 * 
 * Web Worker for satellite orbit propagation
 * Demonstrates maximum code reusability with shared classes
 */

import { OrbitPropagator } from '../core/OrbitPropagator.js';
import { WorkerMessageHandler } from '../../utils/WorkerMessageHandler.js';

// Create reusable components
const orbitPropagator = new OrbitPropagator({
    defaultTimeStep: 60,
    defaultPointsPerChunk: 100,
    enableSOITransitions: true,
    enableSolarSystemPropagation: false, // Can be overridden per propagation
    debugLogging: false
});

const messageHandler = new WorkerMessageHandler();

// Set up message handlers
messageHandler.onInitialize((data) => {
    const physicsState = {
        bodies: data.bodies || {},
        hierarchy: data.hierarchy || null,
        initialTime: data.currentTime || Date.now()
    };
    
    orbitPropagator.initialize(physicsState);
    
});

messageHandler.addHandler('propagate', async (data) => {
    if (orbitPropagator.isRunning) {
        throw new Error('Propagation already in progress');
    }
    
    await propagateOrbitUsingPropagator(data);
});

messageHandler.addHandler('cancel', () => {
    orbitPropagator.stop();
});

// Set up message listener
self.onmessage = (event) => messageHandler.handleMessage(event);

// Clean propagation function using reusable components
async function propagateOrbitUsingPropagator(params) {
    const { satelliteId } = params;
    
    
    // Use OrbitPropagator with progress callback
    await orbitPropagator.propagateOrbit(params, async (progressData) => {
        // Send chunk to main thread using message handler
        messageHandler.sendProgress('chunk', {
            satelliteId,
            points: progressData.points,
            soiTransitions: progressData.soiTransitions,
            progress: progressData.progress,
            isComplete: progressData.isComplete,
            finalSolarSystemState: progressData.finalSolarSystemState
        });
    });
    
    // Send completion message
    messageHandler.sendComplete({
        satelliteId,
        message: 'Orbit propagation completed using shared OrbitPropagator'
    });
}