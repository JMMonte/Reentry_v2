export function numberToHexColor(colorNumber) {
    // Convert the color number to RGB
    const integerColor = Math.floor(colorNumber) & 0xFFFFFF;
    let r = (integerColor >> 16) & 0xFF;
    let g = (integerColor >> 8) & 0xFF;
    let b = integerColor & 0xFF;

    // Convert RGB to HSV
    const rgbToHsv = (r, g, b) => {
        r /= 255, g /= 255, b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h, s, v];
    };

    // Convert HSV to RGB
    const hsvToRgb = (h, s, v) => {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }
        return [r * 255, g * 255, b * 255];
    };

    // Convert RGB to HSV
    let [h, s, v] = rgbToHsv(r, g, b);

    // Ensure the brightness (value) is always high
    if (v < 0.95) { // Adjust this threshold as needed to ensure lightness
        v = 0.95;
    }

    // Convert back to RGB
    [r, g, b] = hsvToRgb(h, s, v);

    // Convert RGB back to hex
    const hexColor = ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b))
        .toString(16)
        .slice(1)
        .toUpperCase();

    return `#${hexColor}`;
}