import * as THREE from 'three';

/**
 * CelestialOrbitRenderer - Pure Three.js rendering for celestial orbit lines
 * Handles visual styling and mesh management without any physics logic
 */
export class CelestialOrbitRenderer {
    constructor() {
        this.orbitMeshes = new Map(); // orbitId -> THREE.Line
        
        // Color schemes for different orbital systems
        this.colorSchemes = {
            // Heliocentric orbits (planets around Sun)
            0: 0x8899bb,   // SSB (neutral gray-blue)
            10: 0x8899bb,  // Sun (neutral gray-blue)
            
            // Barycenter systems
            3: 0x00FF00,   // Earth-Moon system (green)
            4: 0xFF4500,   // Mars system (orange-red)
            5: 0xFFA500,   // Jupiter system (orange)
            6: 0xFFD700,   // Saturn system (gold)
            7: 0x4FD0E7,   // Uranus system (cyan)
            8: 0x4169E1,   // Neptune system (royal blue)
            9: 0x8A2BE2,   // Pluto system (blue violet)
            
            // Planet systems (for direct planet-moon orbits)
            399: 0x00FF00, // Earth system (green)
            499: 0xFF4500, // Mars system (orange-red)
            599: 0xFFA500, // Jupiter system (orange)
            699: 0xFFD700, // Saturn system (gold)
            799: 0x4FD0E7, // Uranus system (cyan)
            899: 0x4169E1, // Neptune system (royal blue)
            999: 0x8A2BE2, // Pluto system (blue violet)
        };
        
        // Line styles
        this.lineStyles = {
            heliocentric: {
                opacity: 0.8,
                linewidth: 1,
                dashed: false
            },
            subsystem: {
                opacity: 0.6,
                linewidth: 1,
                dashed: true,
                dashSize: 5,
                gapSize: 2
            }
        };
    }
    
    /**
     * Create orbit mesh for a celestial orbit
     */
    createOrbitMesh(orbit, parentGroup, bodyName, bodyConfig = {}) {
        if (orbit.points.length < 2) {
            console.warn(`[CelestialOrbitRenderer] Not enough points for ${bodyName}: ${orbit.points.length}`);
            return null;
        }
        
        // Validate points for NaN values before creating geometry
        const validPoints = orbit.points.filter(point => {
            const isValid = !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z);
            if (!isValid) {
                console.error(`[CelestialOrbitRenderer] Filtered out NaN point in ${bodyName} orbit:`, point);
            }
            return isValid;
        });
        
        if (validPoints.length < 2) {
            console.error(`[CelestialOrbitRenderer] Not enough valid points for ${bodyName} after NaN filtering: ${validPoints.length}/${orbit.points.length}`);
            return null;
        }
        
        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setFromPoints(validPoints);
        
        // Create material based on orbit type and parent
        const material = this.createMaterial(orbit, bodyConfig);
        
        // Create line mesh
        const line = new THREE.Line(geometry, material);
        line.name = `orbit_${bodyName}_${orbit.id}`;
        line.frustumCulled = false;
        
        // Compute line distances for dashed lines
        if (material.isDashedLineMaterial) {
            line.computeLineDistances();
        }
        
        // Add to parent group
        parentGroup.add(line);
        
        // Store reference
        this.orbitMeshes.set(orbit.id, line);
        
        return line;
    }
    
    /**
     * Update existing orbit mesh with new points
     */
    updateOrbitMesh(orbit) {
        const mesh = this.orbitMeshes.get(orbit.id);
        if (!mesh) return false;
        
        if (orbit.points.length < 2) {
            console.warn(`[CelestialOrbitRenderer] Not enough points to update orbit ${orbit.id}`);
            return false;
        }
        
        // Validate points for NaN values before updating geometry
        const validPoints = orbit.points.filter(point => {
            const isValid = !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z);
            if (!isValid) {
                console.error(`[CelestialOrbitRenderer] Filtered out NaN point in orbit update ${orbit.id}:`, point);
            }
            return isValid;
        });
        
        if (validPoints.length < 2) {
            console.error(`[CelestialOrbitRenderer] Not enough valid points to update orbit ${orbit.id} after NaN filtering: ${validPoints.length}/${orbit.points.length}`);
            return false;
        }
        
        // Update geometry
        mesh.geometry.setFromPoints(validPoints);
        mesh.geometry.attributes.position.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
        
        // Recompute line distances for dashed lines
        if (mesh.material.isDashedLineMaterial) {
            mesh.computeLineDistances();
        }
        
        return true;
    }
    
    /**
     * Create material for orbit line based on type and configuration
     */
    createMaterial(orbit, bodyConfig = {}) {
        const { parentId, bodyId } = orbit;
        
        // Determine orbit style
        const style = this.getOrbitStyle(parentId, bodyId, bodyConfig);
        
        // Get color
        const color = this.getOrbitColor(parentId, bodyConfig);
        
        // Create appropriate material
        if (style.dashed) {
            return new THREE.LineDashedMaterial({
                color: color,
                opacity: style.opacity,
                transparent: true,
                dashSize: style.dashSize || 5,
                gapSize: style.gapSize || 2,
                linewidth: style.linewidth || 1
            });
        } else {
            return new THREE.LineBasicMaterial({
                color: color,
                opacity: style.opacity,
                transparent: true,
                linewidth: style.linewidth || 1
            });
        }
    }
    
    /**
     * Determine orbit style based on parent and body type (data-driven)
     */
    getOrbitStyle(parentId, bodyId, bodyConfig = {}) {
        // Check for custom orbit style in config
        if (bodyConfig.orbitVisualization?.style) {
            const styleName = bodyConfig.orbitVisualization.style;
            return this.lineStyles[styleName] || this.lineStyles.subsystem;
        }
        
        // Heliocentric orbits (around Sun/SSB)
        if (parentId === 0 || parentId === 10) {
            const baseStyle = this.lineStyles.heliocentric;
            return this.applyDwarfOpacity(baseStyle, bodyConfig);
        }
        
        // Default to subsystem style
        const baseStyle = this.lineStyles.subsystem;
        return this.applyDwarfOpacity(baseStyle, bodyConfig);
    }
    
    /**
     * Apply reduced opacity for dwarf planets
     */
    applyDwarfOpacity(style, bodyConfig) {
        const isDwarf = bodyConfig.type === 'dwarf_planet' || bodyConfig.isDwarf === true;
        if (isDwarf) {
            return {
                ...style,
                opacity: style.opacity * 0.2
            };
        }
        return style;
    }
    
    /**
     * Get color for orbit based on parent system
     */
    getOrbitColor(parentId, bodyConfig = {}) {
        // Check for custom color in body config
        if (bodyConfig.orbitColor) {
            return bodyConfig.orbitColor;
        }
        
        // Use system color scheme
        return this.colorSchemes[parentId] || 0xFFFFFF; // Default to white
    }
    
    /**
     * Set visibility of orbit mesh
     */
    setOrbitVisibility(orbit, visible) {
        const mesh = this.orbitMeshes.get(orbit.id);
        if (mesh) {
            mesh.visible = visible;
        }
    }
    
    /**
     * Remove and dispose orbit mesh
     */
    disposeOrbitMesh(orbit) {
        const mesh = this.orbitMeshes.get(orbit.id);
        if (!mesh) return;
        
        // Remove from parent
        if (mesh.parent) {
            mesh.parent.remove(mesh);
        }
        
        // Dispose resources
        mesh.geometry.dispose();
        mesh.material.dispose();
        
        // Remove from map
        this.orbitMeshes.delete(orbit.id);
    }
    
    /**
     * Add custom color scheme for a parent body
     */
    addColorScheme(parentId, color) {
        this.colorSchemes[parentId] = color;
    }
    
    /**
     * Get debug info for orbit mesh
     */
    getDebugInfo(orbit) {
        const mesh = this.orbitMeshes.get(orbit.id);
        if (!mesh) return null;
        
        return {
            points: orbit.points.length,
            visible: mesh.visible,
            color: mesh.material.color.getHex(),
            opacity: mesh.material.opacity,
            dashed: mesh.material.isDashedLineMaterial || false
        };
    }
    
    /**
     * Update all orbit visibilities
     */
    setAllVisible(visible) {
        this.orbitMeshes.forEach(mesh => {
            mesh.visible = visible;
        });
    }
    
    /**
     * Dispose all orbit meshes
     */
    disposeAll() {
        this.orbitMeshes.forEach(mesh => {
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.orbitMeshes.clear();
    }
}