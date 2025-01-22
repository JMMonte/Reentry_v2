import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Constants } from '../utils/Constants';
import { OrbitalRegimes } from '../config/OrbitalRegimes';

interface Label extends CSS2DObject {
    element: HTMLDivElement;
}

export class RadialGrid {
    private scene: THREE.Scene;
    private group: THREE.Group;
    private labels: Label[];

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'radialGrid';
        this.scene.add(this.group);
        this.labels = [];  // Store labels so we don't recreate them
        
        this.createGrid();
        this.createLabels();
    }

    private createGrid(): void {
        // Clear existing grid and labels
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if ((child as THREE.Line).material) {
                ((child as THREE.Line).material as THREE.Material).dispose();
            }
            if ((child as THREE.Line).geometry) {
                (child as THREE.Line).geometry.dispose();
            }
        }
        this.labels.forEach(label => {
            if (label.element && label.element.parentNode) {
                label.element.parentNode.removeChild(label.element);
            }
        });
        this.labels = [];

        // Create circles for each orbital regime
        const material = new THREE.LineBasicMaterial({ 
            color: 0x888888,  // Lighter gray
            transparent: true,
            opacity: 0.6      // Increased opacity
        });

        // Add Earth radius reference circle
        this.createCircle(Constants.earthRadius, material);

        // LEO circles (add Earth radius since orbits are from surface)
        this.createCircle(Constants.earthRadius + OrbitalRegimes.LEO.min, material);
        this.createCircle(Constants.earthRadius + OrbitalRegimes.LEO.max, material);

        // MEO circles
        this.createCircle(Constants.earthRadius + OrbitalRegimes.MEO.min, material);
        this.createCircle(Constants.earthRadius + OrbitalRegimes.MEO.max, material);

        // GEO circle
        this.createCircle(Constants.earthRadius + OrbitalRegimes.GEO.altitude, material);

        // HEO indicators (we'll use dashed lines for this)
        const heoMaterial = new THREE.LineDashedMaterial({
            color: 0x888888,  // Lighter gray
            dashSize: 500 * Constants.scale,
            gapSize: 300 * Constants.scale,
            transparent: true,
            opacity: 0.6      // Increased opacity
        });

        this.createCircle(Constants.earthRadius + OrbitalRegimes.HEO.perigee, heoMaterial, true);
        this.createCircle(Constants.earthRadius + OrbitalRegimes.HEO.apogee, heoMaterial, true);

        // Intermediate radial markers
        const markerMaterial = new THREE.LineBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.2  // More transparent
        });

        // Create markers every 50,000 km up to lunar orbit
        const markerStep = 50000 * Constants.kmToMeters;  // 50,000 km in meters
        for (let r = Constants.earthRadius + markerStep; r <= Constants.earthRadius + Constants.moonOrbitRadius; r += markerStep) {
            this.createCircle(r, markerMaterial);
            // Add label for round numbers
            if (((r - Constants.earthRadius) / Constants.kmToMeters) % 100000 === 0) {
                this.createLabel(`${((r - Constants.earthRadius) / Constants.kmToMeters).toFixed(0)}k km`, r);
            }
        }

        // Lunar orbit (average distance)
        const lunarMaterial = new THREE.LineDashedMaterial({
            color: 0x888888,
            dashSize: 1000 * Constants.scale,
            gapSize: 500 * Constants.scale,
            transparent: true,
            opacity: 0.4
        });
        this.createCircle(Constants.earthRadius + Constants.moonOrbitRadius, lunarMaterial, true);

        // SOI and Hill sphere
        const sphereMaterial = new THREE.LineDashedMaterial({
            color: 0x888888,
            dashSize: 2000 * Constants.scale,
            gapSize: 1000 * Constants.scale,
            transparent: true,
            opacity: 0.3
        });
        this.createCircle(Constants.earthRadius + Constants.earthSOI, sphereMaterial, true);
        this.createCircle(Constants.earthRadius + Constants.earthHillSphere, sphereMaterial, true);

        // Create radial lines with increased opacity
        const radialCount = 12; // One line every 30 degrees
        for (let i = 0; i < radialCount; i++) {
            const angle = (i / radialCount) * Math.PI * 2;
            const maxRadius = (Constants.earthRadius + Constants.earthHillSphere) * Constants.metersToKm * Constants.scale;
            
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(
                    Math.cos(angle) * maxRadius,
                    0,
                    Math.sin(angle) * maxRadius
                )
            ]);
            
            const line = new THREE.Line(geometry, material);
            this.group.add(line);
        }
    }

    private createCircle(radius: number, material: THREE.LineBasicMaterial | THREE.LineDashedMaterial, isDashed = false): void {
        // Convert from meters to simulation units (scaled km)
        const scaledRadius = (radius * Constants.metersToKm * Constants.scale);
        const segments = 128; // Increased segment count for smoother circles
        const circleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array((segments + 1) * 3);

        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            positions[i * 3] = Math.cos(angle) * scaledRadius;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = Math.sin(angle) * scaledRadius;
        }

        circleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const circle = new THREE.Line(circleGeometry, material);
        
        if (isDashed) {
            circle.computeLineDistances();
        }
        
        this.group.add(circle);
    }

    private createLabels(): void {
        // Create labels for each orbital regime
        this.createLabel('LEO', Constants.earthRadius + OrbitalRegimes.LEO.min);
        this.createLabel('MEO', Constants.earthRadius + OrbitalRegimes.MEO.min);
        this.createLabel('GEO', Constants.earthRadius + OrbitalRegimes.GEO.altitude);
        this.createLabel('HEO', Constants.earthRadius + OrbitalRegimes.HEO.perigee);
        this.createLabel('Lunar Orbit', Constants.earthRadius + Constants.moonOrbitRadius);
        this.createLabel('SOI', Constants.earthRadius + Constants.earthSOI);
        this.createLabel('Hill Sphere', Constants.earthRadius + Constants.earthHillSphere);
    }

    private createLabel(text: string, radius: number): void {
        const div = document.createElement('div');
        div.className = 'orbital-regime-label';
        
        // Create inner elements for basic and detailed views
        const basicView = document.createElement('span');
        basicView.textContent = text;
        basicView.style.display = 'block';
        
        const detailedView = document.createElement('span');
        // radius already includes Earth's radius, so subtract it for altitude
        const altitudeKm = ((radius - Constants.earthRadius) / Constants.kmToMeters).toFixed(0);
        const radialKm = (radius / Constants.kmToMeters).toFixed(0);
        detailedView.textContent = `${text}\nAltitude: ${altitudeKm} km\nRadial: ${radialKm} km`;
        detailedView.style.display = 'none';
        detailedView.style.whiteSpace = 'pre-line';
        
        div.appendChild(basicView);
        div.appendChild(detailedView);

        // Base styles
        div.style.color = '#ffffff';
        div.style.fontSize = '8px';
        div.style.fontWeight = '500';
        div.style.padding = '1px 3px';
        div.style.background = 'rgba(0, 0, 0, 0.8)';
        div.style.borderRadius = '2px';
        div.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        div.style.backdropFilter = 'blur(2px)';
        div.style.userSelect = 'none';
        div.style.lineHeight = '1.2';
        div.style.letterSpacing = '0.2px';
        div.style.cursor = 'pointer';
        div.style.pointerEvents = 'auto';  // Enable pointer events only on the label
        
        // Hover effects
        div.addEventListener('pointerenter', (e: PointerEvent) => {
            e.stopPropagation();  // Prevent event from reaching OrbitControls
            div.style.fontSize = '10px';
            div.style.padding = '3px 5px';
            div.style.background = 'rgba(0, 0, 0, 0.9)';
            div.style.border = '1px solid rgba(255, 255, 255, 0.3)';
            basicView.style.display = 'none';
            detailedView.style.display = 'block';
        });
        
        div.addEventListener('pointerleave', (e: PointerEvent) => {
            e.stopPropagation();  // Prevent event from reaching OrbitControls
            div.style.fontSize = '8px';
            div.style.padding = '1px 3px';
            div.style.background = 'rgba(0, 0, 0, 0.8)';
            div.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            basicView.style.display = 'block';
            detailedView.style.display = 'none';
        });

        const label = new CSS2DObject(div) as Label;
        label.element.style.pointerEvents = 'auto';  // Enable pointer events on the label element
        const scaledRadius = (radius * Constants.metersToKm * Constants.scale);
        label.position.set(scaledRadius, 0, 0);
        label.layers.set(1);  // Set to layer 1 for occlusion
        this.group.add(label);
        this.labels.push(label);
    }

    public setVisible(visible: boolean): void {
        this.group.visible = visible;
    }

    public dispose(): void {
        this.group.traverse((object: THREE.Object3D) => {
            if (object instanceof THREE.Line) {
                object.geometry.dispose();
                object.material.dispose();
            }
        });
        this.scene.remove(this.group);
    }
} 