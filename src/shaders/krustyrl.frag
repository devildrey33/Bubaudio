precision highp float;

// Coordenadas UV procedentes del vertex shader
varying vec2 vUv;

// Tiempo y resolución
uniform float uTime;
uniform vec2 uResolution;

// Datos resumidos de audio
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;

// Texturas de audio
uniform sampler2D uSpectrum;   // X = frecuencia normalizada
uniform sampler2D uWaveform;   // X = tiempo, Y = amplitud

#define MAX_STEPS 100
#define MAX_DIST 80.0
#define SURF_DIST 0.001
#define PI 3.14159265359

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec2 saturate(vec2 x) { return clamp(x, 0.0, 1.0); }

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
    vec3 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCylinderY(vec3 p, float r, float h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

float opU(float a, float b) { return min(a, b); }

float opSmoothU(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Lectura estable del espectro. Las bandas se mezclan con los uniforms
// para que el shader también funcione si las texturas todavía no están cargadas.
float spectrumAt(float x) {
    float tex = texture2D(uSpectrum, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
    return max(tex, 0.0);
}

float waveformAt(float x) {
    return texture2D(uWaveform, vec2(fract(x), 0.5)).r * 2.0 - 1.0;
}

float audioPulse() {
    float spectralKick = spectrumAt(0.035) * 1.5 + spectrumAt(0.075);
    float wave = abs(waveformAt(0.73 + uTime * 0.03));
    return saturate(uBeat * 0.65 + uBass * 0.4 + uMid * 0.22 + spectralKick * 0.18 + wave * uVolume * 0.08);
}

// Construye una rueda en el eje X. Las ruedas giran visualmente mediante
// bandas radiales animadas, moduladas por graves y beat.
float wheel(vec3 p, vec3 center, float radius, float width) {
    vec3 q = p - center;
    float tire = sdCylinderY(vec3(q.z, q.y, q.x), radius, width);
    float hub = sdCylinderY(vec3(q.z, q.y, q.x), radius * 0.48, width + 0.012);
    float spin = uTime * (3.0 + uBass * 8.0) + center.z * 4.0;
    vec2 radial = vec2(cos(spin), sin(spin));
    float spoke = abs(dot(normalize(q.xz + vec2(0.0001)), radial)) - 0.12;
    float detail = max(-spoke, hub);
    return min(tire, detail);
}

// Coche deportivo: silueta baja, morro afilado y alerón trasero.
float lamborghini(vec3 p, vec3 origin) {
    vec3 q = p - origin;
    float pulse = audioPulse();
    float body = sdRoundBox(q - vec3(0.0, 0.72, 0.0), vec3(1.65, 0.34, 0.72), 0.13);
    float nose = sdRoundBox(q - vec3(1.18, 0.83, 0.0), vec3(0.70, 0.18, 0.62), 0.09);
    float cabin = sdRoundBox(q - vec3(-0.15, 1.18, 0.0), vec3(0.68, 0.35, 0.59), 0.13);
    float windshield = sdBox(q - vec3(0.30, 1.40, 0.0), vec3(0.33, 0.025, 0.51));
    float rearWing = sdBox(q - vec3(-1.36, 1.18, 0.0), vec3(0.17, 0.06, 0.78));
    float bumper = sdBox(q - vec3(1.73, 0.58, 0.0), vec3(0.12, 0.12, 0.65));
    float d = body;
    d = opSmoothU(d, nose, 0.10);
    d = opSmoothU(d, cabin, 0.08);
    d = min(d, windshield);
    d = min(d, rearWing);
    d = min(d, bumper);

    d = min(d, wheel(q, vec3(-0.98, 0.43, -0.76), 0.36 + pulse * 0.015, 0.15));
    d = min(d, wheel(q, vec3(0.98, 0.43, -0.76), 0.36 + pulse * 0.015, 0.15));
    d = min(d, wheel(q, vec3(-0.98, 0.43, 0.76), 0.36 + pulse * 0.015, 0.15));
    d = min(d, wheel(q, vec3(0.98, 0.43, 0.76), 0.36 + pulse * 0.015, 0.15));
    return d;
}

// Cybertruck: carrocería facetada y techo triangular.
float cybertruck(vec3 p, vec3 origin) {
    vec3 q = p - origin;
    float body = sdBox(q - vec3(0.0, 0.78, 0.0), vec3(1.55, 0.42, 0.76));
    float hood = sdBox(q - vec3(1.25, 1.05, 0.0), vec3(0.55, 0.18, 0.70));
    float cabin = sdBox(q - vec3(-0.20, 1.25, 0.0), vec3(0.78, 0.36, 0.68));
    float roofSlope = sdCapsule(q, vec3(-0.92, 1.48, 0.0), vec3(0.45, 1.56, 0.0), 0.11);
    float bumper = sdBox(q - vec3(1.62, 0.54, 0.0), vec3(0.13, 0.15, 0.72));
    float d = min(body, hood);
    d = min(d, cabin);
    d = min(d, roofSlope);
    d = min(d, bumper);

    d = min(d, wheel(q, vec3(-0.95, 0.43, -0.80), 0.40, 0.17));
    d = min(d, wheel(q, vec3(0.95, 0.43, -0.80), 0.40, 0.17));
    d = min(d, wheel(q, vec3(-0.95, 0.43, 0.80), 0.40, 0.17));
    d = min(d, wheel(q, vec3(0.95, 0.43, 0.80), 0.40, 0.17));
    return d;
}

// Optimus Prime mezcla una silueta de camión con una silueta humanoide.
// El parámetro transform va de 0 (coche) a 1 (robot).
float optimus(vec3 p, vec3 origin) {
    vec3 q = p - origin;
    float transform = 0.5 + 0.5 * sin(uTime * 0.8 + uBeat * 2.2);
    transform = smoothstep(0.30, 0.72, transform);
    transform = mix(transform, 1.0, saturate(uBeat * 0.55));

    float truck = sdRoundBox(q - vec3(0.0, 0.82, 0.0), vec3(1.40, 0.46, 0.76), 0.12);
    truck = min(truck, sdBox(q - vec3(0.72, 1.36, 0.0), vec3(0.52, 0.34, 0.66)));
    truck = min(truck, wheel(q, vec3(-0.85, 0.43, -0.80), 0.42, 0.17));
    truck = min(truck, wheel(q, vec3(0.85, 0.43, -0.80), 0.42, 0.17));
    truck = min(truck, wheel(q, vec3(-0.85, 0.43, 0.80), 0.42, 0.17));
    truck = min(truck, wheel(q, vec3(0.85, 0.43, 0.80), 0.42, 0.17));

    float head = sdRoundBox(q - vec3(0.0, 2.65, 0.0), vec3(0.38, 0.34, 0.34), 0.06);
    float torso = sdRoundBox(q - vec3(0.0, 1.78, 0.0), vec3(0.52, 0.68, 0.30), 0.08);
    float leftArm = sdCapsule(q, vec3(-0.57, 2.10, 0.0), vec3(-0.92, 1.18, 0.0), 0.18);
    float rightArm = sdCapsule(q, vec3(0.57, 2.10, 0.0), vec3(0.92, 1.18, 0.0), 0.18);
    float leftLeg = sdCapsule(q, vec3(-0.27, 1.18, 0.0), vec3(-0.34, 0.28, 0.0), 0.22);
    float rightLeg = sdCapsule(q, vec3(0.27, 1.18, 0.0), vec3(0.34, 0.28, 0.0), 0.22);
    float robot = head;
    robot = min(robot, torso);
    robot = min(robot, min(leftArm, rightArm));
    robot = min(robot, min(leftLeg, rightLeg));

    return mix(truck, robot, transform);
}

struct SceneHit {
    float d;
    float id;
};

SceneHit mapScene(vec3 p) {
    SceneHit h;
    h.d = p.y + 0.02;
    h.id = 1.0;

    // Pista elevada y bandas laterales.
    float track = p.y + 0.02;
    float sideLeft = sdBox(p - vec3(0.0, 0.11, -3.35), vec3(12.0, 0.10, 0.16));
    float sideRight = sdBox(p - vec3(0.0, 0.11, 3.35), vec3(12.0, 0.10, 0.16));
    h.d = min(track, min(sideLeft, sideRight));
    h.id = track < h.d + 0.001 ? 1.0 : 2.0;

    float a = lamborghini(p, vec3(-4.0, 0.0, -1.35));
    if (a < h.d) { h.d = a; h.id = 10.0; }
    float c = cybertruck(p, vec3(0.0, 0.0, 1.35));
    if (c < h.d) { h.d = c; h.id = 11.0; }
    float o = optimus(p, vec3(4.0, 0.0, 0.0));
    if (o < h.d) { h.d = o; h.id = 12.0; }

    // Pelota desplazándose por la pista, impulsada por graves y beat.
    float ballX = sin(uTime * 0.75) * 5.2;
    float ballZ = sin(uTime * 1.13) * 2.25;
    float ballY = 0.55 + abs(sin(uTime * 2.2)) * (0.15 + uBass * 0.45) + uBeat * 0.18;
    float ball = sdSphere(p - vec3(ballX, ballY, ballZ), 0.28 + uBeat * 0.035);
    if (ball < h.d) { h.d = ball; h.id = 20.0; }
    return h;
}

SceneHit march(vec3 ro, vec3 rd) {
    float t = 0.0;
    SceneHit h;
    h.d = 0.0;
    h.id = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * t;
        h = mapScene(p);
        if (h.d < SURF_DIST || t > MAX_DIST) break;
        t += h.d * 0.72;
    }
    h.d = t;
    return h;
}

vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.002, 0.0);
    return normalize(vec3(
        mapScene(p + e.xyy).d - mapScene(p - e.xyy).d,
        mapScene(p + e.yxy).d - mapScene(p - e.yxy).d,
        mapScene(p + e.yyx).d - mapScene(p - e.yyx).d
    ));
}

float softShadow(vec3 ro, vec3 rd) {
    float res = 1.0;
    float t = 0.05;
    for (int i = 0; i < 28; i++) {
        float h = mapScene(ro + rd * t).d;
        res = min(res, 12.0 * h / t);
        t += clamp(h, 0.02, 0.25);
        if (h < 0.001 || t > 12.0) break;
    }
    return saturate(res);
}

vec3 materialColor(float id, vec3 p) {
    float pulse = audioPulse();
    if (id > 9.5 && id < 10.5) {
        // Lamborghini amarillo neón con paneles oscuros.
        float panel = step(0.65, noise21(p.xz * 5.0));
        return mix(vec3(1.0, 0.33, 0.015), vec3(0.045, 0.012, 0.008), panel * 0.55) * (1.0 + pulse * 0.25);
    }
    if (id > 10.5 && id < 11.5) {
        // Cybertruck cromado con reflejo azulado.
        return vec3(0.33, 0.48, 0.58) + vec3(0.14, 0.18, 0.21) * noise21(p.xy * 8.0);
    }
    if (id > 11.5 && id < 12.5) {
        // Optimus azul, rojo y metálico según zonas de la superficie.
        float red = step(0.48, fract(p.x * 1.7 + p.y * 0.55));
        return mix(vec3(0.015, 0.12, 0.48), vec3(0.68, 0.035, 0.02), red * 0.72);
    }
    if (id > 19.5) {
        float seam = step(0.48, fract(p.x * 4.5 + p.y * 3.0 + p.z * 2.0));
        return mix(vec3(0.96), vec3(0.04), seam);
    }
    if (id < 1.5) {
        float lane = smoothstep(0.08, 0.0, abs(fract(p.x * 0.22) - 0.5));
        return mix(vec3(0.025, 0.032, 0.055), vec3(0.16, 0.20, 0.25), lane);
    }
    return vec3(0.05, 0.18, 0.25);
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
    float pulse = audioPulse();

    // Cámara orbital lenta; el beat produce un pequeño golpe de cámara.
    float camAngle = 0.14 * sin(uTime * 0.18) + uBeat * 0.025;
    vec3 ro = vec3(0.0, 4.0 + pulse * 0.35, 10.5 - pulse * 0.45);
    vec3 target = vec3(0.0, 1.05 + uBass * 0.08, 0.0);
    ro.xz = mat2(cos(camAngle), -sin(camAngle), sin(camAngle), cos(camAngle)) * ro.xz;
    target.xz = mat2(cos(camAngle), -sin(camAngle), sin(camAngle), cos(camAngle)) * target.xz;

    vec3 f = normalize(target - ro);
    vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(r, f);
    vec3 rd = normalize(f + r * uv.x * 0.72 + up * uv.y * 0.72);

    SceneHit hit = march(ro, rd);
    vec3 col;
    if (hit.d > MAX_DIST) {
        float horizon = saturate(rd.y * 0.5 + 0.5);
        col = mix(vec3(0.008, 0.012, 0.035), vec3(0.08, 0.20, 0.32), horizon);
        col += vec3(0.04, 0.11, 0.20) * pow(max(0.0, 1.0 - abs(rd.y)), 5.0);
    } else {
        vec3 p = ro + rd * hit.d;
        vec3 n = calcNormal(p);
        vec3 lightPos = vec3(-4.0, 8.0, 4.0);
        vec3 l = normalize(lightPos - p);
        float diff = max(dot(n, l), 0.0);
        float shadow = softShadow(p + n * 0.02, l);
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        vec3 base = materialColor(hit.id, p);
        vec3 ambient = vec3(0.035, 0.055, 0.10);
        col = base * (ambient + diff * shadow * vec3(1.2, 1.05, 0.9));
        col += rim * vec3(0.08, 0.28, 0.55) * (1.0 + uTreble * 0.8);

        // Aros de energía sobre la pista sincronizados con el beat.
        float ring = abs(length(p.xz) - (3.0 + pulse * 0.4));
        col += exp(-ring * 14.0) * vec3(0.06, 0.36, 0.72) * pulse;
    }

    // Viñeta y ligera respuesta de exposición al volumen.
    float vignette = 1.0 - 0.30 * smoothstep(0.35, 1.35, length(uv));
    col *= vignette;
    col *= 1.0 + uVolume * 0.18 + uBeat * 0.08;
    col = 1.0 - exp(-col * 1.35);
    col = pow(col, vec3(0.92));

    gl_FragColor = vec4(col, 1.0);
}
