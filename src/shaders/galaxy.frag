// GALAXIA AUDIOREACTIVA — THREE.ShaderMaterial / GLSL ES 1.00
// Requiere un vertex shader que exponga: varying vec2 vUv;
// Todas las señales de audio se esperan normalizadas a [0, 1].
// uSpectrum y uWaveform usan el canal R y datos horizontales.
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

float sat(float x) {
    return clamp(x, 0.0, 1.0);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
    float n = sin(dot(p, vec2(41.17, 289.31))) * 43758.5453;
    return fract(vec2(n, n * 1.731 + 17.17));
}

mat2 rotate2D(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, s, -s, c);
}

float spectrum(float x) {
    x = clamp(x, 0.0, 1.0);
    return sat(texture2D(uSpectrum, vec2(0.008 + 0.984 * x, 0.5)).r);
}

float waveform(float x) {
    return texture2D(uWaveform, vec2(clamp(x, 0.002, 0.998), 0.5)).r * 2.0 - 1.0;
}

vec3 starPalette(float x) {
    return 0.5 + 0.5 * cos(TAU * (x + vec3(0.00, 0.18, 0.38)));
}

// Campo de estrellas estable en coordenadas de pantalla.
vec3 starField(vec2 p, float scale, float brightness, float seed) {
    vec2 cell = floor(p * scale);
    vec2 local = fract(p * scale) - 0.5;
    vec2 rnd = hash22(cell + seed);
    vec2 position = (rnd - 0.5) * 0.78;
    float distanceToStar = length(local - position);
    float size = mix(0.015, 0.12, pow(rnd.x, 7.0));
    float star = exp(-distanceToStar * distanceToStar / max(size * size, 0.0001));
    float twinkle = 0.68 + 0.32 * sin(uTime * (1.5 + rnd.y * 4.0) + rnd.x * 40.0);
    float energy = spectrum(rnd.y);
    vec3 color = starPalette(rnd.x * 0.5 + rnd.y * 0.2);
    return color * star * brightness * twinkle * (0.35 + 1.3 * energy);
}

// SDF aproximada de una espiral logaritmica. Devuelve una linea luminosa.
float spiralArm(vec2 p, float arm, float turns, float width) {
    float r = max(length(p), 0.0001);
    float a = atan(p.y, p.x);
    float logarithmic = a - turns * log(r + 0.12) - arm * TAU;
    float wrapped = abs(fract(logarithmic / TAU + 0.5) - 0.5) * TAU;
    return exp(-wrapped * wrapped / max(width * width, 0.00001));
}

void main() {
    float bass = sat(uBass);
    float mid = sat(uMid);
    float treble = sat(uTreble);
    float volume = sat(uVolume);
    float beat = sat(uBeat);
    float t = mod(uTime, 600.0);

    vec2 resolution = max(uResolution, vec2(1.0));
    vec2 uv = vUv * 2.0 - 1.0;
    vec2 p = uv * vec2(resolution.x / resolution.y, 1.0);
    float radius = length(p);
    float angle = atan(p.y, p.x);

    // La galaxia rota y respira con graves y golpes.
    float spin = t * (0.055 + 0.075 * bass + 0.025 * beat);
    vec2 galaxy = rotate2D(-spin) * p;
    float galaxyRadius = length(galaxy);

    // Campo profundo con tres escalas de estrellas.
    vec3 color = vec3(0.002, 0.003, 0.012);
    color += starField(rotate2D(0.05) * p, 19.0, 0.18, 1.0);
    color += starField(rotate2D(-0.12) * p, 38.0, 0.13, 7.0);
    color += starField(rotate2D(0.27) * p, 74.0, 0.085, 19.0);

    // Disco tenue: polvo azul, magenta y turquesa alrededor del centro.
    float disk = exp(-galaxyRadius * 1.35);
    float diskThickness = exp(-abs(galaxy.y) * (3.2 + 2.0 * treble));
    vec3 diskColor = mix(vec3(0.025, 0.08, 0.24),
                          vec3(0.26, 0.035, 0.28),
                          smoothstep(0.08, 0.85, galaxyRadius));
    color += diskColor * disk * diskThickness * (0.16 + 0.25 * volume);

    // Tres brazos que se ensanchan y brillan en función del espectro.
    float arms = 0.0;
    float armDust = 0.0;
    for (int i = 0; i < 3; i++) {
        float armIndex = float(i);
        float armPhase = armIndex / 3.0 + 0.02 * waveform(0.25 + armIndex * 0.22);
        float width = 0.105 + 0.035 * mid + 0.018 * sin(t + armIndex);
        float arm = spiralArm(galaxy * (1.0 + 0.18 * galaxyRadius),
                              armPhase, 1.20 + 0.12 * bass, width);
        float localSpectrum = spectrum(fract(galaxyRadius * 0.72 + armPhase));
        float ridges = 0.55 + 0.45 * sin(galaxyRadius * 38.0 - t * 0.8
                                         + armIndex * 2.4);
        arms += arm * (0.25 + 0.8 * localSpectrum) * ridges;
        armDust += pow(max(arm, 0.0), 2.4) * (0.25 + 0.75 * localSpectrum);
    }

    vec3 armColor = mix(vec3(0.025, 0.32, 0.95),
                        vec3(0.78, 0.06, 0.50),
                        smoothstep(0.08, 0.78, galaxyRadius));
    armColor = mix(armColor, vec3(0.15, 0.82, 1.0), treble * 0.36);
    color += armColor * arms * (0.08 + 0.23 * volume + 0.20 * beat);
    color += vec3(0.45, 0.06, 0.34) * armDust * 0.10 * mid;

    // Nubes granulares de polvo en los brazos.
    vec2 dustDomain = galaxy * 7.0 + vec2(t * 0.04, -t * 0.025);
    float dustNoise = 0.0;
    for (int j = 0; j < 3; j++) {
        float layer = float(j);
        vec2 grid = floor(dustDomain * (2.0 + layer));
        vec2 local = fract(dustDomain * (2.0 + layer)) - 0.5;
        vec2 point = hash22(grid + layer * 13.0) - 0.5;
        float grain = exp(-length(local - point) * (12.0 + layer * 10.0));
        dustNoise += grain * (0.35 / (layer + 1.0));
    }
    color += vec3(0.20, 0.06, 0.26) * dustNoise * armDust * (0.15 + 0.55 * mid);

    // Onda de radio: círculos deformados por muestras de waveform.
    float radio = 0.0;
    for (int k = 0; k < 3; k++) {
        float layer = float(k);
        float sampleX = 0.5 + 0.5 * sin(angle + layer * 2.1 + t * 0.13);
        float wave = waveform(sampleX);
        float ringRadius = 0.22 + layer * 0.25 + wave * (0.025 + 0.055 * volume);
        float ring = exp(-abs(galaxyRadius - ringRadius) * (42.0 - 12.0 * treble));
        radio += ring * (0.20 + 0.27 * treble);
    }
    color += vec3(0.05, 0.55, 0.95) * radio * (0.20 + volume * 0.80);

    // Núcleo: agujero negro estilizado, corona y horizonte brillante.
    float coreRadius = 0.105 + bass * 0.045 + beat * 0.035;
    float corona = exp(-galaxyRadius * 11.0) * (0.32 + 0.75 * bass + 0.75 * beat);
    float horizon = 1.0 - smoothstep(coreRadius * 0.72,
                                     coreRadius * 1.18, galaxyRadius);
    float accretion = exp(-abs(galaxyRadius - coreRadius * 1.38) * 34.0);
    color += vec3(0.72, 0.16, 0.45) * corona;
    color += vec3(0.30, 0.76, 1.0) * accretion * (0.25 + mid * 0.75);
    color = mix(color, vec3(0.0002, 0.0003, 0.001), horizon * 0.90);

    // Explosiones puntuales alrededor del núcleo con las frecuencias altas.
    float sparks = 0.0;
    for (int s = 0; s < 5; s++) {
        float id = float(s);
        float sparkAngle = id * 1.256 + t * (0.12 + id * 0.01);
        vec2 sparkPosition = vec2(cos(sparkAngle), sin(sparkAngle))
                            * (0.17 + 0.04 * sin(t + id));
        float energy = spectrum(0.62 + id * 0.06);
        sparks += exp(-length(galaxy - sparkPosition) * 95.0) * energy;
    }
    color += vec3(0.55, 0.82, 1.0) * sparks * treble * (0.25 + 0.75 * beat);

    // Pulso radial que cruza el disco al llegar un beat.
    float pulseRadius = mod(t * 0.32, 1.6);
    float pulse = exp(-abs(galaxyRadius - pulseRadius) * 44.0);
    color += vec3(0.10, 0.45, 0.90) * pulse * beat * 0.38;

    // Viñeta y compresión suave para conservar detalle en el núcleo.
    float vignette = 1.0 - smoothstep(0.42, 1.55, radius);
    color *= (0.42 + 0.58 * vignette) * (0.62 + 0.72 * volume);
    color = vec3(1.0) - exp(-color * 1.35);
    color = pow(max(color, vec3(0.0)), vec3(0.92));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
