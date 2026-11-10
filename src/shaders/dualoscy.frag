
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

void main()
{
    // Coordenadas centradas
    vec2 uv = vUv * 2.0 - 1.0;

    // Corregir aspect ratio
    uv.x *= uResolution.x / uResolution.y;

    // Coordenadas polares
    float radius = length(uv);

    float angle = atan(uv.y, uv.x);

    // Ángulo normalizado 0..1
    float angle01 = fract(angle / TWO_PI);

    // ------------------------------------------------
    // DUAL OSCILLOSCOPE
    // ------------------------------------------------

    // Primera mitad: 0 -> 1
    // Segunda mitad: 1 -> 0

    float waveIndex;

    if (angle01 < 0.5)
    {
        waveIndex = angle01 * 2.0;
    }
    else
    {
        waveIndex = (1.0 - angle01) * 2.0;
    }

    // Leer waveform
    float wave = texture2D(
        uWaveform,
        vec2(waveIndex, 0.0)
    ).r;

    // Convertir a -1..1
    wave = (wave * 2.0 - 1.0);

    // Leer espectro
    float fft = texture2D(
        uSpectrum,
        vec2(waveIndex, 0.0)
    ).r;

    // ------------------------------------------------
    // GEOMETRÍA DEL CÍRCULO
    // ------------------------------------------------

    float baseRadius = 0.48;

    // Amplitud reactiva
    float amplitude =
        0.055 +
        uBass * 0.12 +
        uVolume * 0.035;

    // Radio desplazado por waveform
    float waveRadius =
        baseRadius +
        wave * amplitude;

    // Pequeña influencia del FFT
    waveRadius += fft * 0.018;

    // Distancia a la línea
    float lineDist = abs(radius - waveRadius);

    // Antialiasing
    float aa = fwidth(radius) * 1.5;

    // Línea principal
    float oscilloscope = 1.0 - smoothstep(
        0.002 + aa,
        0.009 + aa,
        lineDist
    );

    // ------------------------------------------------
    // HALO EXTERIOR
    // ------------------------------------------------

    float halo = exp(-lineDist * 35.0);

    halo *= 0.25 + fft * 1.5;

    // ------------------------------------------------
    // ANILLO INTERIOR
    // ------------------------------------------------

    float innerRing = abs(radius - 0.34);

    float ring = 1.0 - smoothstep(
        0.002 + aa,
        0.006 + aa,
        innerRing
    );

    // ------------------------------------------------
    // COLORES
    // ------------------------------------------------

    // Gradiente a lo largo del círculo
    vec3 colorA = vec3(0.05, 0.85, 1.0);
    vec3 colorB = vec3(0.85, 0.10, 1.0);

    vec3 gradient = mix(
        colorA,
        colorB,
        waveIndex
    );

    // Variación dinámica de color
    gradient += vec3(
        0.0,
        uTreble * 0.15,
        uBass * 0.2
    );

    // Línea del osciloscopio
    vec3 color = gradient * oscilloscope * 2.0;

    // Halo
    color += gradient * halo * 0.45;

    // Anillo interior
    color += vec3(0.1, 0.3, 0.5) * ring * 0.5;

    // ------------------------------------------------
    // CENTRO
    // ------------------------------------------------

    float core = exp(-radius * 12.0);

    color += vec3(0.15, 0.25, 0.5) *
        core *
        (0.3 + uBass * 2.0);

    // ------------------------------------------------
    // REACTIVIDAD
    // ------------------------------------------------

    // Flash del beat
    color *= 1.0 + uBeat * 1.5;

    // Volumen general
    color *= 0.6 + uVolume * 1.5;

    // ------------------------------------------------
    // FONDO
    // ------------------------------------------------

    // Suave viñeta
    float vignette = exp(-radius * 1.8);

    color *= vignette;

    // Evitar valores excesivos
    color = 1.0 - exp(-color);

    gl_FragColor = vec4(color, 1.0);
}
