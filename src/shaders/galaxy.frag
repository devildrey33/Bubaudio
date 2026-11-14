precision highp float;

// Coordenadas UV procedentes del vertex shader
varying vec2 vUv;

// Tiempo y resolución
uniform float uTime;
uniform vec2 uResolution;

// Datos resumidos de audio
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;

// Texturas de audio
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.14159265359
#define TERRAIN_MAX_STEPS 96

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

vec2 saturate(vec2 x) {
    return clamp(x, 0.0, 1.0);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);

    for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p = rot * p * 2.03 + 17.1;
        amplitude *= 0.5;
    }

    return value;
}

// Muestreo robusto del espectro en coordenadas normalizadas.
// El rango de graves, medios y agudos se mezcla con el movimiento temporal.
float audioSpectrum(float x) {
    float low  = texture2D(uSpectrum, vec2(clamp(x * 0.34, 0.0, 1.0), 0.5)).r;
    float high = texture2D(uSpectrum, vec2(clamp(0.34 + x * 0.66, 0.0, 1.0), 0.5)).r;
    return mix(low, high, smoothstep(0.15, 0.85, x));
}

// Terreno infinito visto desde una cámara baja.
float terrainHeight(vec2 p) {
    float travel = uTime * (0.45 + uVolume * 0.8);
    vec2 q = p;
    q.y += travel;

    float large = fbm(q * 0.22 + vec2(0.0, travel * 0.12));
    float detail = fbm(q * 0.72 - vec2(travel * 0.2, 0.0));
    float ridges = abs(noise(q * 0.95) * 2.0 - 1.0);

    // La textura de espectro introduce irregularidad espacial en las crestas.
    float spec = audioSpectrum(fract(abs(p.x) * 0.045 + p.y * 0.008));
    float music = uBass * 1.35 + uMid * 0.55 + uTreble * 0.25;
    float pulse = uBeat * (0.35 + 0.65 * sin(p.y * 0.13 - uTime * 3.0));

    return (large * 1.6 + detail * 0.55 + ridges * 0.22 - 0.85)
         + music * (0.35 + spec * 1.15)
         + pulse * 0.52;
}

float terrainDistance(vec3 p) {
    // Escala vertical para evitar un terreno excesivamente agresivo.
    return p.y - terrainHeight(p.xz) * 0.78;
}

vec3 terrainNormal(vec3 p) {
    float e = 0.035;
    float h = terrainDistance(p);
    vec3 n = vec3(
        terrainDistance(p + vec3(e, 0.0, 0.0)) - h,
        terrainDistance(p + vec3(0.0, e, 0.0)) - h,
        terrainDistance(p + vec3(0.0, 0.0, e)) - h
    );
    return normalize(n);
}

bool raymarchTerrain(vec3 ro, vec3 rd, out vec3 hit, out float distanceTravelled) {
    float t = 0.0;

    for (int i = 0; i < TERRAIN_MAX_STEPS; i++) {
        vec3 p = ro + rd * t;
        float d = terrainDistance(p);

        if (d < 0.025) {
            hit = p;
            distanceTravelled = t;
            return true;
        }

        // Marches conservadores: el terreno es una heightfield y no un SDF perfecto.
        t += max(0.035, d * 0.34);
        if (t > 90.0) break;
    }

    distanceTravelled = t;
    hit = ro + rd * t;
    return false;
}

vec3 skyColor(vec2 uv, vec2 centeredUv) {
    float horizon = smoothstep(-0.35, 0.65, centeredUv.y);
    float pulse = 0.5 + 0.5 * sin(uTime * 1.4 + centeredUv.x * 5.0);
    float energy = uVolume * 0.45 + uBeat * 0.8;

    vec3 horizonColor = vec3(0.08, 0.18, 0.28);
    vec3 zenithColor = vec3(0.005, 0.008, 0.035);
    vec3 col = mix(horizonColor, zenithColor, horizon);

    // Bandas atmosféricas reactivas.
    float bands = pow(max(0.0, 1.0 - abs(centeredUv.y + 0.05)), 8.0);
    col += vec3(0.10, 0.20, 0.38) * bands * (0.35 + energy);
    col += vec3(0.15, 0.04, 0.20) * pulse * uTreble * 0.35;

    // Sol/halo en el horizonte.
    vec2 sunPos = vec2(0.12, 0.12 + uBeat * 0.035);
    float sun = exp(-32.0 * length(centeredUv - sunPos));
    col += vec3(0.95, 0.25, 0.08) * sun * (0.25 + uBass * 0.9);

    return col;
}

float waveformLine(vec2 uv) {
    // Se espera que la forma de onda esté almacenada en una textura horizontal.
    float sampleValue = texture2D(uWaveform, vec2(clamp(uv.x, 0.002, 0.998), 0.5)).r;
    float centeredSample = sampleValue * 2.0 - 1.0;

    // Amplitud y offset para colocar el osciloscopio en primer plano.
    float oscY = 0.76 + centeredSample * (0.075 + uVolume * 0.055);
    float lineWidth = 0.0045 + uTreble * 0.003;
    return 1.0 - smoothstep(lineWidth, lineWidth * 2.8, abs(uv.y - oscY));
}

void main() {
    vec2 uv = vUv;
    vec2 centered = uv * 2.0 - 1.0;
    centered.x *= uResolution.x / max(uResolution.y, 1.0);

    // Cámara con perspectiva apuntando hacia el terreno.
    vec3 ro = vec3(0.0, 2.6 + uBass * 0.65 + uBeat * 0.25, -3.0);
    ro.x += sin(uTime * 0.18) * (0.35 + uMid * 0.25);
    ro.z += uTime * (0.35 + uVolume * 0.3);

    vec3 target = vec3(0.0, 0.25 + uBass * 0.25, ro.z + 5.5);
    vec3 forward = normalize(target - ro);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = normalize(cross(right, forward));
    vec3 rd = normalize(forward + right * centered.x * 0.92 + up * centered.y * 0.72);

    vec3 color = skyColor(uv, centered);
    vec3 hit;
    float travel;

    if (raymarchTerrain(ro, rd, hit, travel)) {
        vec3 normal = terrainNormal(hit);
        vec3 lightDir = normalize(vec3(-0.45, 0.9, -0.35));
        float diffuse = max(dot(normal, lightDir), 0.0);
        float rim = pow(1.0 - max(dot(normal, -rd), 0.0), 2.0);
        float fog = exp(-travel * 0.018);

        float h = terrainHeight(hit.xz);
        float bands = 0.5 + 0.5 * sin(h * 7.0 + uTime * 0.8 + uBass * 4.0);
        float grid = smoothstep(0.48, 0.5, abs(fract(hit.x * 0.28) - 0.5));
        grid += smoothstep(0.48, 0.5, abs(fract(hit.z * 0.28) - 0.5));

        vec3 terrainCol = mix(vec3(0.015, 0.055, 0.09), vec3(0.08, 0.28, 0.32), bands);
        terrainCol += vec3(0.15, 0.36, 0.45) * diffuse * (0.35 + uMid);
        terrainCol += vec3(0.25, 0.08, 0.38) * rim * (0.25 + uTreble);
        terrainCol += vec3(0.05, 0.35, 0.42) * grid * (0.12 + uBeat * 0.8);

        color = mix(color, terrainCol, fog);
    }

    // Viñeta suave.
    float vignette = 1.0 - 0.28 * smoothstep(0.35, 1.25, length(centered));
    color *= vignette;

    // Osciloscopio luminoso en el primer plano.
    float osc = waveformLine(uv);
    float oscGlow = exp(-abs(uv.y - 0.76) * 18.0) * (0.12 + uVolume * 0.18);
    vec3 oscColor = vec3(0.15, 0.85, 1.0) * (osc * (0.75 + uBeat * 0.6) + oscGlow);
    color += oscColor;

    // Línea central y marco sutil del osciloscopio.
    float centerLine = 1.0 - smoothstep(0.0015, 0.004, abs(uv.y - 0.76));
    color += vec3(0.08, 0.28, 0.35) * centerLine * (0.25 + uVolume * 0.4);

    // Flash de beat muy contenido.
    color += vec3(0.18, 0.05, 0.22) * uBeat * 0.12;

    // Tonemapping simple y gamma.
    color = color / (1.0 + color);
    color = pow(max(color, 0.0), vec3(0.4545));

    gl_FragColor = vec4(color, 1.0);
}
