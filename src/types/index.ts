import * as THREE from 'three';

// Event Types
export interface CustomEvent extends Event {
    detail: any;
}

// Three.js related types
export interface SceneObject {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    visible: boolean;
    parent: THREE.Object3D | null;
}

// Manager Types
export interface Manager {
    initialize(): Promise<void> | void;
    dispose(): void;
}

// Satellite Types
export interface SatelliteData {
    id: number;
    name: string;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    mass: number;
    model?: string;
    [key: string]: any;
}

// Display Settings Types
export interface DisplaySetting {
    value: boolean | number | string;
    label: string;
    type: 'boolean' | 'number' | 'string';
    category: string;
}

export interface DisplaySettings {
    [key: string]: DisplaySetting;
}

// Time Types
export interface TimeState {
    simulatedTime: Date;
    timeWarp: number;
    isPaused: boolean;
} 