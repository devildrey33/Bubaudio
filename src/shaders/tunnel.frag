precision highp float;

// Coordenadas UV recibidas del vertex shader
varying vec2 vUv;

// Tiempo global en segundos
uniform float uTime;

// Resolución actual del render
uniform vec2 uResolution;

// Intensidad de graves
uniform float uBass;

// Intensidad de medios
uniform float uMid;

// Intensidad de agudos
uniform float uTreble;

// Volumen global
uniform float uVolume;


void main()
{
    // Coordenadas centradas en el origen
    vec2 uv =
        vUv * 2.0 - 1.0;

    // Corrección del aspect ratio
    uv.x *=
        uResolution.x /
        uResolution.y;

    // Ángulo polar
    float angle =
        atan(
            uv.y,
            uv.x
        );

    // Distancia radial
    float radius =
        length(uv);

    // Evitar divisiones por cero
    radius =
        max(
            radius,
            0.0001
        );

    // Velocidad del desplazamiento
    // influenciada por las frecuencias medias
    float speed =
        4.0 +
        uMid * 12.0;

    // Coordenada longitudinal del túnel
    float tunnel =
        1.0 / radius;

    // Desplazamiento temporal
    float z =
        tunnel +
        uTime * speed;

    // Los graves aumentan la cantidad
    // de anillos visibles
    float rings =
        sin(
            z * (
                6.0 +
                uBass * 25.0
            )
        );

    // Los graves también modifican
    // el grosor de las paredes
    float thickness =
        0.25 +
        uBass * 0.75;

    // Patrón principal del túnel
    float pattern =
        smoothstep(
            -thickness,
            thickness,
            rings
        );

    // Variación angular
    float swirl =
        sin(
            angle * 8.0 +
            z
        );

    // Paleta reactiva a los agudos
    vec3 color =
        0.5 +
        0.5 * cos(
            angle +
            z * 0.15 +
            vec3(
                0.0,
                2.0 +
                uTreble * 5.0,
                4.0 +
                uTreble * 8.0
            )
        );

    // Combinar color con patrón
    color *= pattern;

    // Añadir remolino angular
    color *=
        1.0 +
        swirl * 0.3;

    // Brillo controlado por volumen
    color *=
        0.4 +
        uVolume * 3.0;

    // Viñeteado suave
    color *=
        1.0 /
        (
            1.0 +
            radius * radius
        );

    gl_FragColor =
        vec4(
            color,
            1.0
        );
}