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
uniform sampler2D uSpectrum;   // Espectro de frecuencias
uniform sampler2D uWaveform;   // Forma de onda

#define PI 3.14159265359
#define TAU 6.28318530718

// Hash pseudoaleatorio
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// Lectura del espectro en [0,1] -> [0,1]
float readSpec(float x) {
    return texture2D(uSpectrum, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
}

// Lectura de la forma de onda en [0,1] -> [-1,1]
float readWave(float x) {
    return texture2D(uWaveform, vec2(clamp(x, 0.0, 1.0), 0.5)).r * 2.0 - 1.0;
}

// Capa de estrellas en un túnel con profundidad z.
// Cada celda de la cuadrícula polar contiene una partícula que avanza en z.
float starLayer(vec2 p, float z, float speed, float density, float size) {
    // Proyección en "túnel": coordenadas polares con profundidad
    float depth = 1.0 / max(z, 0.001);
    vec2 pp = p * depth;

    // Celdas
    vec2 cell = floor(pp * density);
    vec2 local = fract(pp * density) - 0.5;

    float h = hash(cell);
    // Cada celda tiene una partícula con desplazamiento aleatorio
    vec2 offset = vec2(hash(cell + 1.7), hash(cell + 3.1)) - 0.5;
    float d = length(local - offset * 0.6);

    // Brillo según profundidad (las lejanas son más tenues)
    float fade = smoothstep(0.0, 0.3, z) * smoothstep(1.2, 0.8, z);
    float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + h * TAU);

    return smoothstep(size, 0.0, d) * fade * twinkle * step(0.35, h);
}

void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float dist = length(p);
    float angle = atan(p.y, p.x);

    // ---------- 1. Velocidad del túnel según volumen ----------
    float speed = 0.15 + uVolume * 0.6 + uBeat * 0.3;
    float travel = uTime * speed;

    // ---------- 2. Distorsión del túnel por graves ----------
    // Un ligero "respiro" en el radio para que el túnel se hinche con los bajos
    vec2 q = p * (1.0 + uBass * 0.25 * sin(dist * 10.0 - uTime * 4.0));
    q *= 1.0 + uBeat * 0.15;

    // ---------- 3. Capas de estrellas en profundidad ----------
    vec3 color = vec3(0.0);
    float layers = 6.0;
    for (float i = 0.0; i < 6.0; i++) {
        // Profundidad de la capa (se desplaza con el tiempo, bucle)
        float z = fract(i / layers + travel);

        // Cada capa usa un tono distinto, guiado por el espectro
        float bandIdx = i / layers;
        float spec = readSpec(bandIdx);

        float density = 6.0 + i * 3.0;
        float size = 0.05 + spec * 0.08 + uBass * 0.04;

        float s = starLayer(q, z, speed, density, size);

        // Color de la capa: graves cálidos, agudos fríos
        vec3 tint = mix(
            vec3(1.0, 0.35, 0.55),   // graves
            vec3(0.35, 0.8, 1.0),    // agudos
            bandIdx * (0.5 + uTreble * 0.5)
        );
        color += tint * s * (0.8 + spec);
    }

    // ---------- 4. Ondulación de la forma de onda en anillos ----------
    // La amplitud de la señal desplaza el radio de un anillo ondulante
    float wAng = readWave(angle / TAU + 0.5);
    float ringR = 0.35 + wAng * (0.05 + uVolume * 0.1);
    float ring = smoothstep(0.01, 0.0, abs(dist - ringR));
    float ringGlow = exp(-abs(dist - ringR) * 18.0) * (0.3 + uMid * 0.7);
    vec3 ringCol = mix(vec3(0.6, 1.0, 0.8), vec3(1.0), uTreble);
    color += ringCol * (ring * 0.9 + ringGlow * 0.4);

    // ---------- 5. Flash cromático en beat ----------
    // Separación de canales RGB en el borde del túnel
    float chroma = uBeat * 0.02;
    vec3 shifted = vec3(
        color.r * (1.0 + chroma * 8.0),
        color.g,
        color.b * (1.0 - chroma * 8.0)
    );
    color = mix(color, shifted, uBeat * 0.6);

    // Destello central en beat
    color += vec3(1.0, 0.9, 0.7) * uBeat * exp(-dist * 6.0) * 0.5;

    // ---------- 6. Viñeta y tono final ----------
    color *= smoothstep(1.3, 0.2, dist);
    color += vec3(0.02, 0.01, 0.04);          // fondo oscuro violeta
    color = pow(color, vec3(0.85));

    gl_FragColor = vec4(color, 1.0);
}
