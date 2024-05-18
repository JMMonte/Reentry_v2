uniform sampler2D cloudTexture;
varying vec2 vUv;

void main() {
    vec4 color = texture2D(cloudTexture, vUv);
    float brightness = (color.r + color.g + color.b) / 3.0; // Calculate luminance
    gl_FragColor = vec4(color.rgb, 0.8 * brightness); // Set alpha based on luminance (adjust the factor as needed)
}
