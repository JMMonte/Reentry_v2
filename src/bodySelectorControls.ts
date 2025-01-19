import { Object3D } from 'three';

interface CameraControls {
    clearCameraTarget: () => void;
    updateCameraTarget: (target: Object3D) => void;
}

interface Satellite extends Object3D {
    id: number;
}

interface Earth extends Object3D {}
interface Moon extends Object3D {}

interface App3D {
    cameraControls: CameraControls;
    earth: Earth;
    moon: Moon;
    satellites: Record<string, Satellite>;
}

interface BodySelectedEvent extends CustomEvent {
    detail: {
        body: string;
    };
}

interface SatelliteListUpdatedEvent extends CustomEvent {
    detail: {
        satellites: Record<string, Satellite>;
    };
}

interface BodyOption {
    value: string;
    text: string;
}

interface UpdateBodyOptionsEvent extends CustomEvent {
    detail: {
        satellites: BodyOption[];
    };
}

export function initializeBodySelector(app: App3D): void {
    // Instead of manipulating the DOM directly, we'll use the app's event system
    // to communicate with the React components
    
    document.addEventListener('bodySelected', ((event: BodySelectedEvent) => {
        const value = event.detail.body;
        if (value === 'none') {
            app.cameraControls.clearCameraTarget();
        } else if (value === 'earth') {
            app.cameraControls.updateCameraTarget(app.earth);
        } else if (value === 'moon') {
            app.cameraControls.updateCameraTarget(app.moon);
        } else {
            // Handle satellite selection (value is the satellite ID)
            const satellite = app.satellites[value];
            if (satellite) {
                app.cameraControls.updateCameraTarget(satellite);
            }
        }
    }) as EventListener);

    // Listen for satellite changes to update the UI
    document.addEventListener('satelliteListUpdated', ((event: SatelliteListUpdatedEvent) => {
        if (event.detail?.satellites) {
            document.dispatchEvent(new CustomEvent<UpdateBodyOptionsEvent['detail']>('updateBodyOptions', {
                detail: {
                    satellites: Object.values(event.detail.satellites).map(s => ({
                        value: s.id.toString(),
                        text: s.name || `Satellite ${s.id}`
                    }))
                }
            }));
        }
    }) as EventListener);
} 