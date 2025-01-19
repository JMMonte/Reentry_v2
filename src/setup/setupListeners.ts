import { Socket } from 'socket.io-client';
import { SATELLITE_METHODS } from '../config/satelliteCreationMethods';
import { DisplayManager } from '../managers/DisplayManager';
import { SatelliteManager } from '../managers/SatelliteManager';
import Stats from 'stats.js';

interface App3D {
    onWindowResize: () => void;
    stats: Stats;
    displayManager: DisplayManager;
    satelliteManager: SatelliteManager;
    updateTimeWarp: (value: number) => void;
    updateSelectedBody: (body: string) => void;
    cameraControls?: {
        clearCameraTarget: () => void;
    };
}

interface DisplaySettingEvent extends CustomEvent {
    detail: {
        key: string;
        value: boolean | number | string;
    };
}

interface TimeWarpEvent extends CustomEvent {
    detail: {
        value: number;
    };
}

interface BodySelectedEvent extends CustomEvent {
    detail: {
        body: string;
    };
}

interface SatelliteMethodConfig {
    eventName: string;
    [key: string]: any;
}

declare module '../managers/DisplayManager' {
    interface DisplayManager {
        updateSetting(key: string, value: boolean | number | string): void;
        getSettings(): Record<string, any>;
    }
}

declare module '../managers/SatelliteManager' {
    interface SatelliteManager {
        [key: string]: (detail: any) => void;
    }
}

export function setupEventListeners(app: App3D): void {
    window.addEventListener('resize', app.onWindowResize.bind(app));
    document.body.appendChild(app.stats.dom);

    document.addEventListener('updateDisplaySetting', ((event: DisplaySettingEvent) => {
        console.log('App: Received updateDisplaySetting event', event.detail);
        const { key, value } = event.detail;
        app.displayManager.updateSetting(key, value);
    }) as EventListener);

    document.addEventListener('getDisplaySettings', () => {
        console.log('App: Received getDisplaySettings event');
        const currentSettings = app.displayManager.getSettings();
        console.log('App: Sending current settings', currentSettings);
        document.dispatchEvent(new CustomEvent('displaySettingsResponse', {
            detail: currentSettings
        }));
    });

    // Setup satellite creation events
    Object.entries(SATELLITE_METHODS).forEach(([method, config]: [string, SatelliteMethodConfig]) => {
        document.addEventListener(config.eventName, ((event: CustomEvent) => {
            app.satelliteManager[method](event.detail);
        }) as EventListener);
    });

    document.addEventListener('updateTimeWarp', ((event: TimeWarpEvent) => {
        app.updateTimeWarp(event.detail.value);
    }) as EventListener);

    document.addEventListener('bodySelected', ((event: BodySelectedEvent) => {
        app.updateSelectedBody(event.detail.body);
    }) as EventListener);

    // Add any event listeners that don't belong to specific managers
    window.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            app.cameraControls?.clearCameraTarget();
        }
    });
}

export function setupSocketListeners(app: App3D, socket: Socket | null): void {
    if (!socket) {
        console.warn('Socket not initialized');
        return;
    }

    // Add any socket listeners that don't belong to specific managers
    socket.on('updateTimeWarp', (value: number) => {
        app.updateTimeWarp(value);
    });

    socket.on('updateSelectedBody', (value: string) => {
        app.updateSelectedBody(value);
    });
} 