import * as THREE from 'three';

/**
 * OrbitRenderer handles Three.js rendering and styling for orbit lines
 */
export class OrbitRenderer {
    constructor() {
        // Color scheme for different orbital levels
        this.orbitColors = {
            0: 0xFFFFFF,   // Heliocentric orbits (white)
            
            // Barycenter systems (used when moons orbit barycenters)
            3: 0x00FF00,   // Earth-Moon system (green)
            4: 0xFF4500,   // Mars system (orange-red)
            5: 0xFFA500,   // Jupiter system (orange)
            6: 0xFFD700,   // Saturn system (gold)
            7: 0x4FD0E7,   // Uranus system (cyan)
            8: 0x4169E1,   // Neptune system (royal blue)
            9: 0x8A2BE2,   // Pluto system (blue violet)
            
            // Planet systems (used when moons orbit planets directly)
            399: 0x00FF00, // Earth and its satellites (green)
            499: 0xFF4500, // Mars and its moons (orange-red)
            599: 0xFFA500, // Jupiter and its moons (orange)
            699: 0xFFD700, // Saturn and its moons (gold)
            799: 0x4FD0E7, // Uranus and its moons (cyan)
            899: 0x4169E1, // Neptune and its moons (royal blue)
            999: 0x8A2BE2, // Pluto (blue violet) - though moons orbit barycenter
            
            // Add more as needed for other systems
        };

        // Line styling configuration
        this.lineStyles = {
            heliocentric: {
                linewidth: 1,
                opacity: 0.8,
                dashed: false
            },
            subsystem: {
                linewidth: 1,
                opacity: 0.6,
                dashed: true,
                dashSize: 5,
                gapSize: 2
            }
        };
    }

    /**
     * Create orbit line with appropriate styling
     */
    createOrbitLine(points, parentNaif, bodyName) {
        if (!points || points.length === 0) {
            return null;
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Choose color and style based on orbital level
        const color = this.orbitColors[parentNaif] || 0xFFFFFF;
        const style = this.getLineStyle(parentNaif);

        // Create material based on style
        let material;
        if (style.dashed) {
            material = new THREE.LineDashedMaterial({
                color,
                transparent: true,
                opacity: style.opacity,
                linewidth: style.linewidth,
                dashSize: style.dashSize,
                gapSize: style.gapSize
            });
        } else {
            material = new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: style.opacity,
                linewidth: style.linewidth
            });
        }

        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        line.name = `orbit-${bodyName}`;

        // Compute line distances for dashed materials
        if (material.isDashed) {
            line.computeLineDistances();
        }

        return line;
    }

    /**
     * Get line style configuration for a parent NAIF ID
     */
    getLineStyle(parentNaif) {
        if (parentNaif === 0) {
            return this.lineStyles.heliocentric;
        } else {
            return this.lineStyles.subsystem;
        }
    }

    /**
     * Dispose of orbit line resources
     */
    disposeOrbitLine(line) {
        if (!line) return;

        // Remove from parent
        if (line.parent) {
            line.parent.remove(line);
        }

        // Dispose geometry
        if (line.geometry) {
            line.geometry.dispose();
        }

        // Dispose material
        if (line.material) {
            if (Array.isArray(line.material)) {
                line.material.forEach(mat => mat.dispose());
            } else {
                line.material.dispose();
            }
        }
    }

    /**
     * Update orbit visibility
     */
    setOrbitVisibility(line, visible) {
        if (line) {
            line.visible = visible;
        }
    }

    /**
     * Add custom color scheme
     */
    addColorScheme(parentNaif, color) {
        this.orbitColors[parentNaif] = color;
    }

    /**
     * Add custom line style
     */
    addLineStyle(styleKey, styleConfig) {
        this.lineStyles[styleKey] = styleConfig;
    }

    /**
     * Get debug information about rendered orbits
     */
    getDebugInfo(line) {
        if (!line) return null;

        return {
            name: line.name,
            visible: line.visible,
            points: line.geometry?.attributes?.position?.count || 0,
            material: line.material?.constructor?.name || 'unknown',
            color: line.material?.color?.getHex() || 0,
            opacity: line.material?.opacity || 1,
            dashed: line.material?.isDashed || false
        };
    }
} 