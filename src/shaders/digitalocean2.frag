precision highp float;

// Coordenadas UV procedentes del vertex shader
varying vec2 vUv;

// Tiempo global
uniform float uTime;

// Resolución del render
uniform vec2 uResolution;

// Datos resumidos de audio
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;

// Texturas de audio
uniform sampler2D uSpectrum;   // Espectro de frecuencias
uniform sampler2D uWaveform;   // Forma de onda (eje X = tiempo, Y = amplitud)

#define PI 3.14159265359
#define TAU 6.28318530718

// Paleta de color suave (estilo IQ)
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

// Rotación 2D
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// Lee la amplitud de la forma de onda en una posición normalizada [0,1]
// Devuelve un valor en [-1, 1]
float readWave(float x) {
    return texture2D(uWaveform, vec2(fract(x), 0.5)).r * 2.0 - 1.0;
}

// Distancia a un trazo de una curva polar: r(θ) = base + amp * wave(θ)
// Calculamos la distancia radial a la curva en el píxel actual
float oscilloscopeRing(float dist, float angle, float baseR, float amp, float sign, float thickness) {
    // Posición normalizada a lo largo del círculo
    float t = angle / TAU + 0.5;
    float w = readWave(t) * sign;   // sign = 1.0 o -1.0 para invertir
    float r = baseR + w * amp;

    // Trazo suave
    float d = abs(dist - r);
    return smoothstep(thickness, 0.0, d);
}

// Resplandor alrededor del trazo
float oscilloscopeGlow(float dist, float angle, float baseR, float amp, float sign, float falloff) {
    float t = angle / TAU + 0.5;
    float w = readWave(t) * sign;
    float r = baseR + w * amp;
    return exp(-abs(dist - r) * falloff);
}

void main() {
    // Coordenadas centradas y corregidas por aspecto
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float dist = length(p);
    float angle = atan(p.y, p.x);

    // ---------- 1. Fondo fractal deformado por graves ----------
    vec2 q = p * (1.5 + uBass * 0.8);
    q *= rot(uTime * 0.05 + uMid * 0.5);
    float f = 0.0;
    for (int i = 0; i < 4; i++) {
        q = abs(q) / dot(q, q) - vec2(0.7 + uBass * 0.3, 0.6);
        q *= rot(uTime * 0.02 + float(i) * 0.3);
        f += exp(-length(q) * 2.0);
    }
    vec3 bg = palette(
        f * 0.3 + uTime * 0.05,
        vec3(0.5), vec3(0.5),
        vec3(1.0, 1.0, 0.5),
        vec3(0.8, 0.9, 0.3)
    );
    bg *= 0.25 + 0.4 * f;

    // ---------- 2. Dos osciloscopios circulares invertidos ----------
    float baseR = 0.25 + uBeat * 0.04 + uVolume * 0.03;
    float amp   = 0.07 + uBass * 0.12 + uVolume * 0.08;

    // Osciloscopio A: forma de onda normal
    float scopeA     = oscilloscopeRing(dist, angle, baseR, amp,  1.0, 0.012);
    float scopeAGlow = oscilloscopeGlow(dist, angle, baseR, amp,  1.0, 14.0);

    // Osciloscopio B: invertido (espejo)
    float scopeB     = oscilloscopeRing(dist, angle, baseR, amp, -1.0, 0.012);
    float scopeBGlow = oscilloscopeGlow(dist, angle, baseR, amp, -1.0, 14.0);

    // Colores: A en tonos fríos (agudos), B en tonos cálidos (graves)
    vec3 colA = mix(vec3(0.2, 0.8, 1.0), vec3(1.0, 0.95, 0.6), uTreble * 0.6);
    vec3 colB = mix(vec3(1.0, 0.2, 0.6), vec3(1.0, 0.6, 0.2), uBass);

    // Relleno sutil dentro del área del osciloscopio A
    float fillA = smoothstep(0.0, 0.02, baseR + readWave(angle / TAU + 0.5) * amp - dist) * 0.08;

    // ---------- 3. Forma de onda horizontal de referencia ----------
    float wave = readWave(uv.x) * 0.5 + 0.5;
    float waveY = 0.5 + (wave - 0.5) * 0.15 * (0.5 + uVolume);
    float waveLine = smoothstep(0.008, 0.0, abs(uv.y - waveY));
    float waveGlow = exp(-abs(uv.y - waveY) * 30.0) * 0.4;
    vec3 waveColor = mix(vec3(0.4, 1.0, 0.7), vec3(1.0), uMid);

    // ---------- 4. Destello en beat ----------
    float flash = uBeat * exp(-dist * 3.0) * 0.4;

    // ---------- Composición final ----------
    vec3 color = bg;
    color += colA * (scopeA * 1.2 + scopeAGlow * (0.4 + uTreble));
    color += colB * (scopeB * 1.2 + scopeBGlow * (0.4 + uBass));
    color += colA * fillA;
    color += waveColor * (waveLine + waveGlow);
    color += vec3(1.0, 0.8, 0.5) * flash;

    // Viñeta suave
    color *= smoothstep(1.2, 0.3, dist);

    // Corrección gamma aproximada
    color = pow(color, vec3(0.9));

    gl_FragColor = vec4(color, 1.0);
}
