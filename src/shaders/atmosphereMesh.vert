// src/shaders/atmosphereMesh.vert
// Vertex shader for planet atmosphere mesh

varying vec3 vFragPositionPlanetLocal; // Vertex position in planet's local, scaled frame
// varying vec3 vNormal; // Original, seems unused by current frag shader

// uniform vec3 uPlanetPositionWorld; // Not needed here for the new varying

// Uniforms for scaling if geometry is unit sphere
uniform float uEquatorialAtmRadiusForScaling;
uniform float uPolarAtmRadiusForScaling;

void main() {
    // 'position' attribute is from a (likely unit) SphereGeometry.
    // We scale it here using the actual atmosphere radii to get the precise local position.
    vFragPositionPlanetLocal = vec3(
        position.x * uEquatorialAtmRadiusForScaling,
        position.y * uPolarAtmRadiusForScaling,
        position.z * uEquatorialAtmRadiusForScaling
    );

    // gl_Position must still be computed for rendering.
    // modelMatrix already includes the scaling set on 'outer.scale' in JS,
    // so modelMatrix * vec4(position, 1.0) correctly transforms the unit sphere vertex.
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}