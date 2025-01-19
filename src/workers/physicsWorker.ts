import * as CANNON from 'cannon-es';
import { Constants } from '../utils/Constants';

// Type definitions
interface Vector3Like {
    x: number;
    y: number;
    z: number;
}

interface Satellite {
    id: number;
    mass: number;
    size: number;
    position: number[];
    velocity: number[];
}

interface PhysicsData {
    realDeltaTime: number;
    earthPosition: Vector3Like;
    earthRadius: number;
    moonPosition: Vector3Like;
    timeWarp: number;
}

interface SatelliteData {
    id: number;
    mass: number;
    size: number;
    position: Vector3Like | number[];
    velocity: Vector3Like | number[];
}

interface PrecisionData {
    timeStep?: number;
    precision?: 'low' | 'medium' | 'high';
}

// Message types
type WorkerMessage = 
    | { type: 'init'; data: typeof Constants }
    | { type: 'step'; data: PhysicsData }
    | { type: 'addSatellite'; data: SatelliteData }
    | { type: 'removeSatellite'; data: { id: number } }
    | { type: 'setPrecision'; data: PrecisionData };

type WorkerResponse = 
    | { type: 'initialized' }
    | { type: 'satelliteUpdate'; data: { id: number; position: number[]; velocity: number[] } }
    | { type: 'satelliteAdded'; data: { id: number } };

let world: CANNON.World | null = null;
let satellites: Satellite[] = [];
let manuallyManagedSatellites: Satellite[] = [];
let timeStep = 0.01;
let precision: 'low' | 'medium' | 'high' = 'high';

self.onmessage = function (event: MessageEvent<string | WorkerMessage>): void {
    let messageData: WorkerMessage;

    if (typeof event.data === 'string') {
        try {
            messageData = JSON.parse(event.data);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return;
        }
    } else {
        messageData = event.data;
    }

    const { type, data } = messageData;

    switch (type) {
        case 'init':
            initPhysics(data);
            break;
        case 'step':
            if (world) {
                stepPhysics(data);
            } else {
                console.error('Physics world is not initialized. Please send an "init" message first.');
            }
            break;
        case 'addSatellite':  
            addSatellite(data);
            break;
        case 'removeSatellite':
            removeSatellite(data.id);
            break;
        case 'setPrecision':
            setPrecision(data);
            break;
        default:
            console.error('Unknown message type:', type);
    }
};

function initPhysics(data: typeof Constants): void {
    world = new CANNON.World();
    world.gravity.set(0, 0, 0);
    Object.assign(Constants, data);
    satellites = [];
    
    const response: WorkerResponse = {
        type: 'initialized'
    };
    self.postMessage(response);
}

function stepPhysics(data: PhysicsData): void {
    const { realDeltaTime, earthPosition, earthRadius, moonPosition, timeWarp } = data;
    const warpedDeltaTime = realDeltaTime * timeWarp;

    if (warpedDeltaTime <= 0 || satellites.length === 0) {
        return;
    }

    // Cap the maximum time step to prevent instability, but subdivide into smaller steps for high time warps
    const maxTimeStep = 1.0; // 1 second
    const numSteps = Math.ceil(warpedDeltaTime / maxTimeStep);
    const subTimeStep = warpedDeltaTime / numSteps;

    // Run multiple smaller steps to maintain accuracy
    for (let i = 0; i < numSteps; i++) {
        satellites.forEach(satellite => {
            // Calculate gravitational forces
            const satPos = satellite.position;
            
            // Convert Earth and Moon positions from scaled km to meters
            const earthPosMeters: Vector3Like = {
                x: earthPosition.x / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters,
                y: earthPosition.y / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters,
                z: earthPosition.z / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters
            };

            const moonPosMeters: Vector3Like = {
                x: moonPosition.x / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters,
                y: moonPosition.y / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters,
                z: moonPosition.z / (Constants.metersToKm * Constants.scale) * Constants.kmToMeters
            };
            
            // Force from Earth (all calculations in meters)
            const earthForce = calculateGravitationalForce(
                satellite.mass,
                Constants.earthMass,
                satPos,
                earthPosMeters
            );

            // Force from Moon (all calculations in meters)
            const moonForce = calculateGravitationalForce(
                satellite.mass,
                Constants.moonMass,
                satPos,
                moonPosMeters
            );

            // Total acceleration (F = ma, so a = F/m) in m/s²
            const totalAccel: Vector3Like = {
                x: (earthForce.x + moonForce.x) / satellite.mass,
                y: (earthForce.y + moonForce.y) / satellite.mass,
                z: (earthForce.z + moonForce.z) / satellite.mass
            };

            // Update velocity (a * dt) in m/s
            satellite.velocity[0] += totalAccel.x * subTimeStep;
            satellite.velocity[1] += totalAccel.y * subTimeStep;
            satellite.velocity[2] += totalAccel.z * subTimeStep;

            // Update position (v * dt) in meters
            satellite.position[0] += satellite.velocity[0] * subTimeStep;
            satellite.position[1] += satellite.velocity[1] * subTimeStep;
            satellite.position[2] += satellite.velocity[2] * subTimeStep;

            // Send update to main thread (positions and velocities in meters)
            const response: WorkerResponse = {
                type: 'satelliteUpdate',
                data: {
                    id: satellite.id,
                    position: satellite.position,
                    velocity: satellite.velocity
                }
            };
            self.postMessage(response);
        });
    }
}

function addSatellite(data: SatelliteData): void {
    const { id, mass, size, position, velocity } = data;
    
    // Convert position and velocity to arrays if they're not already
    const posArray = Array.isArray(position) ? position : 
                    'toArray' in position ? (position as any).toArray() : 
                    [position.x, position.y, position.z];
                    
    const velArray = Array.isArray(velocity) ? velocity :
                    'toArray' in velocity ? (velocity as any).toArray() :
                    [velocity.x, velocity.y, velocity.z];
    
    // Create satellite object
    const satellite: Satellite = {
        id,
        mass,
        size,
        position: posArray,
        velocity: velArray
    };
    
    satellites.push(satellite);

    // Send confirmation
    const response: WorkerResponse = {
        type: 'satelliteAdded',
        data: { id }
    };
    self.postMessage(response);
}

function calculateGravitationalForce(
    mass1: number,
    mass2: number,
    pos1: number[],
    pos2: Vector3Like
): Vector3Like {
    const dx = pos2.x - pos1[0];
    const dy = pos2.y - pos1[1];
    const dz = pos2.z - pos1[2];
    
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const forceMagnitude = (Constants.G * mass1 * mass2) / (distance * distance);
    
    // Unit vector components
    const ux = dx / distance;
    const uy = dy / distance;
    const uz = dz / distance;
    
    return {
        x: forceMagnitude * ux,
        y: forceMagnitude * uy,
        z: forceMagnitude * uz
    };
}

function setPrecision(data: PrecisionData): void {
    timeStep = data.timeStep || 0.01;
    precision = data.precision || 'high';
}

function removeSatellite(id: number): void {
    const index = satellites.findIndex(sat => sat.id === id);
    if (index !== -1) {
        satellites.splice(index, 1);
    }

    // Also remove from manually managed satellites if it exists there
    const managedIndex = manuallyManagedSatellites.findIndex(sat => sat.id === id);
    if (managedIndex !== -1) {
        manuallyManagedSatellites.splice(managedIndex, 1);
    }
}

// Add type declaration for the worker scope
declare const self: DedicatedWorkerGlobalScope; 