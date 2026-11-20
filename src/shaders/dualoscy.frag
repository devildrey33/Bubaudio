precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;

uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.14159265359
#define TAU 6.28318530718
#define FRACTAL_LAYERS 5
#define ANGULAR_BRANCHES 72.0

float sat(float x) {
    return clamp(x, 0.0, 1.0);
}

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += vec2(dot(p, p + vec2(269.5, 183.3)));
    return fract(sin(p.x * p.y) * 43758.5453);
}

float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float lineGlow(float distanceToLine, float width) {
    return exp(-abs(distanceToLine) / max(width, 0.00001));
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.00001), 0.0, 1.0);
    return length(p - (a + ab * h));
}

vec3 palette(float amount, float trebleAmount) {
    vec3 magenta = vec3(1.0, 0.055, 0.34);
    vec3 violet = vec3(0.62, 0.12, 0.95);
    vec3 cyan = vec3(0.04, 0.78, 1.0);

    vec3 c = mix(magenta, violet, smoothstep(0.20, 0.55, amount));
    c = mix(c, cyan, smoothstep(0.52, 0.95, amount + trebleAmount * 0.25));
    return c;
}

void main() {
    vec2 p = vUv - 0.5;
    p.x *= uResolution.x / max(uResolution.y, 1.0);

    float time = uTime;
    float bass = sat(uBass);
    float mid = sat(uMid);
    float treble = sat(uTreble);
    float volume = sat(uVolume);
    float beat = sat(uBeat);
    float midBeat = sat(uMidBeat);
    float trebleBeat = sat(uTrebleBeat);

    // Perspectiva: el círculo fractal se transforma en una elipse inclinada.
    float tilt = 0.40 + bass * 0.035 + beat * 0.025;
    vec2 q = vec2(p.x, p.y / tilt);
    float radius = length(q);
    float angle = atan(q.y, q.x);
    float angle01 = fract(angle / TAU + 0.5);

    // Audio circular: cada región angular del fractal recibe una frecuencia distinta.
    float spectrum = texture2D(uSpectrum, vec2(angle01, 0.5)).r;
    float spectrum2 = texture2D(uSpectrum, vec2(fract(angle01 + 0.015), 0.5)).r;
    float waveform = texture2D(
        uWaveform,
        vec2(fract(angle01 + time * 0.018), 0.5)
    ).r;
    float signedWave = waveform * 2.0 - 1.0;

    float audio = sat(spectrum * 0.72 + bass * 0.18 + volume * 0.10);
    float pulse = 1.0 + beat * 0.16 + midBeat * 0.045;
    float ringRadius = 0.235 * pulse + signedWave * 0.006 * mid;

    // Fondo espacial.
    vec3 color = vec3(0.0015, 0.004, 0.022);
    float cloud = noise21(p * 3.0 + vec2(time * 0.012, -time * 0.008));
    cloud += noise21(p * 8.0 - time * 0.016) * 0.45;
    color += vec3(0.005, 0.035, 0.095) * cloud * (0.65 + volume * 0.8);

    // Polvo estelar.
    vec2 starGrid = floor(p * 44.0);
    float star = step(0.988, hash21(starGrid));
    float starPulse = 0.55 + 0.45 * sin(time * 2.0 + hash21(starGrid + 7.0) * TAU);
    color += vec3(0.12, 0.37, 0.75) * star * starPulse * (0.15 + treble * 0.7);

    // Órbitas de fondo.
    float orbitA = abs(radius - (0.38 + sin(angle * 2.0 + time * 0.16) * 0.025));
    float orbitB = abs(radius - (0.52 + cos(angle * 3.0 - time * 0.11) * 0.03));
    color += vec3(0.01, 0.12, 0.25) * exp(-orbitA * 72.0) * 0.30;
    color += vec3(0.02, 0.06, 0.16) * exp(-orbitB * 90.0) * 0.22;

    // Halo y línea principal del anillo.
    float ringDistance = abs(radius - ringRadius);
    float ringHalo = exp(-ringDistance * (25.0 - midBeat * 6.0));
    float ringCore = exp(-ringDistance * (145.0 + mid * 55.0));

    color += vec3(0.015, 0.39, 0.80) * ringHalo * (0.25 + volume * 0.65);
    color += vec3(0.32, 0.88, 1.0) * ringCore * (0.75 + mid * 1.4 + midBeat);

    // Fractal radial: repetición angular y varias capas de subdivisión.
    // Cada capa genera ramas secundarias alrededor del anillo.
    float fractalLight = 0.0;
    float branchActivity = 0.0;
    vec3 fractalColor = vec3(0.0);

    for (int layer = 0; layer < FRACTAL_LAYERS; layer++) {
        float fi = float(layer);
        float scale = pow(1.72, fi);
        float layerRadius = radius - ringRadius;

        // Coordenadas polares repetidas: equivalente visual a subdividir ramas.
        float localAngle = angle * scale;
        localAngle += time * (0.32 + bass * 0.75) * (fi + 1.0);
        localAngle += signedWave * (0.45 + mid * 0.8) * (fi + 1.0);

        float angularCell = abs(atan(sin(localAngle), cos(localAngle)));
        float branch = exp(-angularCell * (20.0 + fi * 8.0));

        // Alternancia de subramas para evitar un círculo uniforme.
        float split = abs(sin(localAngle * 0.5 + fi * 1.7));
        split = smoothstep(0.20, 0.92, split);

        // La onda de audio desplaza radialmente cada nivel fractal.
        float waveOffset = signedWave * (0.006 + fi * 0.003) * mid;
        float radialPhase = layerRadius - waveOffset;

        // Longitud creciente con el espectro y los beats.
        float layerLength = 0.060 + audio * (0.095 + bass * 0.075);
        layerLength *= 1.0 + fi * 0.16;
        layerLength *= 1.0 + beat * (0.55 - fi * 0.045);

        // Segmentos principales que nacen desde el anillo.
        float radialLine = smoothstep(0.0, 0.013 + fi * 0.003, radialPhase);
        radialLine *= 1.0 - smoothstep(layerLength, layerLength + 0.018, radialPhase);
        radialLine *= branch;

        // Subramas fractales: pequeños segmentos desplazados y más finos.
        float subStart = layerLength * (0.27 + split * 0.16);
        float subLength = layerLength * (0.28 - fi * 0.018);
        float subLine = smoothstep(subStart, subStart + 0.009, radialPhase);
        subLine *= 1.0 - smoothstep(subStart + subLength, subStart + subLength + 0.012, radialPhase);
        subLine *= branch * split;

        // Puntas de las ramas.
        float tip = exp(-abs(radialPhase - layerLength) * (80.0 + fi * 18.0));
        tip *= branch;

        float intensity = radialLine * (0.34 + audio * 1.55 + trebleBeat * 0.4);
        intensity += subLine * (0.15 + mid * 0.95) * (1.0 - fi * 0.11);
        intensity += tip * (0.18 + treble * 1.55 + trebleBeat);

        vec3 layerColor = palette(
            audio + fi * 0.07,
            treble * (0.45 + fi * 0.12)
        );

        fractalLight += intensity;
        branchActivity += branch * (0.15 + audio);
        fractalColor += layerColor * intensity;
    }

    color += fractalColor;

    // Filamentos finos, aleatorios, alrededor de las ramas principales.
    float branchIndex = floor(angle01 * ANGULAR_BRANCHES);
    float branchRandom = hash21(vec2(branchIndex, 8.73));
    float filamentAudio = texture2D(
        uSpectrum,
        vec2((branchIndex + 0.5) / ANGULAR_BRANCHES, 0.5)
    ).r;

    float filamentLength = 0.10 + filamentAudio * 0.25 + beat * 0.10;
    filamentLength *= 0.55 + branchRandom * 0.75;
    float filamentStart = ringRadius + 0.025 + branchRandom * 0.025;
    float filamentEnd = filamentStart + filamentLength;
    float filamentAngular = abs(angle01 - (branchIndex + 0.5) / ANGULAR_BRANCHES);
    filamentAngular = min(filamentAngular, 1.0 - filamentAngular);
    float filamentMask = 1.0 - smoothstep(0.002, 0.007, filamentAngular);
    float filamentLine = smoothstep(filamentStart, filamentStart + 0.008, radius);
    filamentLine *= 1.0 - smoothstep(filamentEnd - 0.012, filamentEnd, radius);
    filamentLine *= filamentMask * (0.20 + treble * 0.8);

    color += mix(vec3(0.95, 0.05, 0.40), vec3(0.15, 0.78, 1.0), filamentAudio) * filamentLine;

    // Sol central con resplandor y pequeñas líneas radiales.
    float centerGlow = exp(-radius * (22.0 - beat * 5.0));
    float centerCore = exp(-radius * 115.0);
    float centerRays = pow(abs(sin(angle * 20.0 + time * 0.65)), 18.0);
    centerRays *= exp(-radius * 19.0);

    color += vec3(0.10, 0.40, 0.95) * centerGlow * (0.35 + volume);
    color += vec3(0.70, 0.90, 1.0) * centerRays * (0.18 + treble + trebleBeat);
    color += vec3(1.0) * centerCore * (1.4 + beat * 2.0);

    // Viñeta y acabado luminoso.
    float vignette = 1.0 - smoothstep(0.43, 0.95, length(p));
    color *= 0.70 + vignette * 0.45;
    color *= 0.76 + volume * 0.48;

    color = 1.0 - exp(-color * (1.20 + beat * 0.4));
    color = pow(max(color, 0.0), vec3(0.84));

    gl_FragColor = vec4(color, 1.0);
}
