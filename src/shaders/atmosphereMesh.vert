// src/shaders/atmosphereMesh.vert
// Vertex shader for planet atmosphere mesh

varying vec3 vWorldPositionFromPlanetCenter;
varying vec3 vNormal;

uniform vec3 uPlanetPositionWorld;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPositionFromPlanetCenter = worldPos.xyz - uPlanetPositionWorld;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}