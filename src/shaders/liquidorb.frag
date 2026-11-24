precision highp float;

/*
================================================================
 BUBAUDIO — SONIC ASTROLABE
================================================================

CONCEPTO VISUAL:
Un astrolabio musical mecánico-orgánico suspendido en el espacio.
Su núcleo es un iris cinético formado por láminas luminosas que
se abren, contraen y deforman siguiendo los acontecimientos musicales.
Alrededor, un anillo espectral conserva la memoria de la canción:
sus frecuencias se convierten en estructuras radiales y sus muestras
históricas generan capas concéntricas de información en movimiento.

COMPORTAMIENTO MUSICAL:
KICK    : expande el iris, deforma sus láminas y desplaza los anillos.
SNARE   : fragmenta los segmentos y produce impactos luminosos.
VOICE   : deforma orgánicamente las láminas y modifica su color.
HIHAT   : genera partículas, microdestellos y vibraciones periféricas.
SPECTRUM: determina la geometría y longitud de las láminas radiales.
WAVEFORM: modula el contorno exterior mediante una oscilación circular.
FFTHISTORY: dibuja anillos históricos con frecuencias y evolución temporal.

GLSL ES 1.00 / THREE.JS SHADERMATERIAL
================================================================
*/

// ================================================================
// 1. CONFIGURACIÓN
// ================================================================

// Intensidades
#define MASTER_INTENSITY  1.15
#define KICK_INTENSITY    0.85
#define SNARE_INTENSITY   0.65
#define VOICE_INTENSITY   0.55
#define HIHAT_INTENSITY   0.45
#define HISTORY_INTENSITY 0.65

// Velocidades
#define ROTATION_SPEED    0.075
#define PETAL_SPEED       0.32
#define PARTICLE_SPEED    0.8
#define HISTORY_SPEED     0.035

// Escalas
#define MAIN_RADIUS       0.34
#define OUTER_RADIUS      0.91
#define PETAL_COUNT       18.0
#define HISTORY_LAYERS    32.0

// Brillos
#define CORE_GLOW        1.5
#define RING_GLOW        1.1
#define PARTICLE_GLOW    1.4
#define MAX_BRIGHTNESS   2.2

// Sensibilidad
#define AUDIO_KICK       1.4
#define AUDIO_SNARE      1.2
#define AUDIO_VOICE      1.0
#define AUDIO_HIHAT      1.3

// Paleta cromática
#define COLOR_CYAN       vec3(0.10, 0.85, 1.00)
#define COLOR_BLUE       vec3(0.16, 0.30, 1.00)
#define COLOR_VIOLET     vec3(0.65, 0.20, 1.00)
#define COLOR_MAGENTA    vec3(1.00, 0.18, 0.62)
#define COLOR_GOLD       vec3(1.00, 0.67, 0.25)
#define COLOR_WHITE      vec3(0.85, 0.95, 1.00)

// ================================================================
// 2. UNIFORMS
// ================================================================

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;

uniform float uVolume;

uniform float uBass;
uniform float uMid;
uniform float uTreble;

uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;

uniform float uBassPeak;
uniform float uMidPeak;
uniform float uTreblePeak;

uniform float uKick;
uniform float uSnare;
uniform float uVoice;
uniform float uHiHat;

uniform float uKickPeak;
uniform float uSnarePeak;
uniform float uVoicePeak;
uniform float uHiHatPeak;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;
uniform sampler2D uFFTHistory;
uniform float uFFTHistoryOffset;

uniform float uFlux;
uniform float uCentroid;

uniform vec2 uMouse;
uniform vec2 uMouseDelta;

uniform float uMouseMiddle;
uniform float uMouseRight;
uniform float uMouseButton4;
uniform float uMouseButton5;

// ================================================================
// 3. FUNCIONES AUXILIARES
// ================================================================

#define PI 3.14159265359
#define TAU 6.28318530718

// Mapea un círculo completo a dos recorridos simétricos.
// Primera mitad:  0 → 1
// Segunda mitad:  1 → 0
float mirroredScan(float angle) {
    float t = fract(angle / TAU);
    return (t < 0.5) ? t * 2.0 : (1.0 - t) * 2.0;
}

float mirroredScan4(float angle) {
    float t = fract(angle / TAU);

    float quadrant = floor(t * 4.0);
    float localT = fract(t * 4.0);

    // Alternamos recorrido normal e invertido.
    return mod(quadrant, 2.0) < 0.5
        ? localT
        : 1.0 - localT;
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

vec3 palette(float t) {
    vec3 c1 = mix(COLOR_BLUE, COLOR_CYAN, smoothstep(0.0, 0.35, t));
    vec3 c2 = mix(COLOR_VIOLET, COLOR_MAGENTA, smoothstep(0.35, 0.75, t));
    return mix(c1, c2, smoothstep(0.35, 0.85, t));
}

vec2 rotate2D(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c) * p;
}

float ring(float d, float radius, float thickness) {
    return 1.0 - smoothstep(thickness, thickness + 0.002, abs(d - radius));
}

float lineGlow(float d, float width) {
    return exp(-abs(d) / max(width, 0.0001));
}

float getSpectrum(float x) {
    return texture2D(
        uSpectrum,
        vec2(clamp(x, 0.001, 0.999), 0.5)
    ).r;
}

float getWaveform(float x) {
    return texture2D(
        uWaveform,
        vec2(fract(x), 0.5)
    ).r * 2.0 - 1.0;
}

// FFT histórica: arriba = muestras recientes.
float getHistory(float frequency, float age) {
    float y = clamp(
        1.0 - age + uFFTHistoryOffset,
        0.001,
        0.999
    );

    return texture2D(
        uFFTHistory,
        vec2(clamp(frequency, 0.001, 0.999), y)
    ).r;
}

// ================================================================
// 4. NÚCLEO CINÉTICO
// ================================================================

vec3 drawCore(vec2 p, float angle, float radius) {

    float kick = clamp(
        uKick * AUDIO_KICK + uKickPeak * 0.35,
        0.0, 1.5
    );

    float snare = clamp(
        uSnare * AUDIO_SNARE + uSnarePeak * 0.25,
        0.0, 1.5
    );

    float voice = clamp(
        uVoice * AUDIO_VOICE,
        0.0, 1.0
    );

    float beat = clamp(uBeat, 0.0, 1.0);

    float rotation = angle * PETAL_COUNT;

    float sector = fract(
        rotation / TAU
    );

    float localAngle = (sector - 0.5) * TAU;

    float frequency = fract(
        sector * 0.72 + 0.025
    );

    float spectrum = getSpectrum(frequency);

    float wave = getWaveform(
        sector + uTime * 0.015
    );

    // Cada lámina tiene una respuesta espectral individual.
    float petalLength = 0.075
        + spectrum * 0.14
        + uBass * 0.025
        + kick * 0.055;

    // La voz introduce una deformación orgánica independiente.
    float organic = sin(
        angle * 5.0
        - uTime * 0.8
        + wave * 1.8
    ) * voice * 0.035;

    float deformation = sin(
        localAngle * 2.0
        + uTime * PETAL_SPEED
    ) * 0.012;

    petalLength += organic + deformation;

    float pulse = 1.0 + kick * 0.13;

    float baseRadius = MAIN_RADIUS * pulse;

    float petalRadius = baseRadius
        + petalLength * smoothstep(0.05, 0.65, radius);

    float angularWidth = 0.12
        + spectrum * 0.065
        + voice * 0.035;

    float angularShape = exp(
        -abs(localAngle) / angularWidth
    );

    float petal = angularShape
        * smoothstep(baseRadius - 0.025, baseRadius + 0.01, radius)
        * (1.0 - smoothstep(
            petalRadius - 0.025,
            petalRadius + 0.012,
            radius
        ));

    // Estructura de las láminas.
    float edge = abs(
        radius - petalRadius
    );

    float petalEdge = lineGlow(edge, 0.004);

    float innerEdge = lineGlow(
        radius - baseRadius,
        0.005
    );

    float segmentGlow = petal * (0.4 + spectrum);

    // Fragmentación rítmica de la percusión.
    float fragmentation = sin(
        sector * 75.0 + uTime * 2.0
    );

    float fragment = smoothstep(
        -0.3,
        0.7,
        fragmentation + snare * 0.8
    );

    float flash = snare * exp(
        -abs(localAngle) * 12.0
    );

    vec3 col = palette(
        fract(sector * 0.25 + uCentroid * 0.2)
    );

    col *= segmentGlow * fragment * 1.7;
    col += col * petalEdge * 0.85;
    col += COLOR_WHITE * flash * petal * 0.65;
    col += COLOR_CYAN * innerEdge * 0.45;

    return col;
}

// ================================================================
// 5. ANILLOS HISTÓRICOS — MEMORIA DEL SONIDO
// ================================================================

// ================================================================
// ESPECTROGRAMA HISTÓRICO CIRCULAR SIMÉTRICO
// ================================================================

vec3 drawHistory(vec2 p, float angle, float radius) {

    vec3 col = vec3(0.0);

    // Cuatro cuadrantes con doble espejo.
    float frequency = mirroredScan4(angle);

    for (int i = 0; i < 32; i++) {

        float fi = float(i);
        float age = fi / 32.0;

        float history = getHistory(frequency, age);

        float historyRadius = 0.70 + age * 0.24;

        // Deformación radial según amplitud histórica.
        historyRadius += history * (
            0.012 + uFlux * 0.018
        );

        float width = 0.0018 + history * 0.003;

        float line = lineGlow(
            radius - historyRadius,
            width
        );

        float temporalFade = pow(
            1.0 - age,
            0.65
        );

        float segment = step(
            0.13,
            fract(frequency * 54.0)
        );

        float intensity = history
            * temporalFade
            * segment
            * HISTORY_INTENSITY;

        vec3 historyColor = palette(
            fract(frequency * 0.6 + age * 0.45)
        );

        col += historyColor
            * line
            * intensity
            * 1.8;

        float ticks = ring(
            radius,
            historyRadius + 0.009,
            0.0009
        );

        col += historyColor
            * ticks
            * history
            * temporalFade
            * 0.22;
    }

    return col;
}

// ================================================================
// 6. ANILLOS MECÁNICOS Y ESCALA ESPECTRAL
// ================================================================

vec3 drawMechanics(vec2 p, float angle, float radius) {

    vec3 col = vec3(0.0);

    float kick = clamp(
        uKick * AUDIO_KICK,
        0.0, 1.0
    );

    float snare = clamp(
        uSnare * AUDIO_SNARE,
        0.0, 1.0
    );

    float rotation = angle + uTime * ROTATION_SPEED;

    // Anillo principal.
    float mainRing = ring(
        radius,
        0.645 + kick * 0.018,
        0.0025
    );

    col += COLOR_CYAN
        * mainRing
        * (0.65 + uBass * 0.4);

    // Segundo anillo con segmentos móviles.
    float segmentAngle = fract(
        rotation * 24.0 / TAU
    );

    float segmentMask = step(
        0.18,
        segmentAngle
    );

    float segmentedRing = ring(
        radius,
        0.675,
        0.003
    );

    col += COLOR_VIOLET
        * segmentedRing
        * segmentMask
        * 0.75;

    // Graduación del astrolabio.
    float tickAngle = fract(
        angle * 72.0 / TAU
    );

    float tick = step(
        0.86,
        tickAngle
    );

    float tickRing = ring(
        radius,
        0.705,
        0.008
    );

    col += COLOR_WHITE
        * tick
        * tickRing
        * 0.55;

    // Barras espectrales periféricas.
    // Espectro duplicado y reflejado en el semicírculo opuesto.
    float frequency = mirroredScan(angle);
    float spectrum = getSpectrum(frequency);

    float barRadius = 0.735
        + spectrum * 0.105
        + uTreble * 0.018;

    float bars = smoothstep(
        0.003,
        0.0,
        abs(radius - barRadius)
    );

    // Separación entre las barras.
    float barSegments = step(
        0.22,
        fract(frequency * 80.0)
    );

    col += palette(
        fract(frequency + uCentroid * 0.25)
    ) * bars * barSegments * 1.3;

    // Anillo de pulsación del kick.
    float kickRing = ring(
        radius,
        0.55 + kick * 0.045,
        0.003 + kick * 0.002
    );

    col += COLOR_GOLD
        * kickRing
        * kick
        * 0.8;

    // Destellos secundarios del snare.
    float snareTicks = step(
        0.91,
        fract(angle * 48.0 / TAU + uTime * 0.5)
    );

    col += COLOR_WHITE
        * snareTicks
        * ring(radius, 0.59, 0.006)
        * snare
        * 0.9;

    return col;
}

// ================================================================
// 7. OSCILOSCOPIO CIRCULAR
// ================================================================

vec3 drawWaveform(vec2 p, float angle, float radius) {

    // Ambas mitades reproducen el waveform en sentidos opuestos.
    float scan = mirroredScan(angle);

    float wave = getWaveform(scan);

    float kick = clamp(uKick, 0.0, 1.0);
    float voice = clamp(uVoice, 0.0, 1.0);

    float waveformRadius = 1.025
        + wave * 0.035
        + kick * 0.018
        + voice * sin(angle * 5.0 + uTime) * 0.012;

    float line = lineGlow(
        radius - waveformRadius,
        0.0035
    );

    float glow = lineGlow(
        radius - waveformRadius,
        0.014
    );

    vec3 color = mix(
        COLOR_CYAN,
        COLOR_MAGENTA,
        smoothstep(-0.6, 0.6, wave)
    );

    return color * (line * 1.4 + glow * 0.24);
}

// ================================================================
// 8. PARTÍCULAS Y MICRODETALLE
// ================================================================

vec3 drawParticles(vec2 p, float radius, float angle) {

    vec3 col = vec3(0.0);

    float energy = clamp(
        uHiHat * AUDIO_HIHAT
        + uHiHatPeak * 0.3
        + uTreble * 0.25,
        0.0, 1.5
    );

    // Partículas distribuidas en una cuadrícula polar.
    vec2 polar = vec2(
        angle / TAU,
        radius
    );

    for (int i = 0; i < 3; i++) {

        float fi = float(i);

        vec2 grid = vec2(
            38.0,
            13.0
        );

        vec2 cell = floor(
            polar * grid + vec2(0.0, uTime * PARTICLE_SPEED * 0.07 * (fi + 1.0))
        );

        float seed = hash21(
            cell + fi * 31.7
        );

        vec2 local = fract(
            polar * grid + vec2(
                0.0,
                uTime * PARTICLE_SPEED * 0.07 * (fi + 1.0)
            )
        ) - 0.5;

        float particleSize = 0.015
            + seed * 0.025;

        float particle = smoothstep(
            particleSize,
            0.0,
            length(local)
        );

        float activity = smoothstep(
            0.45,
            0.95,
            seed + energy * 0.75
        );

        float twinkle = 0.65
            + 0.35 * sin(
                uTime * 5.0 + seed * 50.0
            );

        vec3 particleColor = mix(
            COLOR_CYAN,
            COLOR_GOLD,
            seed
        );

        col += particleColor
            * particle
            * activity
            * twinkle
            * energy
            * PARTICLE_GLOW;
    }

    // Polvo luminoso alrededor del mecanismo.
    float dust = hash21(
        floor(polar * vec2(130.0, 40.0))
    );

    float dustMask = smoothstep(
        0.75,
        1.0,
        dust + energy * 0.2
    );

    col += COLOR_CYAN
        * dustMask
        * energy
        * 0.12
        * smoothstep(0.45, 0.75, radius);

    return col;
}

// ================================================================
// 9. NÚCLEO ÓPTICO
// ================================================================

vec3 drawOpticalCore(vec2 p, float radius, float angle) {

    float kick = clamp(
        uKick * AUDIO_KICK,
        0.0, 1.5
    );

    float voice = clamp(
        uVoice * VOICE_INTENSITY,
        0.0, 1.0
    );

    float snare = clamp(
        uSnare * SNARE_INTENSITY,
        0.0, 1.0
    );

    float coreRadius = 0.105
        + kick * 0.025
        + sin(uTime * 1.3) * 0.004;

    float core = 1.0 - smoothstep(
        coreRadius - 0.012,
        coreRadius + 0.003,
        radius
    );

    // Iris interior.
    float iris = ring(
        radius,
        coreRadius * 0.75,
        0.003
    );

    // Movimiento óptico orgánico.
    float organic = sin(
        angle * 7.0
        + uTime * 1.4
        + voice * 3.0
    ) * voice;

    float iris2 = ring(
        radius,
        0.075 + organic * 0.008,
        0.002
    );

    // Brillo central controlado.
    float glow = exp(
        -radius * radius * 160.0
    );

    vec3 coreColor = mix(
        COLOR_BLUE,
        COLOR_MAGENTA,
        0.35 + voice * 0.35
    );

    vec3 col = coreColor * core * 0.75;

    col += COLOR_CYAN * iris * 0.8;
    col += COLOR_VIOLET * iris2 * 0.8;
    col += COLOR_WHITE * glow * CORE_GLOW;

    // Reflejo especular desplazado.
    vec2 highlightPos = vec2(
        -0.035,
        0.035
    );

    float highlight = exp(
        -length(p - highlightPos) * 65.0
    );

    col += COLOR_WHITE
        * highlight
        * (0.35 + kick * 0.5);

    // Pulso secundario.
    float flash = exp(
        -abs(radius - coreRadius * 1.4) * 80.0
    );

    col += COLOR_GOLD
        * flash
        * snare
        * 0.7;

    return col;
}

// ================================================================
// 10. FONDO Y PROFUNDIDAD
// ================================================================

vec3 drawBackground(vec2 p, float radius, float angle) {

    vec3 col = vec3(0.004, 0.006, 0.018);

    // Viñeta espacial.
    float vignette = 1.0 - smoothstep(
        0.4,
        1.6,
        length(p)
    );

    col *= vignette;

    // Líneas radiales de referencia.
    float radialLines = abs(
        sin(angle * 36.0)
    );

    radialLines = smoothstep(
        0.985,
        1.0,
        radialLines
    );

    float radialFade = smoothstep(
        0.95,
        1.5,
        radius
    );

    col += COLOR_BLUE
        * radialLines
        * radialFade
        * 0.035;

    // Marcas de profundidad.
    float depthNoise = noise21(
        p * 110.0 + vec2(uTime * 0.025, 0.0)
    );

    col += COLOR_VIOLET
        * depthNoise
        * 0.018
        * smoothstep(0.65, 1.4, radius);

    // Campo de estrellas.
    vec2 starCell = floor(p * 90.0);
    float star = hash21(starCell);

    float starVisibility = step(
        0.992,
        star
    );

    float starPulse = 0.5 + 0.5 * sin(
        uTime * 2.0 + star * 100.0
    );

    col += COLOR_WHITE
        * starVisibility
        * starPulse
        * 0.45;

    return col;
}

// ================================================================
// 11. MAIN
// ================================================================

void main() {

    // Coordenadas centradas con corrección de aspecto.
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= uResolution.x / uResolution.y;

    // Interacción opcional.
    vec2 mouse = uMouse * 2.0 - 1.0;
    mouse.x *= uResolution.x / uResolution.y;

    float interaction = uMouseMiddle
        + uMouseRight
        + uMouseButton4
        + uMouseButton5;

    if (interaction > 0.0) {
        float influence = exp(
            -length(p - mouse) * 3.0
        );

        p += uMouseDelta * influence * 0.025;
    }

    float radius = length(p);
    float angle = atan(p.y, p.x);

    // Rotación global suave.
    float globalRotation = uTime * ROTATION_SPEED
        + uBass * 0.025;

    float rotatedAngle = angle - globalRotation;

    // Respuesta general limitada para preservar detalle.
    float energy = clamp(
        uVolume * 0.7 + uFlux * 0.25,
        0.0,
        1.0
    );

    vec3 color = drawBackground(
        p,
        radius,
        rotatedAngle
    );

    // Memoria espectral posterior.
    color += drawHistory(
        p,
        rotatedAngle,
        radius
    ) * (0.7 + energy * 0.3);

    // Mecánica y anillos.
    color += drawMechanics(
        p,
        rotatedAngle,
        radius
    );

    // Iris de láminas radiales.
    color += drawCore(
        p,
        rotatedAngle,
        radius
    );

    // Núcleo óptico.
    color += drawOpticalCore(
        p,
        radius,
        rotatedAngle
    );

    // Osciloscopio circular exterior.
    color += drawWaveform(
        p,
        rotatedAngle,
        radius
    );

    // Partículas de alta frecuencia.
    color += drawParticles(
        p,
        radius,
        rotatedAngle
    );

    // Halo ambiental del instrumento.
    float halo = exp(
        -abs(radius - 0.48) * 12.0
    );

    color += COLOR_VIOLET
        * halo
        * (0.04 + uVoice * 0.12);

    // Respuesta de iluminación musical.
    // Se limita para evitar saturación durante los picos.
    color *= MASTER_INTENSITY;

    color = color / (
        1.0 + color * 0.32
    );

    // Contraste final.
    color = pow(
        max(color, 0.0),
        vec3(0.88)
    );

    gl_FragColor = vec4(
        color,
        1.0
    );
}