precision highp float;

// Coordenadas UV procedentes del vertex shader
varying vec2 vUv;

// Tiempo global y resolución
uniform float uTime;
uniform vec2 uResolution;

// Datos resumidos de audio
uniform float uVolume;
uniform float uBass;
uniform float uMid;
uniform float uTreble;

// Beats y peaks por bandas
uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;
uniform float uBassPeak;
uniform float uMidPeak;
uniform float uTreblePeak;

// Instrumentos detectados
uniform float uKick;
uniform float uSnare;
uniform float uVoice;
uniform float uHiHat;
uniform float uKickPeak;
uniform float uSnarePeak;
uniform float uVoicePeak;
uniform float uHiHatPeak;

// Texturas de audio
uniform sampler2D uSpectrum;   // X = frecuencias graves -> agudas, R = amplitud
uniform sampler2D uWaveform;   // X = tiempo, R = señal de audio
uniform sampler2D uFFTHistory; // X = frecuencia, Y = histórico temporal, R = amplitud
uniform float uFFTHistoryOffset;

// Descriptores espectrales
uniform float uFlux;
uniform float uCentroid;

#define PI 3.14159265359
#define TAU 6.28318530718

// ---------- Sensibilidad del fondo ----------
// Reduce estos valores para obtener un fondo más estable.
#define BG_BASS_RESPONSE       0.15
#define BG_KICK_RESPONSE       0.03
#define BG_VOLUME_RESPONSE     0.10
#define BG_FLUX_RESPONSE       0.04
#define BG_VOICE_RESPONSE      0.006
#define BG_MID_RESPONSE        0.10
#define BG_HISTORY_RESPONSE    0.012
#define BG_BRIGHTNESS_RESPONSE 0.012

// Intensidad base del fondo y del fractal.
#define BG_BASE_INTENSITY      0.25
#define BG_FRACTAL_INTENSITY   0.40

// ---------- Sensibilidad de destellos ----------
// Controlan el detalle que irradia visualmente desde la zona central.
#define SPARK_RESPONSE         0.00001
#define CENTER_FLASH_RESPONSE  0.00010
#define SNARE_FLASH_RESPONSE   0.00008

// Paleta de color suave (estilo IQ)
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(TAU * (c * t + d));
}

// Rotación 2D
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// Lee la amplitud de la forma de onda en una posición normalizada [0,1].
// Devuelve un valor en [-1,1].
float readWave(float x) {
    return texture2D(uWaveform, vec2(fract(x), 0.5)).r * 2.0 - 1.0;
}

// Lectura suavizada del espectro. La coordenada Y centraliza el formato 1D.
float readSpectrum(float x) {
    float a = texture2D(uSpectrum, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
    float b = texture2D(uSpectrum, vec2(clamp(x + 0.006, 0.0, 1.0), 0.5)).r;
    return mix(a, b, 0.5);
}

// Memoria espectral desplazada: aporta una estela muy sutil a la actividad.
float readHistory(float x, float y) {
    float recent = texture2D(
        uFFTHistory,
        vec2(clamp(x, 0.0, 1.0), clamp(y + uFFTHistoryOffset, 0.0, 1.0))
    ).r;
    return recent;
}

// Distancia a un trazo de una curva polar: r(theta) = base + amp * wave(theta).
float oscilloscopeRing(float dist, float angle, float baseR, float amp, float sign, float thickness) {
    float t = angle / TAU + 0.5;
    float w = (readWave(t) * sign) * 0.75;
    float r = baseR + w * amp;
    float d = abs(dist - r);
    return smoothstep(thickness, 0.0, d);
}

// Resplandor alrededor del trazo.
float oscilloscopeGlow(float dist, float angle, float baseR, float amp, float sign, float falloff) {
    float t = angle / TAU + 0.5;
    float w = (readWave(t) * sign) * 0.5;
    float r = baseR + w * amp;
    return exp(-abs(dist - r) * falloff);
}

void main() {
    // Coordenadas centradas y corregidas por aspecto
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float dist = length(p);
    float angle = atan(p.y, p.x);

    // Señales derivadas: cada una controla una familia visual distinta.
    float globalActivity = clamp(uVolume * BG_VOLUME_RESPONSE + uFlux * BG_FLUX_RESPONSE, 0.0, 1.0);
    float kickPulse = max(uKick, uKickPeak * 0.8);
    float snarePulse = max(uSnare, uSnarePeak * 0.8);
    float voiceMotion = uVoice * 0.7 + uVoicePeak * 0.3;
    float airDetail = uHiHat * 0.7 + uHiHatPeak * 0.3;
    float centroidShift = clamp(uCentroid, 0.0, 1.0);

    // ---------- 1. Fondo fractal deformado por graves y actividad global ----------
    vec2 q = p * (1.5 + uBass * BG_BASS_RESPONSE + kickPulse * BG_KICK_RESPONSE);
    q *= rot(uTime * (0.05 + globalActivity * BG_FLUX_RESPONSE) + uMid * BG_MID_RESPONSE);
    float f = 0.0;
    for (int i = 0; i < 4; i++) {
        q = abs(q) / dot(q, q) - vec2(0.7 + uBass * BG_BASS_RESPONSE * 0.375, 0.6);
        q *= rot(uTime * (0.02 + voiceMotion * BG_VOICE_RESPONSE) + float(i) * 0.3);
        f += exp(-length(q) * 2.0);
    }

    // El centroid desplaza la paleta sin alterar su identidad cromática.
    float paletteTime = f * 0.3 + uTime * 0.05 + centroidShift * 0.12;
    vec3 bg = palette(
        paletteTime,
        vec3(0.5), vec3(0.5),
        vec3(1.0, 1.0, 0.5),
        vec3(0.8, 0.9, 0.3)
    );
    bg *= BG_BASE_INTENSITY + BG_FRACTAL_INTENSITY * f + globalActivity * BG_BRIGHTNESS_RESPONSE;

    // Memoria espectral casi imperceptible: crea profundidad sin cambiar la composición.
    float historyBand = readHistory(0.12 + dist * 0.72, 0.10 + uFFTHistoryOffset * 0.25);
    bg += vec3(0.08, 0.12, 0.16) * historyBand * BG_HISTORY_RESPONSE * globalActivity * (1.0 - smoothstep(0.25, 0.9, dist));

    // ---------- 2. Dos osciloscopios circulares invertidos ----------
    // Kick y beat controlan la expansión principal; los peaks conservan el golpe.
    float baseR = 0.25 + uBeat * 0.04 + uVolume * 0.03 + kickPulse * 0.018;
    float amp = 0.07 + uBass * 0.12 + uVolume * 0.08 + kickPulse * 0.035;
    float ringThickness = 0.012 + snarePulse * 0.003;

    // Osciloscopio A: forma de onda normal
    float scopeA = oscilloscopeRing(dist, angle, baseR, amp, 1.0, ringThickness);
    float scopeAGlow = oscilloscopeGlow(dist, angle, baseR, amp, 1.0, 14.0 - uFlux * 3.0);

    // Osciloscopio B: invertido (espejo)
    float scopeB = oscilloscopeRing(dist, angle, baseR, amp, -1.0, ringThickness);
    float scopeBGlow = oscilloscopeGlow(dist, angle, baseR, amp, -1.0, 14.0 - uFlux * 3.0);

    // El centroid modifica la mezcla, no la paleta base: frío para agudos, cálido para graves.
    vec3 colA = mix(vec3(0.2, 0.8, 1.0), vec3(1.0, 0.95, 0.6), max(uTreble, centroidShift) * 0.6);
    vec3 colB = mix(vec3(1.0, 0.2, 0.6), vec3(1.0, 0.6, 0.2), uBass);

    // Relleno sutil dentro del área del osciloscopio A
    float fillA = smoothstep(
        0.0,
        0.02,
        baseR + readWave(angle / TAU + 0.5) * amp - dist
    ) * (0.08 + uVoice * 0.025);

    // ---------- 3. Forma de onda horizontal de referencia ----------
    float wave = readWave(uv.x) * 0.5 + 0.5;
    float waveY = 0.5 + (wave - 0.5) * 0.15 * (0.5 + uVolume + voiceMotion * 0.25);
    float waveLine = smoothstep(0.008 - snarePulse * 0.002, 0.0, abs(uv.y - waveY));
    float waveGlow = exp(-abs(uv.y - waveY) * (30.0 - uFlux * 7.0)) * (0.4 + uMid * 0.12);
    vec3 waveColor = mix(vec3(0.4, 1.0, 0.7), vec3(1.0), uMid + centroidShift * 0.25);

    // ---------- 4. Detalle espectral y destello secundario ----------
    // El espectro sólo añade microdetalle en los bordes; no crea una visualización nueva.
    float spectralX = fract(angle / TAU + 0.5 + uTime * 0.008);
    float spectralDetail = readSpectrum(spectralX) * airDetail;
    float fineGrain = sin(angle * 48.0 + uTime * 2.0) * 0.5 + 0.5;
    float spark = spectralDetail * fineGrain * smoothstep(0.78, 0.18, dist) * SPARK_RESPONSE;

    // El beat mantiene el destello central original; snare añade un rebote breve.
    float flash = (uBeat + uBassPeak * 0.35) * exp(-dist * 3.0) * CENTER_FLASH_RESPONSE;
    float snareFlash = snarePulse * exp(-dist * 7.0) * (SNARE_FLASH_RESPONSE + uTreble * 0.015);

    // ---------- Composición final ----------
    vec3 color = bg;
    color += colA * (scopeA * 1.2 + scopeAGlow * (0.4 + uTreble + uTreblePeak * 0.2));
    color += colB * (scopeB * 1.2 + scopeBGlow * (0.4 + uBass + uBassPeak * 0.2));
    color += colA * fillA;
    color += waveColor * (waveLine + waveGlow);
    color += vec3(0.45, 0.85, 1.0) * spark;
    color += vec3(1.0, 0.8, 0.5) * flash;
    color += vec3(1.0, 0.9, 1.0) * snareFlash;

    // Viñeta suave
    color *= smoothstep(1.2, 0.3, dist);

    // Corrección gamma aproximada
    color = pow(max(color, 0.0), vec3(0.9));

    gl_FragColor = vec4(color, 1.0);
}
