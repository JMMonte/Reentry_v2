precision highp float;

varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
    // Transform normal to world space
    vNormal = normalize(mat3(modelMatrix) * normal);
    // Compute view direction in world space
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vViewDir = normalize(cameraPosition - worldPos);
    // Standard transform
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
} 