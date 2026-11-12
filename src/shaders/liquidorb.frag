// AGUJERO NEGRO DE KERR AUDIOREACTIVO
// Shader procedural para THREE.ShaderMaterial / GLSL ES 1.00.
// No requiere uniforms adicionales. Todos los niveles de audio se esperan en [0,1].
// El resultado es una interpretacion visual estilizada, no una simulacion fisica exacta.
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
    return sat(texture2D(uSpectrum, vec2(clamp(x, 0.003, 0.997), 0.5)).r);
}

float waveform(float x) {
    return texture2D(uWaveform, vec2(clamp(x, 0.002, 0.998), 0.5)).r * 2.0 - 1.0;
}

vec3 colorRamp(float x) {
    vec3 hot = vec3(1.0, 0.12, 0.015);
    vec3 gold = vec3(1.0, 0.72, 0.10);
    vec3 blue = vec3(0.05, 0.32, 1.0);
    return mix(mix(blue, gold, smoothstep(0.10, 0.48, x)),
               hot, smoothstep(0.48, 1.0, x));
}

vec3 backgroundStars(vec2 p) {
    vec3 result = vec3(0.001, 0.003, 0.012);
    for (int layer = 0; layer < 3; layer++) {
        float f = 18.0 + float(layer) * 27.0;
        vec2 grid = floor(p * f);
        vec2 cell = fract(p * f) - 0.5;
        vec2 point = hash22(grid + float(layer) * 19.0) - 0.5;
        float size = mix(0.018, 0.075, pow(hash21(grid + 3.7), 8.0));
        float star = exp(-length(cell - point) * length(cell - point)
                         / max(size * size, 0.0001));
        float flicker = 0.65 + 0.35 * sin(uTime * (1.0 + hash21(grid) * 3.0)
                                             + hash21(grid + 8.0) * 30.0);
        float energy = spectrum(hash21(grid + 12.0));
        result += colorRamp(hash21(grid + 23.0)) * star * flicker
                * (0.06 + 0.16 * energy) / (1.0 + float(layer) * 0.35);
    }
    return result;
}

// Manchas suaves de plasma sobre el disco de acrecion.
float plasma(vec2 q, float radius, float angle) {
    float bands = 0.5 + 0.5 * sin(radius * 29.0 - angle * 4.0
                                      - uTime * (1.2 + uMid));
    float turbulence = 0.5 + 0.5 * sin(q.x * 23.0 + sin(q.y * 17.0)
                                           + uTime * 0.9);
    float audioWave = waveform(0.5 + 0.5 * sin(angle * 2.0 + uTime * 0.12));
    return mix(bands, turbulence, 0.38) + audioWave * 0.18 * sat(uVolume);
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
    float screenRadius = length(p);
    float screenAngle = atan(p.y, p.x);

    // Parametro de spin de Kerr estilizado: el audio puede acelerar la ergosfera.
    float spin = 0.42 + 0.30 * bass + 0.16 * beat;
    float frameDrag = t * (0.10 + spin * 0.16);
    vec2 q = rotate2D(-frameDrag * 0.24) * p;

    vec3 color = backgroundStars(q * 1.35 + vec2(t * 0.002, -t * 0.001));

    // Lente gravitacional: la escena se estira en arcos alrededor del horizonte.
    float horizonRadius = 0.205 + 0.035 * spin;
    float lens = 1.0 + (0.040 + 0.040 * bass + 0.022 * beat)
                       / max(screenRadius, 0.12);
    vec2 lensed = q * lens;
    float radius = length(lensed);
    float angle = atan(lensed.y, lensed.x);

    // Halo de fotones y anillo de luz del agujero negro.
    float photonRadius = horizonRadius * (1.52 + 0.08 * spin);
    float photonRing = exp(-abs(radius - photonRadius)
                           * (72.0 - 22.0 * treble));
    float photonWave = 0.75 + 0.25 * sin(angle * 3.0 - t * 2.6);
    color += vec3(0.10, 0.38, 1.0) * photonRing * photonWave
           * (0.22 + 0.52 * mid + 0.62 * beat);

    // Disco de acrecion inclinado: dos lados con blueshift/redshift diferente.
    float diskDistance = abs(lensed.y * (1.0 + 0.32 * spin)
                            + 0.035 * sin(angle * 2.0 + t * 0.2));
    float innerRadius = horizonRadius * (1.08 - 0.12 * spin);
    float outerRadius = 0.92 + 0.08 * bass;
    float diskMask = smoothstep(innerRadius, innerRadius + 0.055, radius)
                   * (1.0 - smoothstep(outerRadius, outerRadius + 0.16, radius))
                   * exp(-diskDistance * (13.0 + 9.0 * treble));

    float radialEnergy = spectrum(clamp((radius - innerRadius)
                                        / max(outerRadius - innerRadius, 0.1),
                                        0.0, 1.0));
    float plasmaValue = sat(plasma(lensed, radius, angle) * 0.5 + 0.5);
    float orbitalSpeed = 1.0 / sqrt(max(radius, 0.13));
    float orbit = 0.5 + 0.5 * sin(angle * 8.0 - t * (1.1 + orbitalSpeed * 0.30));
    vec3 diskColor = colorRamp(sat(plasmaValue * 0.62 + radialEnergy * 0.55));

    // El lado que rota hacia el observador se vuelve azul y mas luminoso.
    float approaching = 0.5 + 0.5 * cos(angle - 0.35);
    diskColor = mix(diskColor, vec3(0.08, 0.55, 1.0), approaching * 0.34);
    diskColor = mix(diskColor, vec3(1.0, 0.08, 0.015),
                    (1.0 - approaching) * 0.20);
    color += diskColor * diskMask
           * (0.25 + 0.72 * volume + 0.32 * radialEnergy)
           * (0.68 + 0.32 * orbit);

    // Anillos turbulentos del disco: waveform controla el espesor aparente.
    for (int i = 0; i < 3; i++) {
        float layer = float(i);
        float wave = waveform(0.5 + 0.5 * sin(angle * (1.0 + layer)
                                                + layer * 1.8 + t * 0.10));
        float ringRadius = innerRadius + 0.16 + layer * 0.19
                         + wave * (0.018 + 0.040 * volume);
        float ring = exp(-abs(radius - ringRadius) * (48.0 - 9.0 * treble));
        color += colorRamp(0.30 + layer * 0.18) * ring * diskMask
               * (0.10 + 0.28 * mid + 0.18 * beat);
    }

    // Ergosfera pulsante: borde luminoso alrededor del horizonte.
    float ergosphere = horizonRadius * (1.0 + 0.26 * spin * (1.0 + 0.5 * cos(2.0 * angle)));
    float ergoEdge = exp(-abs(radius - ergosphere) * (83.0 - 20.0 * bass));
    float framePulse = 0.65 + 0.35 * sin(t * 4.0 + angle * 2.0);
    color += vec3(0.16, 0.60, 1.0) * ergoEdge * framePulse
           * (0.20 + 0.60 * bass + 0.50 * beat);

    // Horizonte: sombra negra, con ligera distorsion en el borde.
    float shadowRadius = horizonRadius * (1.0 + 0.10 * sin(angle * 2.0 + t)
                                                + 0.10 * beat);
    float shadow = 1.0 - smoothstep(shadowRadius * 0.84,
                                    shadowRadius * 1.05, radius);
    color *= 1.0 - shadow * 0.985;

    // Chorros polares estilizados emitidos por encima y debajo del disco.
    float jetAxis = exp(-abs(lensed.x) * (24.0 - 10.0 * bass));
    float jetDistance = max(abs(lensed.y) - horizonRadius * 1.15, 0.0);
    float jet = jetAxis * exp(-jetDistance * (2.4 - 0.7 * volume));
    float jetNoise = 0.65 + 0.35 * sin(lensed.y * 27.0 - t * 3.0);
    color += vec3(0.04, 0.28, 1.0) * jet * jetNoise
           * (0.08 + 0.45 * bass + 0.38 * beat);

    // Destellos de alta frecuencia orbitando la ergosfera.
    float sparks = 0.0;
    for (int s = 0; s < 6; s++) {
        float id = float(s);
        float sparkAngle = id * TAU / 6.0 + t * (0.3 + 0.04 * id);
        vec2 position = vec2(cos(sparkAngle), sin(sparkAngle))
                      * (photonRadius + 0.025 * sin(t + id));
        sparks += exp(-length(lensed - position) * 145.0)
                * spectrum(0.52 + id * 0.055);
    }
    color += vec3(0.45, 0.85, 1.0) * sparks * treble
           * (0.18 + 0.82 * beat);

    // Campo de distorsion alrededor de la silueta.
    float gravitationalGlow = exp(-radius * 3.5) * (0.035 + 0.10 * volume);
    color += vec3(0.035, 0.12, 0.42) * gravitationalGlow;

    float vignette = 1.0 - smoothstep(0.42, 1.52, screenRadius);
    color *= 0.50 + 0.50 * vignette;
    color *= 0.64 + 0.85 * volume;
    color = vec3(1.0) - exp(-color * 1.40);
    color = pow(max(color, vec3(0.0)), vec3(0.92));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
