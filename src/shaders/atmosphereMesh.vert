// src/shaders/atmosphereMesh.vert
// Vertex shader for planet atmosphere mesh

varying vec3 vFragPositionPlanetLocal; // Vertex position in planet's local, scaled frame
varying vec3 vWorldPosition; // World position for depth calculations

// Uniforms for scaling if geometry is unit sphere
uniform float uEquatorialAtmRadiusForScaling;
uniform float uPolarAtmRadiusForScaling;

// Three.js includes for logarithmic depth buffer
#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
    // 'position' attribute is from a (likely unit) SphereGeometry.
    // We scale it here using the actual atmosphere radii to get the precise local position.
    vFragPositionPlanetLocal = vec3(
        position.x * uEquatorialAtmRadiusForScaling,
        position.y * uPolarAtmRadiusForScaling,
        position.z * uEquatorialAtmRadiusForScaling
    );

    // Standard transformation
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * mvPosition;
    
    // Handle logarithmic depth buffer
    #include <logdepthbuf_vertex>
}