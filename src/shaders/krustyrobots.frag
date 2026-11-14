#ifdef GL_ES
precision highp float;
#endif

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
#define MAX_STEPS 96
#define MAX_DIST 35.0
#define SURF_EPS 0.002

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec2 saturate(vec2 x) { return clamp(x, 0.0, 1.0); }

// Muestreos suaves y deliberadamente compatibles con texturas 1D empacadas en 2D.
float spectrum(float x) {
    return texture2D(uSpectrum, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
}

float waveform(float x) {
    return texture2D(uWaveform, vec2(fract(x), 0.5)).r * 2.0 - 1.0;
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

float opU(float a, float b) { return min(a, b); }
float opS(float a, float b) { return max(a, -b); }

vec3 repeatX(vec3 p, float spacing) {
    p.x = mod(p.x + spacing * 0.5, spacing) - spacing * 0.5;
    return p;
}

// Robot individual: cabeza, torso, brazos, piernas y teclado.
float robot(vec3 p, float phase, out float material) {
    float beatPulse = 1.0 + uBeat * 0.10;
    float dance = sin(uTime * (2.0 + uMid * 3.0) + phase) * (0.035 + uBass * 0.08);
    p.y -= dance;
    p.x += sin(uTime * 1.7 + phase) * (0.04 + uMid * 0.06);

    // El frente del robot está definido hacia -Z. La cámara está en +Z,
    // por lo que invertimos Z para que ojos, brazos y teclado la miren.
    p.z = -p.z;

    float d = 100.0;
    material = 1.0;

    // Piernas articuladas.
    vec3 q = p;
    q.y -= 0.58;
    float stepL = sin(uTime * (2.2 + uBass * 2.0) + phase) * (0.045 + uBeat * 0.04);
    float stepR = sin(uTime * (2.2 + uBass * 2.0) + phase + PI) * (0.045 + uBeat * 0.04);
    float legL = sdCapsule(q, vec3(-0.18, 0.0, 0.0), vec3(-0.16, 0.48 + stepL, 0.0), 0.105);
    float legR = sdCapsule(q, vec3( 0.18, 0.0, 0.0), vec3( 0.16, 0.48 + stepR, 0.0), 0.105);
    d = opU(d, min(legL, legR));
    float kneeL = sdSphere(p - vec3(-0.17, 0.58 + stepL, 0.0), 0.13);
    float kneeR = sdSphere(p - vec3( 0.17, 0.58 + stepR, 0.0), 0.13);
    d = opU(d, min(kneeL, kneeR));

    // Torso con ligera deformación al beat.
    q = p;
    q.y -= 1.05;
    q.x *= 1.0 + 0.04 * sin(uTime * 5.0 + phase) * uBeat;
    d = opU(d, sdBox(q, vec3(0.34 * beatPulse, 0.38, 0.22)));

    // Cabeza y antena.
    q = p;
    q.y -= 1.65;
    d = opU(d, sdBox(q, vec3(0.30, 0.27, 0.25)));
    d = opU(d, sdBox(p - vec3(0.0, 1.65, -0.255), vec3(0.19, 0.075, 0.018)));
    d = opU(d, sdCapsule(p, vec3(-0.30, 1.72, 0.0), vec3(-0.36, 1.62, 0.0), 0.045));
    d = opU(d, sdCapsule(p, vec3( 0.30, 1.72, 0.0), vec3( 0.36, 1.62, 0.0), 0.045));
    d = opU(d, sdSphere(p - vec3(0.0, 1.99, 0.0), 0.065));
    d = opU(d, sdCapsule(p, vec3(0.0, 1.90, 0.0), vec3(0.0, 2.02, 0.0), 0.018));

    // Ojos como pequeñas formas SDF separadas.
    float eyeL = sdSphere(p - vec3(-0.12, 1.69, -0.235), 0.065);
    float eyeR = sdSphere(p - vec3( 0.12, 1.69, -0.235), 0.065);
    if (min(eyeL, eyeR) < d) {
        d = min(eyeL, eyeR);
        material = 2.0;
    }

    // Brazos articulados: hombro, codo y mano golpean el teclado al ritmo.
    float tapL = sin(uTime * (5.0 + uTreble * 4.0) + phase) * (0.035 + uBeat * 0.05);
    float tapR = sin(uTime * (5.0 + uTreble * 4.0) + phase + PI * 0.7) * (0.035 + uBeat * 0.05);
    vec3 elbowL = vec3(-0.57, 1.02 + tapL, -0.17);
    vec3 elbowR = vec3( 0.57, 1.02 + tapR, -0.17);
    vec3 handL = vec3(-0.48, 0.83 + tapL, -0.34);
    vec3 handR = vec3( 0.48, 0.83 + tapR, -0.34);
    float armL = sdCapsule(p, vec3(-0.37, 1.32, 0.0), elbowL, 0.085);
    float armR = sdCapsule(p, vec3( 0.37, 1.32, 0.0), elbowR, 0.085);
    float forearmL = sdCapsule(p, elbowL, handL, 0.075);
    float forearmR = sdCapsule(p, elbowR, handR, 0.075);
    d = opU(d, min(min(armL, armR), min(forearmL, forearmR)));
    d = opU(d, min(sdSphere(p - vec3(-0.37, 1.32, 0.0), 0.12), sdSphere(p - vec3(0.37, 1.32, 0.0), 0.12)));
    d = opU(d, min(sdSphere(p - elbowL, 0.105), sdSphere(p - elbowR, 0.105)));
    d = opU(d, min(sdSphere(p - handL, 0.075), sdSphere(p - handR, 0.075)));

    // Cuello mecánico y placas de hombro.
    d = opU(d, sdCapsule(p, vec3(0.0, 1.40, 0.0), vec3(0.0, 1.50, 0.0), 0.12));
    d = opU(d, min(sdSphere(p - vec3(-0.37, 1.35, 0.0), 0.14), sdSphere(p - vec3(0.37, 1.35, 0.0), 0.14)));

    // Teclado delante del robot, con teclas ondulantes por graves.
    q = p;
    q.y -= 0.73;
    q.z += 0.37;
    q.x *= 1.0 + 0.12 * uBass;
    float keyboard = sdBox(q, vec3(0.46, 0.055 + uBeat * 0.025, 0.16));
    if (keyboard < d) {
        d = keyboard;
        material = 3.0;
    }

    // Pequeño indicador del pecho reactivo a medios/agudos.
    float badge = sdSphere(p - vec3(0.0, 1.08, -0.235), 0.09 + uTreble * 0.035);
    if (badge < d) {
        d = badge;
        material = 2.0;
    }

    return d;
}

// OVNI que cruza el cielo periódicamente. El ciclo deja pausas visibles
// entre pasadas para que aparezca "de vez en cuando".
float ufo(vec3 p, float phase, out float material) {
    float cycle = 15.0;
    float localTime = mod(uTime + phase, cycle);
    float pass = smoothstep(0.0, 0.8, localTime) * (1.0 - smoothstep(8.8, 10.0, localTime));
    if (pass <= 0.001) {
        material = 0.0;
        return 100.0;
    }

    float flight = smoothstep(0.0, 1.0, localTime / 9.0);
    vec3 center = vec3(mix(-8.5, 8.5, flight), 5.0 + sin(localTime * 1.15 + phase) * 0.28, -2.0);
    vec3 q = p - center;
    q.xz = mat2(cos(phase * 0.7), -sin(phase * 0.7), sin(phase * 0.7), cos(phase * 0.7)) * q.xz;

    // Cuerpo achatado y cúpula superior.
    vec3 bodyQ = q;
    bodyQ.y *= 2.6;
    float body = sdSphere(bodyQ, 0.58);
    float dome = sdSphere(q - vec3(0.0, 0.20, 0.0), 0.30);
    float d = min(body, dome);
    material = body < dome ? 7.0 : 8.0;

    // Anillo de luces alrededor del fuselaje.
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float a = fi * PI * 0.25 + uTime * 2.0;
        vec3 lamp = vec3(cos(a) * 0.42, -0.04, sin(a) * 0.42);
        float lampD = sdSphere(q - lamp, 0.075 + uBeat * 0.018);
        if (lampD < d) {
            d = lampD;
            material = 9.0;
        }
    }

    // La intensidad de la geometría se desvanece al entrar y salir.
    return d / max(pass, 0.001);
}

// Altavoz lateral orientado hacia la cámara.
float speaker(vec3 p, vec3 center, out float material) {
    vec3 q = p - center;
    float body = sdBox(q, vec3(0.48, 0.90, 0.30));
    float woofer = sdSphere(q - vec3(0.0, -0.20, 0.31), 0.27 + uBass * 0.07);
    float tweeter = sdSphere(q - vec3(0.0, 0.39, 0.31), 0.105 + uTreble * 0.025);
    float d = body;
    material = 50.0;
    if (woofer < d) { d = woofer; material = 51.0; }
    if (tweeter < d) { d = tweeter; material = 52.0; }
    return d;
}

float mapScene(vec3 p, out float material) {
    float d = 100.0;
    material = 0.0;

    // Suelo / pista de baile.
    float floorD = p.y + 0.03;
    d = floorD;
    material = 4.0;

    // Tres robots en posiciones distintas y con colores visualmente diferenciados por fase.
    vec3 r1 = p - vec3(-1.75, 0.0, 0.0);
    vec3 r2 = p - vec3( 0.0, 0.0, 0.18);
    vec3 r3 = p - vec3( 1.75, 0.0, 0.0);
    float m;
    float d1 = robot(r1, 0.0, m); if (d1 < d) { d = d1; material = m + 10.0; }
    float d2 = robot(r2, 2.1, m); if (d2 < d) { d = d2; material = m + 20.0; }
    float d3 = robot(r3, 4.2, m); if (d3 < d) { d = d3; material = m + 30.0; }

    // Pasadas ocasionales por el cielo, alternadas con una segunda ruta.
    float skyUfo1 = ufo(p, 0.0, m); if (skyUfo1 < d) { d = skyUfo1; material = m; }
    float skyUfo2 = ufo(p, 7.5, m); if (skyUfo2 < d) { d = skyUfo2; material = m; }

    // Dos altavoces a los lados de la pista.
    float speakerL = speaker(p, vec3(-3.25, 0.92, 0.15), m);
    if (speakerL < d) { d = speakerL; material = m; }
    float speakerR = speaker(p, vec3( 3.25, 0.92, 0.15), m);
    if (speakerR < d) { d = speakerR; material = m; }

    // Bola de discoteca suspendida sobre el centro.
    vec3 disco = p - vec3(0.0, 3.65 + uBass * 0.10, 0.75);
    disco.xz = mat2(cos(uTime * 0.35), -sin(uTime * 0.35), sin(uTime * 0.35), cos(uTime * 0.35)) * disco.xz;
    float ball = sdSphere(disco, 0.48 + uBeat * 0.07);
    if (ball < d) { d = ball; material = 5.0; }

    // Cable/cuerda de la bola.
    float cable = sdCapsule(p, vec3(0.0, 4.1, 0.75), vec3(0.0, 6.0, 0.75), 0.012);
    if (cable < d) { d = cable; material = 6.0; }

    return d;
}

vec3 calcNormal(vec3 p) {
    float m;
    vec2 e = vec2(0.0015, 0.0);
    return normalize(vec3(
        mapScene(p + e.xyy, m) - mapScene(p - e.xyy, m),
        mapScene(p + e.yxy, m) - mapScene(p - e.yxy, m),
        mapScene(p + e.yyx, m) - mapScene(p - e.yyx, m)
    ));
}

float rayMarch(vec3 ro, vec3 rd, out vec3 hitPos, out float material) {
    float t = 0.0;
    material = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        hitPos = ro + rd * t;
        float m;
        float d = mapScene(hitPos, m);
        material = m;
        if (d < SURF_EPS) return t;
        t += d * 0.78;
        if (t > MAX_DIST) break;
    }
    return MAX_DIST;
}

vec3 palette(float t) {
    vec3 a = vec3(0.10, 0.08, 0.18);
    vec3 b = vec3(0.55, 0.35, 0.65);
    vec3 c = vec3(1.0, 0.80, 0.55);
    vec3 d = vec3(0.0, 0.25, 0.55);
    return a + b * cos(2.0 * PI * (c * t + d));
}

// Haces de luz de la bola proyectados sobre el suelo.
vec3 discoFloorBeams(vec3 p, float pulse) {
    vec3 center = vec3(0.0, 3.65 + uBass * 0.10, 0.75);
    float spin = uTime * (0.85 + uMid * 1.6);
    vec3 colors[3];
    colors[0] = vec3(1.0, 0.04, 0.12);
    colors[1] = vec3(0.06, 0.45, 1.0);
    colors[2] = vec3(0.65, 0.05, 1.0);
    vec3 result = vec3(0.0);
    for (int i = 0; i < 3; i++) {
        float a = spin + float(i) * 2.094;
        vec3 spot = center + vec3(cos(a) * 0.42, 0.0, sin(a) * 0.42);
        vec2 projected = spot.xz + vec2(cos(a), sin(a)) * (1.25 + uBass * 0.35);
        float radius = 0.32 + uBeat * 0.18 + uVolume * 0.12;
        float beam = exp(-dot(p.xz - projected, p.xz - projected) / max(radius * radius, 0.001));
        float sweep = 0.65 + 0.35 * sin(uTime * 7.0 + float(i) * 2.094);
        result += colors[i] * beam * sweep * (0.8 + pulse * 2.4);
    }
    return result;
}

float fireworkBurst(vec2 p, vec2 center, float t, float seed, out vec3 color) {
    float age = fract(t);
    float appear = smoothstep(0.02, 0.10, age) * (1.0 - smoothstep(0.72, 1.0, age));
    float radius = age * (0.15 + 0.10 * sin(seed * 4.0));
    vec2 delta = p - center;
    float r = length(delta);
    float ring = exp(-abs(r - radius) * 85.0);
    float angle = atan(delta.y, delta.x);
    float spokes = pow(max(0.0, cos(angle * (7.0 + floor(seed * 5.0)))), 28.0);
    float sparkle = ring * (0.28 + spokes * 1.8) * appear;
    color = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + seed * 5.0);
    return sparkle;
}

vec3 fireworks(vec2 uv, float time, float energy) {
    // Se dibujan detrás de la escena, en la parte alta del encuadre.
    vec2 p = uv * vec2(0.95, 1.0);
    vec3 result = vec3(0.0);
    for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float cycle = 5.6 + fi * 0.47;
        float local = time / cycle + fi * 0.37;
        float seed = hash21(vec2(fi, 11.7));
        vec2 center = vec2(-0.72 + fi * 0.36, 0.34 + seed * 0.25);
        center.x += sin(time * (0.12 + seed * 0.10) + fi) * 0.08;
        vec3 color;
        float intensity = fireworkBurst(p, center, local, seed + fi, color);
        result += color * intensity * (0.22 + energy * 0.9);
    }
    return result;
}

void main() {
    vec2 uv = (vUv - 0.5) * 2.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    uv.x *= aspect;

    float bassTex = spectrum(0.08 + uBass * 0.04);
    float midTex = spectrum(0.28 + uMid * 0.08);
    float highTex = spectrum(0.72 + uTreble * 0.06);
    float wave = waveform(vUv.x * 0.82 + uTime * 0.06);
    float energy = saturate(0.34 * uBass + 0.28 * uMid + 0.18 * uTreble + 0.20 * uVolume);
    float pulse = saturate(uBeat * 0.72 + bassTex * 0.20 + abs(wave) * 0.08);

    // Cámara con leve balanceo musical.
    vec3 ro = vec3(0.0, 1.62 + sin(uTime * 0.7) * 0.025 * uVolume, 6.7);
    vec3 target = vec3(0.0, 1.25 + sin(uTime * 0.45) * 0.04, 0.45);
    vec3 ww = normalize(target - ro);
    vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
    vec3 vv = cross(ww, uu);
    vec3 rd = normalize(uu * uv.x + vv * uv.y + ww * 1.65);

    vec3 hitPos;
    float material;
    float t = rayMarch(ro, rd, hitPos, material);

    // Fondo neon con rayos radiales y grano suave.
    vec3 col = vec3(0.012, 0.008, 0.035);
    float horizon = exp(-2.8 * max(rd.y, 0.0));
    col += vec3(0.04, 0.015, 0.12) * horizon;
    col += vec3(0.015, 0.035, 0.10) * (0.5 + 0.5 * sin(uv.x * 6.0 + uTime));
    col += fireworks(uv, uTime, energy);

    if (t < MAX_DIST) {
        vec3 n = calcNormal(hitPos);
        vec3 light1 = normalize(vec3(-2.5, 4.5, 3.0));
        vec3 light2 = normalize(vec3( 3.0, 2.5, 1.0));
        float diff1 = max(dot(n, light1), 0.0);
        float diff2 = max(dot(n, light2), 0.0);
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        // Tres focos RGB montados dentro de la bola de discoteca.
        // Se mueven alrededor de la esfera y reaccionan a beat/graves.
        vec3 discoCenter = vec3(0.0, 3.65 + uBass * 0.10, 0.75);
        float spin = uTime * (0.85 + uMid * 1.6);
        vec3 spotPosA = discoCenter + vec3(cos(spin) * 0.42, 0.02, sin(spin) * 0.42);
        vec3 spotPosB = discoCenter + vec3(cos(spin + 2.094) * 0.42, 0.02, sin(spin + 2.094) * 0.42);
        vec3 spotPosC = discoCenter + vec3(cos(spin + 4.188) * 0.42, 0.02, sin(spin + 4.188) * 0.42);
        vec3 spotColorA = vec3(1.0, 0.08, 0.18);
        vec3 spotColorB = vec3(0.08, 0.55, 1.0);
        vec3 spotColorC = vec3(0.55, 0.08, 1.0);

        vec3 toA = spotPosA - hitPos;
        vec3 toB = spotPosB - hitPos;
        vec3 toC = spotPosC - hitPos;
        float lightA = max(dot(n, normalize(toA)), 0.0) / (1.0 + dot(toA, toA) * 0.16);
        float lightB = max(dot(n, normalize(toB)), 0.0) / (1.0 + dot(toB, toB) * 0.16);
        float lightC = max(dot(n, normalize(toC)), 0.0) / (1.0 + dot(toC, toC) * 0.16);
        vec3 discoLights = (spotColorA * lightA + spotColorB * lightB + spotColorC * lightC)
                         * (1.25 + pulse * 2.8);

        vec3 base;
        if (material >= 10.0 && material < 40.0) {
            float robotId = floor(material / 10.0);
            base = palette(robotId * 0.24 + energy * 0.12);
            if (mod(material, 10.0) == 2.0) base = vec3(0.05, 0.95, 1.0);
            if (mod(material, 10.0) == 3.0) base = vec3(0.10, 0.18, 0.28);
        } else if (material == 4.0) {
            vec2 tile = floor(hitPos.xz * 1.7);
            float checker = mod(tile.x + tile.y, 2.0);
            base = mix(vec3(0.035, 0.015, 0.09), vec3(0.08, 0.025, 0.15), checker);
            float grid = smoothstep(0.92, 1.0, max(abs(fract(hitPos.x * 1.7) - 0.5), abs(fract(hitPos.z * 1.7) - 0.5)) * 2.0);
            base += grid * vec3(0.05, 0.2, 0.45) * (1.0 + pulse * 2.0);
        } else if (material == 5.0) {
            vec3 tileN = normalize(n);
            float mirror = step(0.50, fract((atan(tileN.x, tileN.z) + uTime * 0.35) * 7.0 + tileN.y * 11.0));
            // Mosaicos reflectantes con destellos RGB sincronizados al beat.
            vec3 discoTint = spotColorA * (0.5 + 0.5 * sin(spin * 2.0))
                           + spotColorB * (0.5 + 0.5 * sin(spin * 2.0 + 2.094))
                           + spotColorC * (0.5 + 0.5 * sin(spin * 2.0 + 4.188));
            base = mix(vec3(0.12, 0.18, 0.35), vec3(0.75, 0.90, 1.0), mirror);
            base += discoTint * (0.16 + pulse * 0.35);
            base *= 1.0 + pulse * 1.5;
        } else if (material == 6.0) {
            base = vec3(0.3, 0.7, 1.0);
        } else if (material == 7.0) {
            base = vec3(0.16, 0.20, 0.30);
        } else if (material == 8.0) {
            base = vec3(0.18, 0.75, 0.92);
        } else if (material == 9.0) {
            float blink = 0.5 + 0.5 * sin(uTime * 8.0 + hitPos.x * 3.0);
            base = mix(vec3(1.0, 0.04, 0.08), vec3(0.12, 0.45, 1.0), step(0.5, blink));
        } else if (material == 50.0) {
            base = vec3(0.025, 0.018, 0.045);
        } else if (material == 51.0) {
            base = vec3(0.06, 0.09, 0.14);
        } else if (material == 52.0) {
            base = vec3(0.20, 0.75, 1.0);
        } else {
            base = vec3(0.13, 0.10, 0.23);
        }

        // Materiales emisivos: ojos, badge y teclas.
        float emissive = 0.0;
        if (mod(material, 10.0) == 2.0) emissive = 2.0 + uTreble * 3.0;
        if (mod(material, 10.0) == 3.0) emissive = 0.25 + uBass * 1.6;
        if (material == 5.0) emissive += 0.2 + uBeat * 1.8;
        if (material == 8.0) emissive += 0.55 + uTreble * 1.2;
        if (material == 9.0) emissive += 2.0 + uBeat * 3.5;
        if (material == 51.0) emissive += 0.25 + uBass * 1.6 + uVolume * 0.6;
        if (material == 52.0) emissive += 0.8 + uTreble * 1.8;

        vec3 lighting = base * (0.18 + diff1 * 0.72 + diff2 * 0.35);
        lighting += vec3(0.12, 0.55, 1.0) * rim * (0.22 + energy * 0.8);
        lighting += discoLights;
        if (material == 4.0) lighting += discoFloorBeams(hitPos, pulse);
        lighting += base * emissive;
        col = lighting;
    }

    float vignette = 1.0 - 0.22 * dot(vUv - 0.5, vUv - 0.5);
    col *= vignette;
    col += (hash21(gl_FragCoord.xy + uTime) - 0.5) * 0.008;
    col = pow(max(col, 0.0), vec3(0.88));

    gl_FragColor = vec4(col, 1.0);
}
