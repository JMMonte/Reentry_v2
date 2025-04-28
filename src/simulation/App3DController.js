import App3D from '@/App3D.js';
import { setupExternalApi } from './externalApi.js';

/**
 * OOP controller for App3D lifecycle and orchestration.
 * Usage: const ctrl = new App3DController(initialState); ctrl.onReady(cb); ctrl.initialize();
 */
export class App3DController {
    constructor(initialState) {
        this.app3d = new App3D();
        // Ensure we clean up workers and resources on page refresh/unload
        window.addEventListener('beforeunload', () => {
            try {
                this.dispose();
            } catch (err) {
                console.error('Error disposing App3DController on unload', err);
            }
        });
        setupExternalApi(this.app3d);
        this.ready = false;
        this._readyCallbacks = [];
        this.app3d.onSceneReady = () => {
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
        await this.app3d.init();
        if (this._initialState) {
            try {
                this.app3d.importSimulationState(this._initialState);
                // Ensure camera follows the loaded focused body
                if (this._initialState.camera && typeof this._initialState.camera.focusedBody === 'string') {
                    this.app3d.updateSelectedBody(this._initialState.camera.focusedBody);
                }
            } catch (err) {
                console.error('Failed to import initial simulation state:', err);
            }
        } else {
            // No initial state: default to Earth
            this.app3d.updateSelectedBody('earth');
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
        if (this.app3d) this.app3d.dispose();
    }
} 