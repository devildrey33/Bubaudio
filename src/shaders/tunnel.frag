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
#define TAU 6.28318530718

// Ruta cerrada con curvas, espirales y un looping amplio.
// El parámetro s recorre una vuelta completa cada 120 unidades.
vec3 path(float s) {
    float q = TAU * s / 120.0;

    return vec3(
        13.0 * sin(q) + 2.4 * sin(3.0 * q),
         7.0 * sin(2.0 * q + 0.4) + 1.5 * cos(3.0 * q),
        18.0 * (1.0 - cos(q)) + 2.0 * sin(2.0 * q)
    );
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// SDF del interior del túnel y de la esfera.
float sceneDistance(
    vec3 worldPos,
    vec3 camPos,
    vec3 right,
    vec3 up,
    vec3 forward,
    float progress,
    vec3 spherePos,
    out float tunnelDistance,
    out float sphereDistance,
    out vec2 radial
) {
    vec3 rel = worldPos - camPos;
    vec3 localPos = vec3(
        dot(rel, right),
        dot(rel, up),
        dot(rel, forward)
    );

    vec3 centerWorld = path(progress + localPos.z) - camPos;
    vec2 centerLocal = vec2(
        dot(centerWorld, right),
        dot(centerWorld, up)
    );

    radial = localPos.xy - centerLocal;

    float angle = fract(atan(radial.y, radial.x) / TAU + 1.0);
    float secondGraph = step(0.5, angle);

    // Dos gráficos de barras reflejados e invertidos.
    float bandIndex = mix(angle * 2.0, (1.0 - angle) * 2.0, secondGraph);
    bandIndex = clamp(bandIndex, 0.0, 0.999);

    // Cuantizar las bandas hace que se lean como barras.
    float band = (floor(bandIndex * 64.0) + 0.5) / 64.0;
    float amplitude = texture2D(uSpectrum, vec2(band, 0.5)).r;
    amplitude = clamp(amplitude, 0.0, 1.0);

    float side = mix(1.0, -1.0, secondGraph);
    float radius = 4.2 + side * (0.20 + amplitude * 1.10);

    tunnelDistance = radius - length(radial);
    sphereDistance = length(worldPos - spherePos) - 0.82;

    return min(tunnelDistance, sphereDistance);
}

void main() {
    // Una vuelta cada 600 segundos; uTime debe avanzar con la reproducción.
    float progress = mod(max(uTime, 0.0), 600.0) * 0.20;

    vec3 camPos = path(progress);
    vec3 spherePos = path(progress + 4.0);

    vec3 forward = normalize(path(progress + 0.15) - path(progress - 0.15));
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(forward, worldUp));
    vec3 up = normalize(cross(right, forward));

    vec2 screen = vUv * 2.0 - 1.0;
    screen.x *= uResolution.x / max(uResolution.y, 1.0);

    vec3 rayDir = normalize(
        right * screen.x +
        up * screen.y +
        forward * 1.45
    );

    vec3 color = vec3(0.004, 0.008, 0.022);
    float travel = 0.0;
    float hitTunnel = 0.0;
    float hitSphere = 0.0;
    vec3 hitPos = vec3(0.0);
    vec2 hitRadial = vec2(0.0);

    // Raymarch del túnel y la esfera.
    for (int i = 0; i < 96; i++) {
        vec3 p = camPos + rayDir * travel;
        float dTunnel;
        float dSphere;
        vec2 radial;

        float d = sceneDistance(
            p, camPos, right, up, forward,
            progress, spherePos,
            dTunnel, dSphere, radial
        );

        if (d < 0.025) {
            hitPos = p;
            hitRadial = radial;
            hitTunnel = dTunnel;
            hitSphere = dSphere;
            break;
        }

        travel += max(d * 0.72, 0.025);
        if (travel > 95.0) break;
    }

    if (travel <= 95.0 && (hitTunnel < 0.025 || hitSphere < 0.025)) {
        if (hitSphere < hitTunnel) {
            vec3 normal = normalize(hitPos - spherePos);
            vec3 lightDir = normalize(vec3(-0.35, 0.65, -0.7));
            float diffuse = max(dot(normal, lightDir), 0.0);

            color = vec3(0.15, 0.78, 1.0) * (1.4 + diffuse * 1.8);
            color += vec3(0.12, 0.65, 1.0) * uBeat * 1.4;
        } else {
            vec3 rel = hitPos - camPos;
            vec3 localPos = vec3(
                dot(rel, right),
                dot(rel, up),
                dot(rel, forward)
            );

            float angle = fract(atan(hitRadial.y, hitRadial.x) / TAU + 1.0);
            float secondGraph = step(0.5, angle);
            float bandIndex = mix(angle * 2.0, (1.0 - angle) * 2.0, secondGraph);
            bandIndex = clamp(bandIndex, 0.0, 0.999);

            float band = (floor(bandIndex * 64.0) + 0.5) / 64.0;
            float amplitude = texture2D(uSpectrum, vec2(band, 0.5)).r;

            float bandEdge = fract(bandIndex * 64.0);
            float barLine = 1.0 - smoothstep(0.02, 0.08, min(bandEdge, 1.0 - bandEdge));

            vec3 normal = -normalize(vec3(hitRadial, 0.0));
            vec3 lightDir = normalize(vec3(-0.3, 0.55, -0.7));
            float diffuse = 0.25 + 0.75 * max(dot(normal, lightDir), 0.0);

            vec3 base = vec3(0.025, 0.07, 0.16);
            vec3 audioColor = vec3(0.02, 0.75, 1.0);
            audioColor += vec3(0.45, 0.08, 0.9) * uTreble;

            float barGlow = amplitude * (0.45 + 1.5 * uVolume) + barLine * 0.25;
            color = (base + audioColor * barGlow) * diffuse;

            // Pulsos que recorren el túnel al ritmo del audio.
            float pulse = 0.5 + 0.5 * sin(localPos.z * 2.3 - uTime * 3.0);
            color += vec3(0.02, 0.24, 0.38) * pulse * (uBass + uBeat);
        }
    }

    // Halo aproximado de bloom alrededor de la esfera.
    float closestT = max(dot(spherePos - camPos, rayDir), 0.0);
    vec3 closestPoint = camPos + rayDir * closestT;
    float orbDist = length(closestPoint - spherePos);
    float orbGlow = exp(-orbDist * 0.72) * (0.35 + 1.2 * uVolume);
    color += vec3(0.03, 0.30, 0.55) * orbGlow;

    // Niebla para dar profundidad al túnel.
    float fog = exp(-travel * 0.018);
    color *= fog;

    // Osciloscopio en la franja inferior.
    float oscArea = 1.0 - smoothstep(0.18, 0.25, vUv.y);
    float waveform = texture2D(uWaveform, vec2(vUv.x, 0.5)).r;

    // Asume que la textura de waveform codifica amplitud de 0 a 1.
    float wave = waveform * 2.0 - 1.0;
    float waveY = 0.115 + wave * 0.075;
    float lineDist = abs(vUv.y - waveY);

    float oscCore = 1.0 - smoothstep(0.0025, 0.008, lineDist);
    float oscGlow = exp(-lineDist * 70.0);

    vec3 oscColor = vec3(0.02, 0.75, 1.0);
    vec3 oscLayer = oscColor * (1.5 * oscCore + 0.85 * oscGlow);
    oscLayer += vec3(0.04, 0.10, 0.24) * (1.0 - smoothstep(0.0, 0.25, vUv.y));

    color = mix(color, color + oscLayer, oscArea);

    // Partículas que aparecen cuando hay picos altos.
    float peak = max(max(uBeat, uVolume), max(uBass, uTreble));
    float particleGain = smoothstep(0.62, 0.92, peak);

    for (int i = 0; i < 14; i++) {
        float fi = float(i);
        float seed = floor(uTime * 5.0);
        float px = hash21(vec2(fi + 1.0, seed + 3.0));
        float py = 0.075 + hash21(vec2(fi + 9.0, seed + 17.0)) * 0.15;

        vec2 particlePos = vec2(px, py);
        float pd = length((vUv - particlePos) * vec2(uResolution.x / uResolution.y, 1.0));
        float particle = exp(-pd * 220.0) * particleGain;

        color += vec3(0.25, 0.8, 1.0) * particle * oscArea;
    }

    // Viñeta suave.
    vec2 vignetteUv = vUv * (1.0 - vUv.yx);
    float vignette = pow(max(vignetteUv.x * vignetteUv.y * 16.0, 0.0), 0.18);
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
}
