precision highp float;

// Coordenadas UV interpoladas procedentes del vertex shader
varying vec2 vUv;

// Tiempo global en segundos
uniform float uTime;

// Resolución actual del render
uniform vec2 uResolution;

// Energía de frecuencias graves (0..1)
uniform float uBass;

// Energía de frecuencias medias (0..1)
uniform float uMid;

// Energía de frecuencias agudas (0..1)
uniform float uTreble;

// Volumen global normalizado (0..1)
uniform float uVolume;


void main()
{
    // Coordenadas centradas en el origen
    vec2 uv = vUv * 2.0 - 1.0;

    // Corrección de aspecto para evitar deformaciones
    uv.x *= uResolution.x / uResolution.y;

    // Distancia al centro de la pantalla
    float d = length(uv);

    // Los graves aumentan la densidad de las ondas
    float bassFrequency = 1.0 + uBass * 60.0;

    // Los medios aceleran la animación
    float animationSpeed = 5.0 + uMid * 10.0;

    // Onda radial principal
    float wave = sin(
            d * bassFrequency -
            uTime * animationSpeed
        );

    // Paleta de colores base
    vec3 color =
        0.5 +
        0.5 * cos(

            // Tiempo animado
            uTime +

            // Variación espacial
            uv.xyx +

            // Los agudos desplazan los colores
            vec3(
                uTreble * 2.0,
                2.0 + uTreble * 4.0,
                4.0 + uTreble * 6.0
            )
        );

    // Intensidad de las ondas
    color *=
        1.0 +
        wave * (
            0.5 +
            uBass
        );

    // Brillo global controlado por el volumen
    color *= 0.4 + uVolume * 2.5;

    // Salida final
    gl_FragColor = vec4(color, 1.0);
}