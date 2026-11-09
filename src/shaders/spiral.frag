precision highp float;

// Coordenadas UV
varying vec2 vUv;

// Uniforms generales
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;

uniform vec2 uResolution;

// Waveform enviado como textura
uniform sampler2D uWaveform;


void main()
{
    // Coordenadas centradas
    vec2 uv = vUv * 2.0 - 1.0;

    uv.x *= uResolution.x / uResolution.y;

    // Conversión a coordenadas polares
    float radius = length(uv);

    float angle = atan(
        uv.y,
        uv.x
    );

    // Girar lentamente la espiral
    angle += uTime * (0.3 + uMid * 2.0);

    // Convertir el ángulo en una posición
    // dentro del waveform
    float waveformUV = fract(angle / (6.2831853));

    float waveform = texture2D(uWaveform,
            vec2(
                waveformUV,
                0.0
            )
        ).r;

    // Normalizar 0..255 -> -1..1
    waveform = waveform * 2.0 - 1.0;

    // Distancia ideal de la espiral
    float spiral = angle * 0.08;

    // El waveform deforma la espiral
    spiral += waveform * 0.12 * (1.0 + uBass * 2.0);

    // Grosor de la línea
    float line =
        smoothstep(
            0.02,
            0.0,
            abs(
                radius -
                spiral
            )
        );

    // Color base
    vec3 color =
        0.5 +
        0.5 * cos(
            angle +
            vec3(
                0.0,
                2.0 +
                uTreble * 4.0,
                4.0 +
                uTreble * 8.0
            )
        );

    // Aplicar espiral
    color *= line;

    // Resaltar con el volumen
    color *=
        1.0 +
        uVolume * 3.0;

    // Halo exterior
    color +=
        line * 0.5 *
        vec3(
            0.2,
            0.6,
            1.0
        );

    gl_FragColor =
        vec4(
            color,
            1.0
        );
}