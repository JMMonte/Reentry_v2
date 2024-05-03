// vertexShader.glsl
uniform mat4 modelMatrix;  // Model matrix to transform the vertex positions to world space
varying vec3 vWorldPosition;  // World position of the vertex

void main() {
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;  // Transform the position to world space
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);  // Standard transformation
}
