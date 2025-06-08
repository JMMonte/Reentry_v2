import * as THREE from 'three';

/**
 * MemoryMonitor - Development tool for tracking memory usage
 * Provides real-time memory statistics and leak detection
 */
export class MemoryMonitor {
    constructor(options = {}) {
        this.enabled = options.enabled ?? (import.meta.env.MODE === 'development');
        this.interval = options.interval || 5000; // Check every 5 seconds
        this.warnThreshold = options.warnThreshold || 1000; // MB (1GB)
        this.criticalThreshold = options.criticalThreshold || 2000; // MB (2GB)
        
        this.samples = [];
        this.maxSamples = 60; // Keep 5 minutes of history
        this.intervalId = null;
        
        // Track specific resources
        this.trackedResources = {
            planets: new WeakMap(),
            satellites: new WeakMap(),
            textures: new WeakMap(),
            geometries: new WeakMap(),
            materials: new WeakMap()
        };
        
        this.resourceCounts = {
            planets: 0,
            satellites: 0,
            textures: 0,
            geometries: 0,
            materials: 0
        };
    }
    
    /**
     * Start monitoring memory
     */
    start() {
        if (!this.enabled || this.intervalId) return;
        
        console.log('[MemoryMonitor] Starting memory monitoring...');
        
        // Take initial sample
        this.takeSample();
        
        // Start periodic monitoring
        this.intervalId = setInterval(() => {
            this.takeSample();
            this.checkForLeaks();
        }, this.interval);
        
        // Add to window for debugging
        if (typeof window !== 'undefined') {
            window.__memoryMonitor = this;
        }
    }
    
    /**
     * Stop monitoring
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('[MemoryMonitor] Stopped memory monitoring');
    }
    
    /**
     * Take a memory sample
     */
    takeSample() {
        const sample = {
            timestamp: Date.now(),
            memory: this.getMemoryUsage(),
            resources: { ...this.resourceCounts }
        };
        
        this.samples.push(sample);
        
        // Keep only recent samples
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }
        
        // Check thresholds
        if (sample.memory.heapUsed > this.criticalThreshold) {
            console.error(`[MemoryMonitor] CRITICAL: Memory usage ${sample.memory.heapUsed.toFixed(2)}MB exceeds critical threshold ${this.criticalThreshold}MB`);
        } else if (sample.memory.heapUsed > this.warnThreshold) {
            console.warn(`[MemoryMonitor] WARNING: Memory usage ${sample.memory.heapUsed.toFixed(2)}MB exceeds warning threshold ${this.warnThreshold}MB`);
        }
    }
    
    /**
     * Get current memory usage
     */
    getMemoryUsage() {
        if (performance.memory) {
            // Chrome provides memory info
            return {
                heapUsed: performance.memory.usedJSHeapSize / 1048576, // Convert to MB
                heapTotal: performance.memory.totalJSHeapSize / 1048576,
                heapLimit: performance.memory.jsHeapSizeLimit / 1048576
            };
        } else {
            // Fallback for other browsers
            return {
                heapUsed: 0,
                heapTotal: 0,
                heapLimit: 0
            };
        }
    }
    
    /**
     * Track a resource
     */
    trackResource(type, resource, metadata = {}) {
        if (!this.trackedResources[type]) {
            console.warn(`[MemoryMonitor] Unknown resource type: ${type}`);
            return;
        }
        
        this.trackedResources[type].set(resource, {
            addedAt: Date.now(),
            ...metadata
        });
        
        this.resourceCounts[type]++;
    }
    
    /**
     * Untrack a resource
     */
    untrackResource(type, resource) {
        if (!this.trackedResources[type]) return;
        
        if (this.trackedResources[type].has(resource)) {
            this.trackedResources[type].delete(resource);
            this.resourceCounts[type] = Math.max(0, this.resourceCounts[type] - 1);
        }
    }
    
    /**
     * Check for potential memory leaks
     */
    checkForLeaks() {
        if (this.samples.length < 10) return; // Need enough samples
        
        // Calculate memory growth rate
        const recentSamples = this.samples.slice(-10);
        const firstSample = recentSamples[0];
        const lastSample = recentSamples[recentSamples.length - 1];
        
        const memoryGrowth = lastSample.memory.heapUsed - firstSample.memory.heapUsed;
        const timeElapsed = (lastSample.timestamp - firstSample.timestamp) / 1000; // seconds
        const growthRate = memoryGrowth / timeElapsed; // MB/s
        
        // Warn if memory is growing too fast
        if (growthRate > 0.5) { // 0.5 MB/s is concerning
            console.warn(`[MemoryMonitor] Potential memory leak detected! Growth rate: ${growthRate.toFixed(2)}MB/s`);
            this.reportLeakDetails();
        }
    }
    
    /**
     * Report detailed leak information
     */
    reportLeakDetails() {
        console.group('[MemoryMonitor] Resource counts:');
        Object.entries(this.resourceCounts).forEach(([type, count]) => {
            console.log(`${type}: ${count}`);
        });
        console.groupEnd();
        
        // Check Three.js specific resources
        if (typeof THREE !== 'undefined' && THREE.WebGLRenderer) {
            console.group('[MemoryMonitor] Three.js memory info:');
            const info = this.getThreeMemoryInfo();
            console.table(info);
            console.groupEnd();
        }
    }
    
    /**
     * Get Three.js memory information
     */
    getThreeMemoryInfo() {
        // This requires access to the renderer
        const renderer = window.app3d?.renderer;
        if (!renderer) return {};
        
        const info = renderer.info;
        return {
            geometries: info.memory.geometries,
            textures: info.memory.textures,
            renderCalls: info.render.calls,
            triangles: info.render.triangles,
            points: info.render.points,
            lines: info.render.lines
        };
    }
    
    /**
     * Generate memory report
     */
    generateReport() {
        const report = {
            currentMemory: this.getMemoryUsage(),
            resourceCounts: { ...this.resourceCounts },
            samples: this.samples.slice(-20), // Last 20 samples
            threeJsInfo: this.getThreeMemoryInfo()
        };
        
        // Calculate statistics
        if (this.samples.length > 0) {
            const memoryValues = this.samples.map(s => s.memory.heapUsed);
            report.statistics = {
                min: Math.min(...memoryValues),
                max: Math.max(...memoryValues),
                average: memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length,
                current: memoryValues[memoryValues.length - 1]
            };
        }
        
        return report;
    }
    
    /**
     * Create visual overlay for memory stats
     */
    createOverlay() {
        if (typeof document === 'undefined') return;
        
        const overlay = document.createElement('div');
        overlay.id = 'memory-monitor-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px;
            font-family: monospace;
            font-size: 12px;
            z-index: 10001;
            border-radius: 5px;
            min-width: 200px;
        `;
        
        document.body.appendChild(overlay);
        
        // Update overlay periodically
        setInterval(() => {
            if (!document.getElementById('memory-monitor-overlay')) return;
            
            const memory = this.getMemoryUsage();
            const info = this.getThreeMemoryInfo();
            
            overlay.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 5px;">Memory Monitor</div>
                <div>Heap: ${memory.heapUsed.toFixed(1)}MB / ${memory.heapTotal.toFixed(1)}MB</div>
                <div style="margin-top: 5px; border-top: 1px solid #666; padding-top: 5px;">
                    <div>Planets: ${this.resourceCounts.planets}</div>
                    <div>Satellites: ${this.resourceCounts.satellites}</div>
                    <div>Geometries: ${info.geometries || 0}</div>
                    <div>Textures: ${info.textures || 0}</div>
                </div>
            `;
        }, 1000);
    }
    
    /**
     * Export memory data for analysis
     */
    exportData() {
        const data = this.generateReport();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `memory-report-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
}

// Singleton instance
let _instance = null;

/**
 * Get or create memory monitor instance
 */
export function getMemoryMonitor(options) {
    if (!_instance) {
        _instance = new MemoryMonitor(options);
    }
    return _instance;
}

/**
 * Integration helper for App3D
 */
export function setupMemoryMonitoring(app3d, options = {}) {
    const monitor = getMemoryMonitor({
        enabled: options.enabled ?? true,
        ...options
    });
    
    // Start monitoring
    monitor.start();
    
    // Create visual overlay if requested
    if (options.showOverlay) {
        monitor.createOverlay();
    }
    
    // Hook into planet creation/disposal
    const originalCreatePlanet = app3d.constructor.prototype.createPlanet;
    if (originalCreatePlanet) {
        app3d.constructor.prototype.createPlanet = function(...args) {
            const planet = originalCreatePlanet.apply(this, args);
            monitor.trackResource('planets', planet, { name: planet.name });
            return planet;
        };
    }
    
    return monitor;
}