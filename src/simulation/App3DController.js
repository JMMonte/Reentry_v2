import App3D from '@/App3D.js';
import { setupExternalApi } from '../api/externalApi.js';

/**
 * OOP controller for App3D lifecycle and orchestration.
 * Usage: const ctrl = new App3DController(initialState); ctrl.onReady(cb); ctrl.initialize();
 */
export class App3DController {
    constructor(initialState) {
        // Use browser's current UTC time if no initial state is provided
        const simTime = initialState?.simulatedTime || new Date().toISOString();
        this.app3d = new App3D({ simulatedTime: simTime, satellitePhysicsSource: 'local' });
        // Ensure we clean up workers and resources on page refresh/unload
        this._beforeUnloadHandler = () => {
            try {
                this.dispose();
            } catch (err) {
                console.error('Error disposing App3DController on unload', err);
            }
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
        setupExternalApi(this.app3d);
        this.ready = false;
        this._readyCallbacks = [];
        this.app3d.onSceneReady = () => {
            console.log('[App3DController] Scene ready callback triggered!');
            this.ready = true;
            this._readyCallbacks.forEach(cb => cb());
            this._readyCallbacks = [];
        };
        this._initialState = initialState;
    }

    /**
     * Initialize the App3D instance (calls init()).
     */
    async initialize() {
        console.log('[App3DController] Starting App3D initialization...');
        try {
            await this.app3d.init();
            console.log('[App3DController] App3D.init() completed successfully');
        } catch (error) {
            console.error('[App3DController] App3D.init() failed:', error);
            throw error;
        }
        
        if (this._initialState) {
            try {
                this.app3d.importSimulationState(this._initialState);
                // Ensure camera follows the loaded focused body
                if (this._initialState.camera && typeof this._initialState.camera.focusedBody === 'string') {
                    this.app3d.updateSelectedBody(this._initialState.camera.focusedBody, true);
                }
            } catch (err) {
                console.error('Failed to import initial simulation state:', err);
            }
        } else {
            // No initial state: SmartCamera will default to Earth during scene initialization
            // No need to explicitly call updateSelectedBody here
        }
    }

    /**
     * Register a callback to be called when the scene is ready.
     * @param {Function} cb
     */
    onReady(cb) {
        if (this.ready) cb();
        else this._readyCallbacks.push(cb);
    }

    /**
     * Import satellites into the scene.
     * @param {Array} satellites
     */
    importSatellites(satellites) {
        if (!this.app3d || !satellites) return;
        satellites.forEach(sat => {
            if (typeof this.app3d.createSatellite === 'function') {
                this.app3d.createSatellite(sat);
            }
        });
    }

    /**
     * Dispose of the App3D instance.
     */
    dispose() {
        // Remove event listener to prevent memory leak
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
        if (this.app3d) this.app3d.dispose();
    }
} 