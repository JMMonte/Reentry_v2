// modernPhysicsWorker.js
// Modern physics worker using the new PhysicsEngine and OrbitPropagator
import { PhysicsEngine } from '../physics/PhysicsEngine.js';
import { OrbitPropagator } from '../physics/OrbitPropagator.js';

// Worker state
let physicsEngine = null;
let orbitPropagator = null;
let isInitialized = false;
let simulationInterval = null;
let lastSimTime = null;
let timeWarp = 1;
let updateRate = 30; // Hz

// Message handler
self.onmessage = async function (event) {
    console.log('[ModernPhysicsWorker] Received message:', event.data);
    let messageData;

    // Parse JSON if needed
    if (typeof event.data === 'string') {
        try {
            messageData = JSON.parse(event.data);
        } catch (error) {
            console.error('[ModernPhysicsWorker] Error parsing JSON:', error);
            return;
        }
    } else {
        messageData = event.data;
    }

    const { type, data } = messageData;

    try {
        switch (type) {
            case 'init':
                await initializePhysics(data);
                break;
            case 'addSatellite':
                addSatellite(data);
                break;
            case 'removeSatellite':
                removeSatellite(data.id);
                break;
            case 'setTimeWarp':
                setTimeWarp(data.value);
                break;
            case 'setTime':
                await physicsEngine.setTime(new Date(data.time));
                break;
            case 'step':
                await stepSimulation(data.deltaTime);
                break;
            case 'setIntegrator':
                setIntegrator(data.method);
                break;
            case 'generateTrajectory':
                await generateTrajectory(data);
                break;
            case 'generateOrbitPath':
                await generateOrbitPath(data);
                break;
            case 'getOrbitalElements':
                await getOrbitalElements(data);
                break;
            case 'setRelativisticCorrections':
                setRelativisticCorrections(data.enabled);
                break;
            case 'getSimulationState':
                getSimulationState();
                break;
            case 'cleanup':
                cleanup();
                break;
            case 'updateBodies':
                // Store the received bodies for use in physics calculations
                self.bodies = data.bodies;
                break;
            default:
                console.error('[ModernPhysicsWorker] Unknown message type:', type);
        }
    } catch (error) {
        console.error('[ModernPhysicsWorker] Error:', error, 'Message:', messageData);
        self.postMessage({
            type: 'error',
            data: {
                message: error.message,
                stack: error.stack,
                originalType: type
            }
        });
    }
};

/**
 * Initialize the physics engine
 */
async function initializePhysics(data) {
    try {
        physicsEngine = new PhysicsEngine();
        orbitPropagator = new OrbitPropagator();
        
        const initialTime = data.initialTime ? new Date(data.initialTime) : new Date();
        await physicsEngine.initialize(initialTime);
        
        // Add initial satellites if provided
        if (data.satellites && Array.isArray(data.satellites)) {
            for (const sat of data.satellites) {
                physicsEngine.addSatellite(sat);
            }
        }
        
        // Set configuration from data
        if (data.timeWarp) timeWarp = data.timeWarp;
        if (data.updateRate) updateRate = data.updateRate;
        if (data.integrator) physicsEngine.setIntegrator(data.integrator);
        if (data.relativistic) physicsEngine.setRelativisticCorrections(data.relativistic);
        
        isInitialized = true;
        
        // Start simulation loop
        startSimulationLoop();
        
        self.postMessage({
            type: 'initialized',
            data: {
                success: true,
                time: physicsEngine.simulationTime
            }
        });
        
    } catch (error) {
        self.postMessage({
            type: 'initialized',
            data: {
                success: false,
                error: error.message
            }
        });
    }
}

/**
 * Add a satellite to the simulation
 */
function addSatellite(satelliteData) {
    if (!isInitialized) {
        console.warn('[ModernPhysicsWorker] Cannot add satellite - not initialized');
        return;
    }
    
    physicsEngine.addSatellite(satelliteData);
    
    self.postMessage({
        type: 'satelliteAdded',
        data: { id: satelliteData.id }
    });
    
    // Send updated satellites list
    const satellites = physicsEngine.getSimulationState().satellites;
    self.postMessage({
        type: 'satellitesUpdate',
        data: Object.values(satellites)
    });
}

/**
 * Remove a satellite from the simulation
 */
function removeSatellite(satelliteId) {
    if (!isInitialized) return;
    
    const removed = physicsEngine.removeSatellite(satelliteId);
    
    self.postMessage({
        type: 'satelliteRemoved',
        data: { id: satelliteId, success: removed }
    });
    
    // Send updated satellites list
    const satellites = physicsEngine.getSimulationState().satellites;
    self.postMessage({
        type: 'satellitesUpdate',
        data: Object.values(satellites)
    });
}

/**
 * Set time warp factor
 */
function setTimeWarp(value) {
    timeWarp = value;
}

/**
 * Step the simulation forward
 */
async function stepSimulation(deltaTime) {
    if (!isInitialized) return;
    
    const state = await physicsEngine.step(deltaTime);
    
    self.postMessage({
        type: 'simulationStep',
        data: state
    });
}

/**
 * Set integration method
 */
function setIntegrator(method) {
    if (!isInitialized) return;
    
    physicsEngine.setIntegrator(method);
    
    self.postMessage({
        type: 'integratorSet',
        data: { method }
    });
}

/**
 * Generate trajectory for a satellite
 */
async function generateTrajectory(data) {
    if (!isInitialized) return;
    
    const { satelliteId, duration = 3600, timeStep = 60 } = data;
    const state = physicsEngine.getSimulationState();
    const satellite = state.satellites[satelliteId];
    
    if (!satellite) {
        self.postMessage({
            type: 'trajectoryGenerated',
            data: {
                satelliteId,
                success: false,
                error: 'Satellite not found'
            }
        });
        return;
    }
    
    const gravitationalBodies = Object.values(state.bodies);
    const trajectory = orbitPropagator.generateTrajectory(
        satellite,
        gravitationalBodies,
        duration,
        timeStep
    );
    
    self.postMessage({
        type: 'trajectoryGenerated',
        data: {
            satelliteId,
            success: true,
            trajectory: trajectory.map(pos => pos.toArray()),
            duration,
            timeStep
        }
    });
}

/**
 * Generate orbit path for a celestial body
 */
async function generateOrbitPath(data) {
    if (!isInitialized) return;
    
    const { bodyName, numPoints = 360 } = data;
    const state = physicsEngine.getSimulationState();
    
    // Find the body and its parent
    const body = findBodyByName(state.bodies, bodyName);
    const parent = findParentBody(state.bodies, body);
    
    if (!body || !parent) {
        self.postMessage({
            type: 'orbitPathGenerated',
            data: {
                bodyName,
                success: false,
                error: 'Body or parent not found'
            }
        });
        return;
    }
    
    const orbitPath = orbitPropagator.generateOrbitPath(body, parent, numPoints);
    
    self.postMessage({
        type: 'orbitPathGenerated',
        data: {
            bodyName,
            success: true,
            orbitPath: orbitPath.map(pos => pos.toArray()),
            numPoints
        }
    });
}

/**
 * Get orbital elements for a body
 */
async function getOrbitalElements(data) {
    if (!isInitialized) return;
    
    const { bodyName } = data;
    const state = physicsEngine.getSimulationState();
    
    const body = findBodyByName(state.bodies, bodyName);
    const parent = findParentBody(state.bodies, body);
    
    if (!body || !parent) {
        self.postMessage({
            type: 'orbitalElements',
            data: {
                bodyName,
                success: false,
                error: 'Body or parent not found'
            }
        });
        return;
    }
    
    const elements = orbitPropagator.calculateOrbitalElements(body, parent);
    
    self.postMessage({
        type: 'orbitalElements',
        data: {
            bodyName,
            success: true,
            elements
        }
    });
}

/**
 * Set relativistic corrections
 */
function setRelativisticCorrections(enabled) {
    if (!isInitialized) return;
    
    physicsEngine.setRelativisticCorrections(enabled);
    
    self.postMessage({
        type: 'relativisticCorrectionsSet',
        data: { enabled }
    });
}

/**
 * Get current simulation state
 */
function getSimulationState() {
    if (!isInitialized) return;
    
    const state = physicsEngine.getSimulationState();
    
    self.postMessage({
        type: 'simulationState',
        data: state
    });
}

/**
 * Start the simulation loop
 */
function startSimulationLoop() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
    }
    
    lastSimTime = Date.now();
    simulationInterval = setInterval(simulationLoop, 1000 / updateRate);
}

/**
 * Main simulation loop
 */
async function simulationLoop() {
    if (!isInitialized) return;
    
    const now = Date.now();
    const realDeltaTime = (now - lastSimTime) / 1000;
    lastSimTime = now;
    
    const warpedDeltaTime = realDeltaTime * timeWarp;
    
    if (warpedDeltaTime <= 0) return;
    
    try {
        const state = await physicsEngine.step(warpedDeltaTime);
        
        self.postMessage({
            type: 'simulationUpdate',
            data: {
                state,
                deltaTime: warpedDeltaTime,
                realDeltaTime
            }
        });
        
        // Always send satellitesUpdate after each simulation step
        const satellites = state.satellites;
        self.postMessage({
            type: 'satellitesUpdate',
            data: Object.values(satellites)
        });
        
    } catch (error) {
        console.error('[ModernPhysicsWorker] Error in simulation loop:', error);
    }
}

/**
 * Cleanup worker resources
 */
function cleanup() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    
    if (orbitPropagator) {
        orbitPropagator.clearCache();
    }
    
    physicsEngine = null;
    orbitPropagator = null;
    isInitialized = false;
    
    self.postMessage({
        type: 'cleanupComplete',
        data: { success: true }
    });
}

/**
 * Helper: Find body by name in state
 */
function findBodyByName(bodies, name) {
    for (const bodyState of Object.values(bodies)) {
        if (bodyState.name?.toLowerCase() === name.toLowerCase()) {
            return bodyState;
        }
    }
    return null;
}

/**
 * Helper: Find parent body for a given body
 */
function findParentBody(bodies, body) {
    if (!body) return null;
    
    // For now, default to Sun for planets
    // In a more complete implementation, this would use hierarchy data
    return findBodyByName(bodies, 'Sun');
}

// Handle worker termination
self.addEventListener('beforeunload', cleanup); 