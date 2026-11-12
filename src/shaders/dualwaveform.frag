// VITRAL LIQUIDO — fragment shader para THREE.ShaderMaterial
// Audio: uBass/uMid/uTreble/uVolume/uBeat normalizados a [0, 1].
// Texturas Nx1: canal R; espectro [0,1], onda [0,1] con silencio en 0.5.
// Sin derivatives, texelFetch ni extensiones; compatible con GLSL ES 1.00.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

vec2 hash22(vec2 p) {
    // Hash acotado, tambien util en dispositivos con precision mediump.
    vec3 h = fract(vec3(p.x, p.y, p.x) * vec3(0.1031, 0.1030, 0.0973));
    h += dot(h, h.yzx + 33.33);
    return fract((h.xx + h.yz) * h.zy);
}

mat2 rotate2D(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, s, -s, c);
}

float spectrum(float x) {
    // Distribucion cuadratica: reserva mas espacio visual a frecuencias bajas.
    x = clamp(x, 0.0, 1.0);
    return clamp(texture2D(uSpectrum, vec2(0.012 + 0.976 * x * x, 0.5)).r, 0.0, 1.0);
}

float waveform(float x) {
    return texture2D(uWaveform, vec2(clamp(x, 0.001, 0.999), 0.5)).r * 2.0 - 1.0;
}

vec3 jewelPalette(float x) {
    return 0.52 + 0.48 * cos(TAU * (x + vec3(0.02, 0.32, 0.62)));
}

// Devuelve F1, F2 y una identidad estable para colorear cada celda.
vec3 liquidCells(vec2 p, float t, float movement) {
    vec2 base = floor(p);
    vec2 local = fract(p);
    float first = 8.0;
    float second = 8.0;
    float identity = 0.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y));
            vec2 seed = hash22(base + offset);
            vec2 site = 0.5 + movement * sin(t + TAU * seed);
            vec2 delta = offset + site - local;
            float d = length(delta);

            if (d < first) {
                second = first;
                first = d;
                identity = seed.x;
            } else if (d < second) {
                second = d;
            }
        }
    }
    return vec3(first, second, identity);
}

void main() {
    float bass = clamp(uBass, 0.0, 1.0);
    float mid = clamp(uMid, 0.0, 1.0);
    float treble = clamp(uTreble, 0.0, 1.0);
    float volume = clamp(uVolume, 0.0, 1.0);
    float beat = clamp(uBeat, 0.0, 1.0);

    vec2 resolution = max(uResolution, vec2(1.0));
    vec2 p = (vUv * 2.0 - 1.0) * vec2(resolution.x / resolution.y, 1.0);
    float pixel = 2.0 / resolution.y;
    float t = mod(uTime, 600.0);
    float radius = length(p);
    float angle = atan(p.y, p.x + 0.00001);

    // El espectro y la onda deforman la geometria, no solo su color.
    float radialSpectrum = spectrum(clamp(radius * 0.65, 0.0, 1.0));
    float angularWave = waveform(0.5 + 0.5 * sin(angle + t * 0.12));
    float breathing = 1.0 + bass * 0.16 + beat * 0.10;
    vec2 q = rotate2D(t * 0.075 + 0.10 * sin(t * 0.21)) * p / breathing;
    q *= 1.0 + 0.10 * radialSpectrum * sin(radius * 8.0 - t * 1.3);

    // Seis sectores reflejados: vidriera radial, sin costura angular visible.
    float a = atan(q.y, q.x + 0.00001);
    float sector = TAU / 6.0;
    float folded = abs(mod(a + 0.5 * sector, sector) - 0.5 * sector);
    vec2 kaleido = length(q) * vec2(cos(folded), sin(folded));
    vec2 domain = kaleido * (3.4 + mid * 0.8);
    domain += 0.12 * angularWave * vec2(sin(radius * 3.0), cos(radius * 3.0));
    domain += vec2(t * 0.055, -t * 0.035);

    vec3 cell = liquidCells(domain, t * 0.38, 0.22 + mid * 0.16);
    float cellEnergy = spectrum(cell.z);
    float gap = max(cell.y - cell.x, 0.0);
    float edgeWidth = 0.014 + 0.025 * treble + 0.020 * cellEnergy;
    float aa = pixel * (3.4 + mid * 0.8) * 1.5;
    float edge = 1.0 - smoothstep(edgeWidth, edgeWidth + aa, gap);
    float glow = exp(-gap * (20.0 - 6.0 * treble));

    float hue = cell.z * 0.70 + radius * 0.13 - t * 0.024;
    vec3 jewel = jewelPalette(hue);
    vec3 seam = jewelPalette(hue + 0.20);

    // Cuerpo traslucido, bisel luminoso y vetas internas de cada pieza.
    float bevel = exp(-gap * 8.0);
    float veins = 0.5 + 0.5 * sin(cell.x * 24.0 - t * 1.4 + cellEnergy * 5.0);
    vec3 color = vec3(0.008, 0.012, 0.030);
    color += jewel * (0.035 + 0.16 * cellEnergy + 0.065 * bevel);
    color += jewel * veins * veins * 0.055 * (0.25 + mid);
    color += seam * (edge * (0.45 + 1.15 * cellEnergy) + glow * 0.18);

    // Tres orbitas: la forma de onda dibuja filamentos cerrados y continuos.
    for (int i = 0; i < 3; i++) {
        float layer = float(i);
        float wave = waveform(0.5 + 0.5 * sin(angle + layer * 2.1 + t * 0.14));
        float petals = cos(angle * 6.0 + layer * 0.8 + t * 0.30);
        float orbit = 0.38 + layer * 0.28 + 0.055 * petals;
        orbit += wave * (0.035 + 0.12 * volume) + bass * 0.055;
        float distanceToOrbit = abs(radius - orbit);
        float width = 0.0035 + 0.003 * treble;
        float filament = 1.0 - smoothstep(width, width + pixel * 1.6, distanceToOrbit);
        float halo = exp(-distanceToOrbit * 48.0);
        vec3 ink = jewelPalette(layer * 0.19 + t * 0.018 + 0.38);
        color += ink * (filament * 0.85 + halo * 0.18) * (0.30 + volume);
    }

    // Anillo viajero: el beat intensifica el pulso y el destello del nucleo.
    float pulseRadius = mod(t * 0.48, 1.85);
    float pulse = exp(-abs(radius - pulseRadius) * 30.0);
    color += vec3(0.55, 0.85, 1.0) * pulse * beat * 0.75;
    float core = exp(-radius * (12.0 - 3.0 * bass));
    color += vec3(0.65, 0.90, 1.0) * core * (0.12 + bass * 0.45 + beat * 0.65);

    // Chispas en las intersecciones: sobre todo sensibles a los agudos.
    float spark = pow(max(0.0, sin(cell.z * 80.0 + t * 2.5)), 18.0);
    color += vec3(0.8, 0.95, 1.0) * spark * edge * treble * 0.65;

    float vignette = 1.0 - smoothstep(0.45, 1.85, radius);
    color *= (0.40 + 0.60 * vignette) * (0.65 + volume * 0.85);
    color = color / (1.0 + color);

    // Salida lineal: Three.js hace la conversion al espacio de color de salida.
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
