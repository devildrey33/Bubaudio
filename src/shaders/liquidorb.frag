
precision highp float;

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

#define PI 3.14159265359
#define TWO_PI 6.28318530718

// --------------------------------------------
// UTILIDADES
// --------------------------------------------

float hash(vec2 p)
{
    return fract(
        sin(dot(p, vec2(127.1, 311.7))) *
        43758.5453
    );
}

float noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

void main()
{
    // ----------------------------------------
    // COORDENADAS
    // ----------------------------------------

    vec2 uv = vUv * 2.0 - 1.0;

    uv.x *= uResolution.x / uResolution.y;

    float radius = length(uv);

    float angle = atan(uv.y, uv.x);

    float angle01 = fract(angle / TWO_PI);

    // ----------------------------------------
    // AUDIO
    // ----------------------------------------

    float wave = texture2D(
        uWaveform,
        vec2(angle01, 0.0)
    ).r;

    wave = wave * 2.0 - 1.0;

    float fft = texture2D(
        uSpectrum,
        vec2(angle01, 0.0)
    ).r;

    float fft2 = texture2D(
        uSpectrum,
        vec2(fract(angle01 + 0.15), 0.0)
    ).r;

    // ----------------------------------------
    // MOVIMIENTO ORGÁNICO
    // ----------------------------------------

    float t = uTime;

    float organic =
        sin(angle * 3.0 + t * 0.8) * 0.025 +
        sin(angle * 5.0 - t * 0.6) * 0.018 +
        sin(angle * 8.0 + t * 0.4) * 0.010;

    // Deformación según waveform
    float audioDeform =
        wave * (
            0.045 +
            uBass * 0.09
        );

    // Influencia del espectro
    float spectrumDeform =
        fft * (
            0.025 +
            uTreble * 0.035
        );

    // Respiración
    float breathing =
        sin(t * 1.5) * 0.015;

    breathing += uBeat * 0.035;

    // Radio final de la esfera
    float orbRadius =
        0.48 +
        organic +
        audioDeform +
        spectrumDeform +
        breathing;

    // Distancia a la superficie
    float surfaceDist = radius - orbRadius;

    // ----------------------------------------
    // MÁSCARA DEL ORBE
    // ----------------------------------------

    float aa = fwidth(radius) * 1.5;

    float orbMask = 1.0 - smoothstep(
        0.0 - aa,
        0.012 + aa,
        surfaceDist
    );

    // ----------------------------------------
    // TEXTURA LÍQUIDA INTERIOR
    // ----------------------------------------

    vec2 liquidUV = uv;

    // Distorsión animada
    liquidUV.x += sin(uv.y * 7.0 + t) * 0.035;
    liquidUV.y += cos(uv.x * 8.0 - t * 0.8) * 0.035;

    float n1 = noise(
        liquidUV * 5.0 + vec2(t * 0.3, -t * 0.2)
    );

    float n2 = noise(
        liquidUV * 10.0 - vec2(t * 0.4, t * 0.25)
    );

    float n3 = noise(
        liquidUV * 18.0 + vec2(-t * 0.2, t * 0.5)
    );

    float liquid =
        n1 * 0.5 +
        n2 * 0.3 +
        n3 * 0.2;

    // Ondas de energía
    float energy = sin(
        radius * 30.0 -
        t * 2.0 +
        liquid * 5.0 +
        fft * 5.0
    );

    energy = smoothstep(-0.5, 0.9, energy);

    // ----------------------------------------
    // PALETA DE COLORES
    // ----------------------------------------

    vec3 deepBlue = vec3(0.015, 0.035, 0.20);

    vec3 cyan = vec3(0.02, 0.75, 1.0);

    vec3 violet = vec3(0.45, 0.08, 1.0);

    vec3 pink = vec3(1.0, 0.08, 0.55);

    vec3 white = vec3(0.8, 0.95, 1.0);

    // Gradiente de plasma
    vec3 liquidColor = mix(
        deepBlue,
        violet,
        smoothstep(0.15, 0.8, liquid)
    );

    liquidColor = mix(
        liquidColor,
        cyan,
        smoothstep(0.35, 0.9, energy)
    );

    liquidColor = mix(
        liquidColor,
        pink,
        smoothstep(0.65, 0.95, n2) * 0.5
    );

    // Brillo de las frecuencias altas
    liquidColor += cyan * fft * uTreble * 1.5;

    // ----------------------------------------
    // RELIEVE Y SUPERFICIE
    // ----------------------------------------

    float edgeLight = exp(-abs(surfaceDist) * 28.0);

    float innerGlow = exp(-radius * 3.5);

    float veins = pow(
        abs(sin(liquid * 16.0 + n2 * 4.0)),
        8.0
    );

    liquidColor += white * veins * 0.18;

    // Oscurecer el interior para dar profundidad
    liquidColor *= 0.55 + liquid * 0.8;

    // ----------------------------------------
    // HALO EXTERIOR
    // ----------------------------------------

    float outerGlow = exp(
        -max(surfaceDist, 0.0) * 13.0
    );

    outerGlow *= smoothstep(
        0.0,
        0.03,
        surfaceDist
    );

    vec3 glowColor = mix(
        cyan,
        violet,
        0.5 + 0.5 * sin(t + angle * 2.0)
    );

    // ----------------------------------------
    // ILUMINACIÓN
    // ----------------------------------------

    vec2 lightDir = normalize(
        vec2(-0.45, 0.65)
    );

    float highlight = pow(
        max(dot(normalize(uv + vec2(0.001)), lightDir), 0.0),
        8.0
    );

    float specular = highlight * 0.45;

    liquidColor += white * specular;

    // ----------------------------------------
    // COMPOSICIÓN
    // ----------------------------------------

    vec3 color = vec3(0.0);

    // Halo
    color += glowColor * outerGlow * (
        0.3 + uVolume * 1.5 + uBeat
    );

    // Cuerpo
    color += liquidColor * orbMask;

    // Borde luminoso
    color += cyan * edgeLight * 0.45 * orbMask;

    // Núcleo
    color += violet * innerGlow *
        (0.12 + uBass * 0.5) *
        orbMask;

    // Flash del beat
    color *= 1.0 + uBeat * 0.8;

    // Volumen general
    color *= 0.65 + uVolume * 1.4;

    // Viñeta
    color *= exp(-radius * 0.75);

    // Tonemapping
    color = 1.0 - exp(-color * 1.3);

    gl_FragColor = vec4(color, 1.0);
}
