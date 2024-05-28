import * as THREE from 'three';

class MoonSurface {
    constructor(mesh, moonRadius) {
        this.mesh = mesh;
        this.moonRadius = moonRadius;
        this.heightOffset = -2;
        this.radius = this.moonRadius + this.heightOffset;

        this.materials = {
            contourLine: new THREE.LineBasicMaterial({
                color: 0x00A5FF,
                polygonOffset: true,
                polygonOffsetFactor: 10,
                polygonOffsetUnits: 1
            })
        };

        this.surfaceLines = [];
    }

    addContourLinesFromSVG(svgText) {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const paths = svgDoc.querySelectorAll('path');

        paths.forEach(path => {
            const d = path.getAttribute('d');
            const points = this.parsePathData(d);
            this.addLine(points);
        });
    }

    parsePathData(d) {
        const commands = d.match(/[ML][^ML]*/g);
        const points = [];

        commands.forEach(command => {
            const coords = command.slice(1).trim().split(/[\s,]+/).map(Number);
            for (let i = 0; i < coords.length; i += 2) {
                const x = coords[i]; // Convert to 10km units
                const y = -coords[i + 1]; // Convert to 10km units and invert y axis
                points.push(new THREE.Vector3(x, y, 0));
            }
        });

        return points;
    }

    addLine(points) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, this.materials.contourLine);
        this.surfaceLines.push(line);
        this.mesh.add(line);
    }

    setVisibility(visible) {
        this.surfaceLines.forEach(line => {
            line.visible = visible;
        });
    }
}

export { MoonSurface };
