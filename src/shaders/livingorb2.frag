
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
#define TAU 6.28318530718

// --------------------------------------------------
// UTILIDADES
// --------------------------------------------------

float hash(float n) {
    return fract(sin(n * 127.1) * 43758.5453123);
}

float audioWave(float x) {
    return texture2D(
        uWaveform,
        vec2(fract(x), 0.0)
    ).r * 2.0 - 1.0;
}

float audioSpectrum(float x) {
    return texture2D(
        uSpectrum,
        vec2(clamp(x, 0.0, 1.0), 0.0)
    ).r;
}

float angleDifference(float a, float b) {
    return atan(sin(a - b), cos(a - b));
}

vec3 palette(float t) {
    vec3 cyan = vec3(0.04, 0.9, 1.0);
    vec3 blue = vec3(0.12, 0.32, 1.0);
    vec3 violet = vec3(0.65, 0.12, 1.0);
    vec3 pink = vec3(1.0, 0.12, 0.52);

    vec3 c = mix(cyan, blue, smoothstep(0.0, 0.35, t));
    c = mix(c, violet, smoothstep(0.30, 0.7, t));
    c = mix(c, pink, smoothstep(0.68, 1.0, t));

    return c;
}

// Distancia a un segmento y posición más cercana.
float segmentDistance(
    vec2 p,
    vec2 a,
    vec2 b,
    out float closestT
) {
    vec2 ab = b - a;

    closestT = clamp(
        dot(p - a, ab) / max(dot(ab, ab), 0.00001),
        0.0,
        1.0
    );

    return length(p - (a + ab * closestT));
}

// Curva cuadrática de Bézier.
vec2 bezier(
    vec2 a,
    vec2 b,
    vec2 c,
    float t
) {
    float s = 1.0 - t;

    return s * s * a +
           2.0 * s * t * b +
           t * t * c;
}

// --------------------------------------------------
// ILUMINACIÓN ESFÉRICA
// --------------------------------------------------

vec3 sphereLighting(vec2 p, float r) {

    float normalizedRadius = length(p) / r;

    float z = sqrt(
        max(0.0, 1.0 - normalizedRadius * normalizedRadius)
    );

    vec3 normal = normalize(vec3(
        p / r,
        z
    ));

    vec3 lightDir = normalize(vec3(
        -0.45,
        0.65,
        0.85
    ));

    vec3 viewDir = vec3(0.0, 0.0, 1.0);

    float diffuse = max(dot(normal, lightDir), 0.0);

    vec3 halfDir = normalize(lightDir + viewDir);

    float specular = pow(
        max(dot(normal, halfDir), 0.0),
        48.0
    );

    float fresnel = pow(
        1.0 - max(dot(normal, viewDir), 0.0),
        3.0
    );

    vec3 baseColor = mix(
        vec3(0.015, 0.12, 0.28),
        vec3(0.04, 0.42, 0.62),
        diffuse
    );

    vec3 result = baseColor * (0.25 + diffuse * 0.85);

    result += vec3(0.12, 0.85, 1.0) * specular * 1.8;
    result += vec3(0.18, 0.25, 1.0) * fresnel * 0.7;

    return result;
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

void main() {

    vec2 p = vUv - 0.5;

    float aspect = uResolution.x / max(uResolution.y, 1.0);

    p.x *= aspect;
    p *= 2.0;

    float radius = length(p);
    float angle = atan(p.y, p.x);

    float time = uTime;

    float bass = clamp(uBass, 0.0, 1.0);
    float mid = clamp(uMid, 0.0, 1.0);
    float treble = clamp(uTreble, 0.0, 1.0);
    float volume = clamp(uVolume, 0.0, 1.0);
    float beat = clamp(uBeat, 0.0, 1.0);

    vec3 color = vec3(0.0);

    // --------------------------------------------------
    // 1. POSICIÓN Y TAMAÑO DEL NÚCLEO
    // --------------------------------------------------

    float corePulse =
        1.0 +
        bass * 0.16 +
        beat * 0.12 +
        sin(time * 1.8) * 0.018;

    float coreRadius = 0.145 * corePulse;

    float coreDist = radius - coreRadius;

    float coreMask =
        1.0 - smoothstep(
            coreRadius - 0.006,
            coreRadius + 0.006,
            radius
        );

    // Deformación de la membrana.
    float membraneWave =
        sin(angle * 5.0 + time * 1.5) *
        sin(angle * 3.0 - time * 0.8);

    float membraneDist =
        radius -
        coreRadius -
        membraneWave * 0.008 * (0.3 + mid);

    float membraneRim =
        exp(-abs(membraneDist) * 75.0);

    // --------------------------------------------------
    // 2. TENTÁCULOS: CAPA TRASERA Y DELANTERA
    // --------------------------------------------------

    float backArms = 0.0;
    float frontArms = 0.0;

    float backBranches = 0.0;
    float frontBranches = 0.0;

    float frontTips = 0.0;
    float backTips = 0.0;

    float armColors = 0.0;

    for (int i = 0; i < 9; i++) {

        float fi = float(i);

        float id = fi / 9.0;

        float baseAngle = id * TAU;

        float fft = audioSpectrum(
            0.025 + id * 0.78
        );

        float wave = audioWave(
            0.06 + id * 0.84
        );

        // Longitud dinámica.
        float armLength =
            0.39 +
            bass * 0.12 +
            fft * 0.09 +
            beat * 0.045 +
            wave * 0.025;

        // Movimiento orgánico.
        float bend =
            sin(time * 1.2 + fi * 1.7) * 0.18 +
            mid * 0.15 +
            wave * 0.12;

        float secondaryBend =
            sin(time * 1.8 + fi * 2.4) * 0.075;

        vec2 direction = vec2(
            cos(baseAngle),
            sin(baseAngle)
        );

        vec2 perpendicular = vec2(
            -direction.y,
            direction.x
        );

        vec2 start = direction * coreRadius * 0.80;

        vec2 end = direction * armLength;

        vec2 control =
            direction * (coreRadius + armLength) * 0.48 +
            perpendicular * bend;

        // Profundidad virtual por tentáculo.
        float depth =
            sin(fi * 2.399 + time * 0.12);

        float isFront = smoothstep(-0.05, 0.15, depth);
        float isBack = 1.0 - isFront;

        // ----------------------------------------------
        // GEOMETRÍA DEL BRAZO
        // ----------------------------------------------

        float armDistance = 10.0;
        float armT = 0.0;

        for (int j = 0; j < 14; j++) {

            float tj = float(j) / 14.0;
            float tn = float(j + 1) / 14.0;

            vec2 a = bezier(
                start,
                control,
                end,
                tj
            );

            vec2 b = bezier(
                start,
                control,
                end,
                tn
            );

            float segmentT;

            float d = segmentDistance(
                p,
                a,
                b,
                segmentT
            );

            float globalT = mix(tj, tn, segmentT);

            if (d < armDistance) {
                armDistance = d;
                armT = globalT;
            }
        }

        float armWidth =
            mix(0.020, 0.004, armT) +
            fft * 0.005;

        float armMask =
            1.0 - smoothstep(
                armWidth * 0.45,
                armWidth,
                armDistance
            );

        float armFade =
            smoothstep(0.0, 0.10, armT) *
            (1.0 - smoothstep(0.88, 1.0, armT));

        float armEnergy = armMask * armFade;

        float depthBrightness =
            mix(0.32, 1.0, isFront);

        backArms += armEnergy * isBack;
        frontArms += armEnergy * isFront;

        armColors +=
            armEnergy *
            (0.5 + fft) *
            depthBrightness;

        // Punta del tentáculo.
        float tipDistance = length(p - end);

        float tip = exp(-tipDistance * 65.0);

        frontTips += tip * isFront * (0.4 + fft);
        backTips += tip * isBack * (0.4 + fft);

        // ----------------------------------------------
        // RAMIFICACIÓN SECUNDARIA
        // ----------------------------------------------

        float branchSide =
            mix(-1.0, 1.0, hash(fi + 23.0));

        float branchStart = 0.53 + hash(fi + 5.0) * 0.18;

        vec2 branchOrigin = bezier(
            start,
            control,
            end,
            branchStart
        );

        float branchAngle =
            baseAngle +
            bend +
            branchSide * 0.45;

        vec2 branchDir = vec2(
            cos(branchAngle),
            sin(branchAngle)
        );

        vec2 branchEnd =
            branchOrigin +
            branchDir * (
                0.10 +
                mid * 0.055 +
                fft * 0.035
            );

        vec2 branchControl =
            mix(branchOrigin, branchEnd, 0.5) +
            perpendicular *
            branchSide *
            (0.035 + sin(time + fi) * 0.012);

        float branchDistance = 10.0;

        for (int k = 0; k < 7; k++) {

            float tk = float(k) / 7.0;
            float tn = float(k + 1) / 7.0;

            vec2 a = bezier(
                branchOrigin,
                branchControl,
                branchEnd,
                tk
            );

            vec2 b = bezier(
                branchOrigin,
                branchControl,
                branchEnd,
                tn
            );

            float segmentT;

            float d = segmentDistance(
                p,
                a,
                b,
                segmentT
            );

            branchDistance = min(branchDistance, d);
        }

        float branchWidth =
            0.009 + treble * 0.002;

        float branchMask =
            1.0 - smoothstep(
                branchWidth * 0.35,
                branchWidth,
                branchDistance
            );

        float branchEnergy =
            branchMask *
            (0.35 + fft + treble * 0.4);

        backBranches += branchEnergy * isBack;
        frontBranches += branchEnergy * isFront;
    }

    // --------------------------------------------------
    // 3. BRAZOS TRASEROS
    // --------------------------------------------------

    color += vec3(0.025, 0.16, 0.42) *
        backArms * 0.75;

    color += vec3(0.12, 0.12, 0.65) *
        backBranches * 0.65;

    color += vec3(0.08, 0.45, 0.9) *
        backTips * 0.5;

    // --------------------------------------------------
    // 4. ILUMINACIÓN DEL NÚCLEO
    // --------------------------------------------------

    vec3 sphereColor = sphereLighting(
        p,
        coreRadius
    );

    color = mix(
        color,
        sphereColor,
        coreMask
    );

    // Textura interna de plasma.
    float innerPattern =
        sin(angle * 8.0 + time * 1.6) *
        cos(radius * 38.0 - time * 2.0);

    float innerEnergy =
        coreMask *
        (0.5 + innerPattern * 0.16);

    color += vec3(0.025, 0.25, 0.45) *
        innerEnergy;

    // Membrana exterior brillante.
    color += vec3(0.10, 0.85, 1.0) *
        membraneRim *
        (0.4 + beat * 1.3);

    // Reflejo adicional.
    vec2 highlightPos = vec2(-0.055, 0.075);

    float highlightDist =
        length(p - highlightPos);

    float highlight =
        exp(-highlightDist * 35.0);

    color += vec3(0.35, 0.8, 1.0) *
        highlight *
        coreMask *
        0.55;

    // --------------------------------------------------
    // 5. BRAZOS DELANTEROS
    // --------------------------------------------------

    color += vec3(0.04, 0.48, 0.95) *
        frontArms * 1.1;

    color += vec3(0.30, 0.20, 1.0) *
        frontBranches * 0.9;

    color += vec3(0.10, 0.85, 1.0) *
        frontTips *
        (0.6 + beat * 0.9);

    // Núcleo de luz de los brazos.
    color += vec3(0.35, 0.85, 1.0) *
        pow(frontArms, 3.0) *
        0.65;

    // --------------------------------------------------
    // 6. FILAMENTOS ORBITALES
    // --------------------------------------------------

    float ringRadius =
        0.43 +
        sin(angle * 4.0 + time) * 0.018 +
        bass * 0.025;

    float ringDistance =
        abs(radius - ringRadius);

    float ringPattern =
        sin(angle * 12.0 - time * 2.0);

    float ring =
        exp(-ringDistance * 85.0) *
        smoothstep(-0.4, 0.4, ringPattern);

    color += vec3(0.22, 0.12, 1.0) *
        ring *
        (0.15 + mid * 0.6);

    // Anillo exterior tenue.
    float outerRing =
        exp(-abs(radius - 0.53) * 70.0);

    color += vec3(0.04, 0.25, 0.75) *
        outerRing *
        0.15;

    // --------------------------------------------------
    // 7. PARTÍCULAS ORBITALES CON PROFUNDIDAD
    // --------------------------------------------------

    float particles = 0.0;

    for (int j = 0; j < 30; j++) {

        float fj = float(j);

        float seed = hash(fj * 17.31);

        float particleAngle =
            seed * TAU +
            time * (0.12 + seed * 0.28);

        float particleRadius =
            0.29 +
            hash(fj * 4.7) * 0.32;

        particleRadius +=
            sin(time * 1.4 + fj * 2.0) * 0.025;

        particleRadius += bass * 0.04;

        vec2 particlePos = vec2(
            cos(particleAngle),
            sin(particleAngle)
        ) * particleRadius;

        float dist = length(p - particlePos);

        float size =
            0.0025 +
            hash(fj * 9.2) * 0.003;

        float particle =
            exp(-dist / size);

        float flicker =
            0.45 +
            0.55 * sin(time * 3.0 + fj * 5.0);

        particles += particle * flicker;
    }

    color += vec3(0.12, 0.7, 1.0) *
        particles *
        (0.5 + treble * 1.2);

    // --------------------------------------------------
    // 8. ONDAS DE AUDIO EN LA ATMÓSFERA
    // --------------------------------------------------

    float waveformGlow = 0.0;

    for (int i = 0; i < 3; i++) {

        float fi = float(i);

        float waveValue = audioWave(
            fract(angle / TAU + fi * 0.33)
        );

        float waveRadius =
            0.57 +
            waveValue * 0.035 * (0.3 + volume);

        float d = abs(radius - waveRadius);

        waveformGlow +=
            exp(-d * 100.0) *
            (0.25 + volume * 0.6);
    }

    color += vec3(0.04, 0.35, 0.9) *
        waveformGlow *
        0.3;

    // --------------------------------------------------
    // 9. FLASH DE BEAT
    // --------------------------------------------------

    float beatGlow =
        exp(-radius * 5.0) *
        beat;

    color += vec3(0.15, 0.38, 1.0) *
        beatGlow *
        0.6;

    // --------------------------------------------------
    // 10. ATMÓSFERA Y ACABADO
    // --------------------------------------------------

    float atmosphere =
        exp(-abs(radius - 0.23) * 5.0);

    color += vec3(0.08, 0.16, 0.8) *
        atmosphere *
        (0.08 + volume * 0.12);

    float vignette =
        1.0 - smoothstep(
            0.58,
            0.98,
            length(p)
        );

    color *= vignette;

    // Tonemapping.
    color = color / (1.0 + color);

    color = pow(
        max(color, vec3(0.0)),
        vec3(0.85)
    );

    gl_FragColor = vec4(color, 1.0);
}
