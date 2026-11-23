// ============================================================================
// AUDIO-REACTIVE RADIAL SHADER
// ============================================================================
// Shader radial reactivo al audio.
//
// Los controles principales están agrupados en la siguiente sección. Se han
// dejado únicamente los parámetros que normalmente merece la pena modificar.
// El resto de valores forman parte de la implementación y no deberían ser
// necesarios para ajustar el look general.
// ============================================================================

precision highp float;

// -----------------------------------------------------------------------------
// CONTROLES PRINCIPALES
// -----------------------------------------------------------------------------

// Animación y espectro
#define ROTATION_SPEED          0.20  // Velocidad de giro en radianes/segundo
#define SPECTRUM_BAR_COUNT      64.0  // Barras por cada mitad del anillo
#define SPECTRUM_FREQUENCY_POWER 0.70 // <1 da más espacio visual a agudos

// Núcleo, barras y waveform
#define CORE_KICK_GAIN          0.12  // Cuánto crece el núcleo con el kick
#define SPECTRUM_MAX_LENGTH     0.30  // Longitud máxima de las barras
#define WAVEFORM_AMPLITUDE      0.09  // Deformación máxima del anillo de onda

// Ondas de choque
#define SHOCK_MAX_RADIUS        2.40  // Radio máximo: >1 hace que salga por pantalla
#define SHOCK_WIDTH             0.06  // Grosor máximo de la onda durante el golpe
#define SHOCK_INTENSITY         1.60  // Brillo de la onda principal

// Color, acabado y salida
#define VIGNETTE_INTENSITY      0.50  // 0 desactiva la viñeta
#define GRAIN_INTENSITY         0.035 // Grano analógico
#define TONEMAP_EXPOSURE        1.30  // Exposición final
#define OUTPUT_GAMMA            2.20  // Comentar la línea gamma si ya usas sRGB

// Colores principales
#define BACKGROUND_INNER_COLOR  vec3(0.02, 0.01, 0.04)
#define BACKGROUND_OUTER_COLOR  vec3(0.10, 0.04, 0.18)
#define SHOCK_MID_COLOR         vec3(0.05, 0.75, 1.00)
#define SHOCK_SNARE_COLOR       vec3(0.30, 0.80, 1.00)

// -----------------------------------------------------------------------------
// Entradas desde el vertex shader y uniforms
// -----------------------------------------------------------------------------

varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;

// Datos de audio resumidos, normalmente normalizados a 0..1.
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;

// Envolventes generales de beat.
uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;

// Niveles instantáneos por fuente.
uniform float uKick;
uniform float uSnare;
uniform float uVoice;
uniform float uHiHat;

// Picos o ataques por fuente.
uniform float uKickPeak;
uniform float uSnarePeak;
uniform float uVoicePeak;
uniform float uHiHatPeak;

// Texturas 1D guardadas como sampler2D y leídas en el canal rojo.
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI  3.14159265359
#define TAU 6.28318530718

// -----------------------------------------------------------------------------
// Funciones auxiliares
// -----------------------------------------------------------------------------

// Hash sencillo para generar grano pseudoaleatorio por píxel.
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Paleta de color cosenoidal suave.
vec3 palette(float t) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.33, 0.67)));
}

// -----------------------------------------------------------------------------
// Fragment shader principal
// -----------------------------------------------------------------------------

void main() {
    // Coordenadas centradas y corregidas por aspecto.
    // En el eje corto de la pantalla, el borde está aproximadamente en r=1.
    // Por eso SHOCK_MAX_RADIUS=2.40 permite que la onda salga completamente.
    vec2 p = (vUv - 0.5)
           * vec2(uResolution.x / uResolution.y, 1.0)
           * 2.0;

    float r = length(p);
    float ang = atan(p.y, p.x);
    ang += uTime * ROTATION_SPEED;

    // Coordenada angular normalizada a 0..1.
    float a01 = fract(ang / TAU + 0.5);
    float t = uTime;

    // Señales normalizadas. Los picos se usan para iniciar las ondas de choque.
    float beat       = clamp(uKickPeak,  0.0, 1.0);
    float midBeat    = clamp(uSnarePeak, 0.0, 1.0);
    float trebleBeat = clamp(uHiHatPeak, 0.0, 1.0);

    float kick = clamp(uKick,  0.0, 1.0);
    float snare = clamp(uSnare, 0.0, 1.0);
    float voice = clamp(uVoice, 0.0, 1.0);
    float hihat = clamp(uHiHat, 0.0, 1.0);
    float voicePeak = clamp(uVoicePeak, 0.0, 1.0);

    float pixel = 1.0 / uResolution.y;
    vec3 col = vec3(0.0);

    // -------------------------------------------------------------------------
    // 1. Fondo
    // -------------------------------------------------------------------------

    float bgFall = 1.0 - smoothstep(0.0, 1.3, r);
    vec3 bg = mix(BACKGROUND_INNER_COLOR, BACKGROUND_OUTER_COLOR, bgFall);
    bg *= 0.7 + 0.6 * uVolume + 0.25 * kick + 0.20 * voicePeak;
    col += bg;

    // -------------------------------------------------------------------------
    // 2. Núcleo central
    // -------------------------------------------------------------------------

    float coreR = 0.09
               + CORE_KICK_GAIN * kick
               + 0.03 * beat
               + 0.05 * voicePeak;

    float coreGlow = exp(-max(r - coreR, 0.0) * 10.0);
    vec3 coreCol = palette(0.15 + 0.35 * hihat + t * 0.02 + voice * 0.1);

    col += coreCol * coreGlow
         * (0.5 + 2.0 * kick + beat + voicePeak * 0.6);

    // Destello blanco del centro al recibir un kick.
    col += vec3(1.0) * exp(-r * 22.0) * (0.4 + kick);

    // -------------------------------------------------------------------------
    // 3. Barras de espectro
    // -------------------------------------------------------------------------

    float secondHalf = step(0.5, a01);
    float halfAngle = fract(a01 * 2.0);
    float cell = min(
        floor(halfAngle * SPECTRUM_BAR_COUNT),
        SPECTRUM_BAR_COUNT - 1.0
    );

    // Espejamos el espectro para obtener simetría a ambos lados.
    float spectrumCell = mix(
        cell,
        SPECTRUM_BAR_COUNT - 1.0 - cell,
        secondHalf
    );

    float fc = (spectrumCell + 0.5) / SPECTRUM_BAR_COUNT;
    float fx = pow(fc, SPECTRUM_FREQUENCY_POWER);
    float spec = texture2D(uSpectrum, vec2(fx, 0.5)).r;

    // Pequeña variación temporal para evitar barras totalmente estáticas.
    spec = clamp(
        spec * (0.9 + 0.1 * sin(t * 4.0 + spectrumCell * 0.7)),
        0.0,
        1.0
    );

    // Hueco entre barras.
    float dAng = abs(fract(halfAngle * SPECTRUM_BAR_COUNT) - 0.5) * 2.0;
    float gapMask = 1.0 - smoothstep(0.60, 1.0, dAng);

    float baseR = 0.40 + 0.05 * kick + 0.02 * beat;
    float barLen = spec * (SPECTRUM_MAX_LENGTH + 0.30 * kick + 0.20 * voice);
    float outerR = baseR + barLen;

    float radialMask = smoothstep(baseR - pixel, baseR + pixel, r)
                     * (1.0 - smoothstep(outerR - pixel, outerR + pixel, r));
    float barMask = radialMask * gapMask * step(0.015, spec);

    vec3 barCol = palette(fc * 1.2 + 0.10 + t * 0.05 + hihat * 0.30);
    col += barCol * barMask
         * (0.5 + 1.8 * spec)
         * (0.8 + 0.5 * hihat);

    // -------------------------------------------------------------------------
    // 4. Anillo de waveform
    // -------------------------------------------------------------------------

    float waveU = mix(halfAngle, 1.0 - halfAngle, secondHalf);
    float wave = texture2D(uWaveform, vec2(waveU, 0.5)).r * 2.0 - 1.0;

    float waveR = baseR - 0.07
                + wave * (0.05 + WAVEFORM_AMPLITUDE * kick);

    float wLine = 1.0 - smoothstep(
        0.0,
        0.008 + pixel * 1.5,
        abs(r - waveR)
    );

    col += mix(vec3(1.0), palette(0.5 + voice), 0.35)
         * wLine
         * (0.5 + 1.2 * voice + 0.5 * uVolume + 0.5 * uVoicePeak);

    // -------------------------------------------------------------------------
    // 5. Ondas de choque
    // -------------------------------------------------------------------------

    // beat vale 1 justo en el golpe y decae hacia 0.
    //
    // La fórmula original usaba:
    //     shockR = 0.12 + age * 1.05;
    //
    // Aquí usamos SHOCK_MAX_RADIUS para separar claramente el radio máximo
    // de expansión del tamaño de la visualización. Con 2.40, la onda cruza
    // el borde corto (r aproximadamente 1) y continúa hasta desaparecer.
    float age = 1.0 - beat;
    float shockR = 0.12 + age * (SHOCK_MAX_RADIUS - 0.12);
    float shockW = 0.02 + SHOCK_WIDTH * beat;
    float shock = exp(-pow((r - shockR) / shockW, 2.0)) * beat;

    col += palette(0.75 + age * 0.5) * shock * SHOCK_INTENSITY;

    // Onda azul asociada al golpe de medios/caja.
    float midAge = 1.0 - midBeat;
    float midShockR = 0.12 + midAge * (SHOCK_MAX_RADIUS - 0.12);
    float midShockW = 0.02 + SHOCK_WIDTH * midBeat;
    float midShock = exp(-pow((r - midShockR) / midShockW, 2.0)) * midBeat;

    col += SHOCK_MID_COLOR * midShock * SHOCK_INTENSITY;

    // Segundo trazo más fino para remarcar la caja.
    float snareShock = exp(
        -pow((r - midShockR) / (midShockW * 0.7), 2.0)
    ) * midBeat;
    col += SHOCK_SNARE_COLOR * snareShock;

    // Destello ondulante de hi-hat.
    float hihatSpark = exp(-pow(
        (r - (0.55 + sin(t * 12.0 + ang * 8.0) * 0.05)) / 0.02,
        2.0
    ));
    col += vec3(0.8, 0.95, 1.0) * hihatSpark * uHiHatPeak * 0.6;

    // -------------------------------------------------------------------------
    // 6. Postprocesado
    // -------------------------------------------------------------------------

    col *= 1.0 - VIGNETTE_INTENSITY * smoothstep(0.45, 1.70, r);
    col += (hash21(vUv * uResolution + t) - 0.5) * GRAIN_INTENSITY;
    col = 1.0 - exp(-col * TONEMAP_EXPOSURE);

    // Quita esta línea si tu renderer ya convierte a sRGB.
    col = pow(max(col, 0.0), vec3(1.0 / OUTPUT_GAMMA));

    gl_FragColor = vec4(col, 1.0);
}
