
precision highp float;

varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;

// Análisis musical general
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;

// Instrumentos y peaks
uniform float uKick;
uniform float uKickPeak;
uniform float uSnare;
uniform float uSnarePeak;
uniform float uVoice;
uniform float uHiHat;
uniform float uHiHatPeak;

// Análisis espectral
uniform float uFlux;
uniform float uCentroid;

// Texturas
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;

#define PI 3.14159265359
#define TAU 6.28318530718

// --------------------------------------------------
// FUNCIONES AUXILIARES
// --------------------------------------------------

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float readSpec(float x) {
    return texture2D(
        uSpectrum,
        vec2(clamp(x, 0.0, 1.0), 0.5)
    ).r;
}

float readWave(float x) {
    return texture2D(
        uWaveform,
        vec2(clamp(x, 0.0, 1.0), 0.5)
    ).r * 2.0 - 1.0;
}

// Curva de respuesta suave para señales de audio.
// Reduce la sensibilidad a pequeños cambios.
float softSignal(float x) {
    x = clamp(x, 0.0, 1.0);
    return x * x * (3.0 - 2.0 * x);
}

// Respuesta progresiva a los peaks.
float peakResponse(float x) {
    return smoothstep(0.015, 0.65, clamp(x, 0.0, 1.0));
}

// --------------------------------------------------
// ESTRELLAS INSTRUMENTALES
// --------------------------------------------------

// family:
// 0 = Kick
// 1 = Snare
// 2 = HiHat
//
// Cada estrella pertenece permanentemente a una
// familia según el hash de su celda.

float starLayer(
    vec2 p,
    float z,
    float density,
    float size,
    float family
) {
    // Perspectiva del túnel
    float depth = 1.0 / max(z, 0.001);
    vec2 pp = p * depth;

    // Distribución espacial
    vec2 cell = floor(pp * density);
    vec2 local = fract(pp * density) - 0.5;

    float h = hash(cell);

    // Clasificación instrumental de cada estrella
    float familyHash = hash(cell + vec2(19.1, 7.7));

    float kickMask = 1.0 - step(0.34, familyHash);

    float snareMask =
        step(0.34, familyHash) *
        (1.0 - step(0.67, familyHash));

    float hatMask = step(0.67, familyHash);

    float familyMask =
        family < 0.5 ? kickMask :
        family < 1.5 ? snareMask :
                       hatMask;

    // Posición aleatoria dentro de la celda
    vec2 offset = vec2(
        hash(cell + 1.7),
        hash(cell + 3.1)
    ) - 0.5;

    float d = length(local - offset * 0.6);

    // Profundidad y desvanecimiento
    float fade = smoothstep(0.0, 0.3, z) *
                 (1.0 - smoothstep(0.8, 1.2, z));

    // Parpadeo individual
    float twinkle = 0.75 + 0.25 * sin(
        uTime * 2.0 + h * TAU
    );

    // Tamaño de cada estrella
    float particle = 1.0 - smoothstep(
        0.0,
        size,
        d
    );

    return particle *
           fade *
           twinkle *
           familyMask *
           step(0.35, h);
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

void main() {

    vec2 uv = vUv;

    vec2 p = (uv - 0.5) *
             vec2(uResolution.x / uResolution.y, 1.0);

    float dist = length(p);
    float angle = atan(p.y, p.x);

    // --------------------------------------------------
    // 1. RESPUESTA MUSICAL SUAVIZADA
    // --------------------------------------------------

    float kick = softSignal(uKick);
    float snare = softSignal(uSnare);
    float voice = softSignal(uVoice);
    float hat = softSignal(uHiHat);

    float bass = softSignal(uBass);
    float mid = softSignal(uMid);
    float treble = softSignal(uTreble);

    float kickPeak = peakResponse(uKickPeak);
    float snarePeak = peakResponse(uSnarePeak);
    float hatPeak = peakResponse(uHiHatPeak);

    float activity = softSignal(uFlux);

    // Los peaks se comprimen para evitar flashes
    // excesivamente agresivos.
    float kickFlash = kickPeak * 0.75;
    float snareFlash = snarePeak * 0.75;
    float hatFlash = hatPeak * 0.75;

    // --------------------------------------------------
    // 2. VELOCIDAD DEL TÚNEL
    // --------------------------------------------------

    // Menos influencia de los cambios instantáneos.
    float speed = 0.15 +
                  softSignal(uVolume) * 0.30 +
                  softSignal(uBeat) * 0.12 +
                  activity * 0.08;

    float travel = uTime * speed;

    // --------------------------------------------------
    // 3. DEFORMACIÓN DEL ESPACIO
    // --------------------------------------------------

    // El bombo produce una expansión moderada.
    float breathing = sin(
        dist * 10.0 -
        uTime * 3.0 +
        voice * 1.5
    );

    vec2 q = p * (
        1.0 +
        kick * 0.10 * breathing +
        bass * 0.035
    );

    q *= 1.0 + kickFlash * 0.045;

    // Rotación orgánica muy sutil.
    float rotation = sin(uTime * 0.12) * 0.015 +
                     voice * 0.025;

    float cs = cos(rotation);
    float sn = sin(rotation);

    q = mat2(cs, -sn, sn, cs) * q;

    // --------------------------------------------------
    // 4. SISTEMA DE ESTRELLAS
    // --------------------------------------------------

    vec3 color = vec3(0.0);

    // Paletas instrumentales claramente diferenciadas.
    vec3 kickColor = vec3(1.0, 0.22, 0.035);
    vec3 snareColor = vec3(0.95, 0.08, 0.72);
    vec3 hatColor = vec3(0.05, 0.72, 1.0);

    // Brillo base de cada familia.
    // Los peaks controlan la intensidad adicional.
    float kickEnergy = 0.12 + kickFlash * 1.5;
    float snareEnergy = 0.10 + snareFlash * 1.6;
    float hatEnergy = 0.08 + hatFlash * 1.7;

    // Respuesta secundaria del instrumento.
    kickEnergy += kick * 0.18;
    snareEnergy += snare * 0.15;
    hatEnergy += hat * 0.12;

    for (float i = 0.0; i < 6.0; i++) {

        float bandIdx = i / 6.0;
        float z = fract(bandIdx + travel);

        float spec = readSpec(bandIdx);

        float density = 6.0 + i * 3.0;

        float baseSize = 0.045 +
                         spec * 0.035 +
                         bass * 0.012;

        // ----------------------------------------------
        // ESTRELLAS DE BOMBO
        // ----------------------------------------------

        float kickStars = starLayer(
            q,
            z,
            density,
            baseSize * 1.15,
            0.0
        );

        // ----------------------------------------------
        // ESTRELLAS DE CAJA
        // ----------------------------------------------

        float snareStars = starLayer(
            q,
            z,
            density * 1.05,
            baseSize,
            1.0
        );

        // ----------------------------------------------
        // ESTRELLAS DE CHARLES
        // ----------------------------------------------

        float hatStars = starLayer(
            q,
            z,
            density * 1.15,
            baseSize * 0.70,
            2.0
        );

        // Cada familia tiene su propio color e intensidad.
        color += kickColor * kickStars * kickEnergy;
        color += snareColor * snareStars * snareEnergy;
        color += hatColor * hatStars * hatEnergy;

        // La energía espectral ilumina ligeramente
        // todas las estrellas sin alterar su identidad.
        color += vec3(0.025, 0.035, 0.06) *
                 (kickStars + snareStars + hatStars) *
                 spec;
    }

    // --------------------------------------------------
    // 5. ANILLO OSCILOSCÓPICO CENTRAL
    // --------------------------------------------------

    float wAng = readWave(angle / TAU + 0.5);

    // La voz controla la deformación orgánica.
    float waveAmplitude = 0.045 +
                          softSignal(uVolume) * 0.055 +
                          voice * 0.035;

    float ringR = 0.35 +
                  wAng * waveAmplitude;

    // Expansión muy moderada con el bombo.
    ringR += kick * 0.018;

    float ringDistance = abs(dist - ringR);

    float ring = 1.0 - smoothstep(
        0.0,
        0.012,
        ringDistance
    );

    float ringGlow = exp(
        -ringDistance * (17.0 + treble * 5.0)
    );

    float ringEnergy = 0.30 +
                       mid * 0.45 +
                       softSignal(uMidBeat) * 0.12;

    // Verde menta original, con transición suave
    // hacia un blanco ligeramente azulado.
    vec3 ringCol = mix(
        vec3(0.35, 1.0, 0.70),
        vec3(0.75, 0.92, 1.0),
        clamp(treble * 0.55 + uCentroid * 0.15, 0.0, 1.0)
    );

    // La voz añade un matiz violeta.
    ringCol = mix(
        ringCol,
        vec3(0.75, 0.55, 1.0),
        voice * 0.15
    );

    color += ringCol * (
        ring * 0.85 +
        ringGlow * ringEnergy * 0.40
    );

    // --------------------------------------------------
    // 6. DESTELLOS MUSICALES
    // --------------------------------------------------

    // Beat general reducido para evitar flashes bruscos.
    float mainFlash = softSignal(uBeat) * 0.20 +
                      kickFlash * 0.12;

    // La caja tiene un destello propio.
    float secondaryFlash = snareFlash * 0.22;

    // Los charles producen pequeños destellos cian.
    float hatFlashLight = hatFlash * 0.12;

    // Separación cromática mucho más discreta.
    float chroma = mainFlash * 0.012 +
                   secondaryFlash * 0.008;

    vec3 shifted = vec3(
        color.r * (1.0 + chroma * 4.0),
        color.g,
        color.b * (1.0 - chroma * 4.0)
    );

    color = mix(
        color,
        shifted,
        clamp(mainFlash + secondaryFlash, 0.0, 0.35)
    );

    // Flash cálido del bombo.
    color += kickColor *
             mainFlash *
             exp(-dist * 6.0) *
             0.35;

    // Flash magenta de caja.
    color += snareColor *
             secondaryFlash *
             exp(-dist * 5.0) *
             0.30;

    // Microdestello cian de charles.
    color += hatColor *
             hatFlashLight *
             exp(-dist * 8.0) *
             0.20;

    // --------------------------------------------------
    // 7. ACABADO
    // --------------------------------------------------

    // Viñeta.
    color *= 1.0 - smoothstep(0.2, 1.3, dist);

    // Fondo violeta oscuro.
    color += vec3(0.02, 0.01, 0.04);

    // Corrección tonal.
    color = pow(max(color, 0.0), vec3(0.85));

    gl_FragColor = vec4(color, 1.0);
}
