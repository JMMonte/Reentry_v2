// src/shaders/atmosphereRaymarch.vert
// Vertex shader for fullscreen atmosphere raymarching pass

varying vec2 vUv;

void main() {
    // Pass UV coordinates to the fragment shader
    vUv = uv;

    // Output vertex position directly; fullscreen quad vertices are usually [-1, 1]
    gl_Position = vec4(position, 1.0);
} 