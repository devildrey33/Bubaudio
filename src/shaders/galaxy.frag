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
uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;


void main()
{
    // Coordenadas centradas
    vec2 uv =
        vUv * 2.0 - 1.0;

    // Corregir aspect ratio
    uv.x *=
        uResolution.x /
        uResolution.y;

    // Distancia al centro
    float radius =
        length(uv);

    // Ángulo polar
    float angle =
        atan(
            uv.y,
            uv.x
        );

    // Muestrear FFT dependiendo del ángulo
    float fft =
        texture2D(
            uSpectrum,
            vec2(
                fract(
                    angle /
                    6.28318
                ),
                0.0
            )
        ).r;

    // Muestrear waveform
    float wave =
        texture2D(
            uWaveform,
            vec2(
                fract(
                    angle /
                    6.28318
                ),
                0.0
            )
        ).r;

    // Convertir waveform a rango -1..1
    wave =
        wave * 2.0 - 1.0;

    // Crear espiral
    float spiral =
        radius * 12.0 -
        angle * 2.5;

    // Deformar usando FFT
    spiral +=
        fft * (
            8.0 +
            uBass * 20.0
        );

    // Añadir waveform
    spiral +=
        wave * (
            2.0 +
            uTreble * 5.0
        );

    // Movimiento
    spiral -=
        uTime * (
            2.0 +
            uMid * 6.0
        );

    // Líneas de la galaxia
    float lines =
        abs(
            sin(
                spiral
            )
        );

    lines =
        pow(
            lines,
            12.0
        );

    // Paleta reactiva
    vec3 color =
        0.5 +
        0.5 * cos(
            spiral * 0.1 +
            vec3(
                0.0,
                2.0,
                4.0
            ) +
            uTreble * 4.0
        );

    // Aplicar las líneas espirales
    color *= lines;

    // Núcleo brillante
    float core =
        0.03 /
        (
            radius + 0.01
        );

    color +=
        vec3(
            1.0,
            0.8,
            0.5
        ) *
        core *
        (
            1.0 +
            uBass * 2.0
        );

    // Flash de beat
    color *=
        1.0 +
        uBeat * 3.0;

    // Brillo general
    color *=
        0.5 +
        uVolume * 4.0;

    // Atenuar bordes
    color *=
        exp(
            -radius * 1.5
        );

    gl_FragColor =
        vec4(
            color,
            1.0
        );
}