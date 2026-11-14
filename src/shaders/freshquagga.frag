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
uniform sampler2D uWaveform;   // Forma de onda (X = tiempo, Y = amplitud)

#define PI 3.14159265359

float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}

vec2 saturate(vec2 x) {
    return clamp(x, 0.0, 1.0);
}

// El espectro suele venir en una textura horizontal de 1 píxel de alto.
// Se leen varias bandas para añadir detalle fino al movimiento.
float spectrumAt(float x) {
    return texture2D(uSpectrum, vec2(clamp(x, 0.002, 0.998), 0.5)).r;
}

float waveformAt(float x) {
    // Compatible con texturas de waveform horizontales.
    return texture2D(uWaveform, vec2(fract(x), 0.5)).r;
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float sdCircle(vec2 p, float radius) {
    return length(p) - radius;
}

float sdEllipse(vec2 p, vec2 radius) {
    return length(p / radius) - 1.0;
}

float sdBox(vec2 p, vec2 b, float roundness) {
    vec2 q = abs(p) - b + roundness;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - roundness;
}

float softShape(float distanceToShape, float blur) {
    return 1.0 - smoothstep(-blur, blur, distanceToShape);
}

// Segmento redondeado para brazos y bastón.
float sdSegment(vec2 p, vec2 a, vec2 b, float radius) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - radius;
}

// Traza vertical de osciloscopio basada en la textura de waveform.
float oscilloscope(vec2 p, float xOffset, float phase) {
    float result = 0.0;
    for (int i = 0; i < 12; i++) {
        float fi = float(i);
        float y0 = -0.72 + fi * 0.105;
        float y1 = y0 + 0.105;
        float w0 = (waveformAt(fi / 12.0 + phase + uTime * 0.025) - 0.5) * 2.0;
        float w1 = (waveformAt((fi + 1.0) / 12.0 + phase + uTime * 0.025) - 0.5) * 2.0;
        float a0 = w0 * (0.045 + uBeat * 0.075);
        float a1 = w1 * (0.045 + uBeat * 0.075);
        result = max(result, softShape(sdSegment(
            p,
            vec2(xOffset + a0, y0),
            vec2(xOffset + a1, y1),
            0.008 + uBeat * 0.006
        ), 0.008));
    }
    return result;
}

// Contorno exterior del triángulo de la túnica.
float robeShape(vec2 p) {
    vec2 a = vec2(0.0, -0.02);
    vec2 b = vec2(-0.42, -0.76);
    vec2 c = vec2(0.42, -0.76);

    vec2 e0 = b - a;
    vec2 e1 = c - b;
    vec2 e2 = a - c;
    vec2 q0 = p - a;
    vec2 q1 = p - b;
    vec2 q2 = p - c;

    float s0 = e0.x * q0.y - e0.y * q0.x;
    float s1 = e1.x * q1.y - e1.y * q1.x;
    float s2 = e2.x * q2.y - e2.y * q2.x;
    float inside = step(0.0, min(min(s0, s1), s2));

    float d0 = abs(s0) / length(e0);
    float d1 = abs(s1) / length(e1);
    float d2 = abs(s2) / length(e2);
    float edgeDistance = min(d0, min(d1, d2));
    return mix(edgeDistance, -edgeDistance, inside);
}

// Aura atmosférica de la esfera.
float energyAura(vec2 p, vec2 center, float radius) {
    float d = length(p - center);
    float core = exp(-pow(d / max(radius, 0.001), 2.0) * 3.0);
    float halo = exp(-pow(d / max(radius * 2.5, 0.001), 2.0) * 1.3);
    return core + halo * 0.48;
}

void main() {
    // Corrección de aspecto para que el personaje no se deforme.
    vec2 p = vUv * 2.0 - 1.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    p.x *= aspect;

    float t = uTime;
    float bass = saturate(uBass);
    float mid = saturate(uMid);
    float treble = saturate(uTreble);
    float volume = saturate(uVolume);
    float beat = saturate(uBeat);

    // Detalle de audio de las texturas.
    float spectrumHigh = (
        spectrumAt(0.70) +
        spectrumAt(0.78) +
        spectrumAt(0.86) +
        spectrumAt(0.94)
    ) * 0.25;

    float spectrumLow = (
        spectrumAt(0.04) +
        spectrumAt(0.10) +
        spectrumAt(0.18)
    ) * 0.3333;

    float waveA = waveformAt(0.17 + t * 0.035);
    float waveB = waveformAt(0.47 + t * 0.035);
    float waveC = waveformAt(0.73 + t * 0.035);
    float waveformEnergy = abs((waveA + waveB + waveC) / 3.0 - 0.5) * 2.0;

    float highEnergy = saturate(treble * 0.68 + spectrumHigh * 0.25 + waveformEnergy * 0.07);
    float lowEnergy = saturate(bass * 0.68 + spectrumLow * 0.25 + volume * 0.07);

    // La bola crece principalmente con los agudos, con una expansión adicional en el beat.
    float orbRadius = 0.135 + highEnergy * 0.115 + beat * 0.035;
    float orbBob = sin(t * 2.0) * (0.008 + mid * 0.018) + beat * 0.018;
    vec2 orb = vec2(0.0, 0.69 + orbBob);

    // Fondo azul oscuro con viñeta y ondas muy sutiles.
    float radial = 1.0 - smoothstep(0.10, 1.35, length(p * vec2(0.72, 0.90)));
    float stars = 0.5 + 0.5 * sin(p.x * 45.0 + sin(p.y * 23.0) + t * 0.22);
    float breathing = 0.5 + 0.5 * sin(t * 0.7);
    vec3 color = mix(vec3(0.004, 0.008, 0.035), vec3(0.015, 0.035, 0.13), radial);
    color += vec3(0.015, 0.025, 0.09) * pow(stars, 18.0) * (0.25 + treble * 0.7);

    // Aura detrás del personaje.
    float mageGlow = exp(-length(p * vec2(0.82, 0.68)) * 2.0);
    color += vec3(0.018, 0.035, 0.17) * mageGlow * (0.45 + bass * 0.8);

    // Partículas flotantes: el beat expande el enjambre y hace crecer su halo.
    for (int i = 0; i < 20; i++) {
        float fi = float(i);
        float seed = hash21(vec2(fi + 2.7, fi * 4.13 + 0.8));
        float seed2 = hash21(vec2(fi * 1.91 + 8.1, fi + 3.4));
        float angle = seed * 6.28318 + t * (0.10 + seed2 * 0.24);
        float radius = (0.42 + seed2 * 0.42) * (1.0 + beat * 0.15);
        vec2 particlePos = vec2(
            cos(angle) * radius * 0.82,
            -0.02 + sin(angle * (0.7 + seed)) * radius * 0.92
        );
        particlePos.y += sin(t * (0.8 + seed) + seed2 * 6.0) * 0.045;
        float particleSize = 0.004 + seed * 0.009 + beat * 0.010;
        float particle = softShape(sdCircle(p - particlePos, particleSize), 0.010 + beat * 0.005);
        color += vec3(0.10, 0.34, 0.95) * particle * (0.45 + beat * 1.8 + treble * 0.35);
    }

    // Sombra inferior.
    float groundShadow = softShape(sdEllipse(p - vec2(0.0, -0.79), vec2(0.45, 0.055)), 0.025);
    color = mix(color, vec3(0.003, 0.005, 0.025), groundShadow * 0.65);

    // Túnica azul: el bajo controla la respiración y el pulso de los pliegues.
    vec2 robeP = p;
    robeP.x += sin(robeP.y * 7.0 + t * 1.4) * (0.006 + bass * 0.014);
    float robe = softShape(robeShape(robeP), 0.008);
    float robeShade = smoothstep(-0.78, 0.10, p.y);
    float robeFold = 0.5 + 0.5 * sin(p.x * 23.0 + p.y * 7.0 + t * 0.45);
    vec3 robeColor = mix(vec3(0.025, 0.06, 0.25), vec3(0.07, 0.20, 0.62), robeShade);
    robeColor += vec3(0.018, 0.045, 0.16) * robeFold * (0.35 + mid * 0.7);
    color = mix(color, robeColor, robe);

    // Cinturón de cuero, hebilla metálica y runa arcana en la túnica.
    float belt = softShape(sdBox(p - vec2(0.0, -0.08), vec2(0.245, 0.032), 0.014), 0.006);
    color = mix(color, vec3(0.035, 0.025, 0.08), belt);
    float buckle = softShape(sdBox(p - vec2(0.0, -0.08), vec2(0.045, 0.042), 0.008), 0.005);
    color = mix(color, vec3(0.18, 0.34, 0.72), buckle);
    float runeRing = abs(length((p - vec2(0.0, -0.30)) * vec2(1.0, 1.45)) - 0.075);
    float rune = (1.0 - smoothstep(0.004, 0.014, runeRing)) +
                 (1.0 - smoothstep(0.006, 0.016, abs(p.x) - abs(p.y + 0.30) * 0.20));
    color += vec3(0.08, 0.25, 0.85) * saturate(rune) * (0.35 + mid * 0.8);

    // Capucha y cabeza.
    float hood = softShape(sdEllipse(p - vec2(0.0, 0.10), vec2(0.235, 0.27)), 0.008);
    vec3 hoodColor = vec3(0.025, 0.075, 0.31) + vec3(0.025, 0.05, 0.18) * (0.5 + 0.5 * sin(p.y * 12.0));
    color = mix(color, hoodColor, hood);

    // Pico triangular y banda: silueta de archimago de fantasía.
    float hatY = clamp((0.64 - p.y) / 0.36, 0.0, 1.0);
    float hatWidth = mix(0.025, 0.235, hatY);
    float hatBend = (p.y - 0.52) * 0.34;
    float hatMask = step(0.265, p.y) * step(p.y, 0.64) *
                    (1.0 - smoothstep(hatWidth, hatWidth + 0.012, abs(p.x - hatBend)));
    vec3 hatColor = vec3(0.018, 0.055, 0.25) + vec3(0.018, 0.05, 0.20) * hatY;
    color = mix(color, hatColor, hatMask);
    float hatBand = softShape(sdBox(p - vec2(0.0, 0.275), vec2(0.25, 0.025), 0.012), 0.006);
    color = mix(color, vec3(0.10, 0.28, 0.70), hatBand);

    float face = softShape(sdEllipse(p - vec2(0.0, 0.08), vec2(0.135, 0.17)), 0.008);
    color = mix(color, vec3(0.045, 0.055, 0.13), face);

    // Ojos iluminados según el volumen y el brillo general.
    float eyeL = softShape(sdEllipse(p - vec2(-0.052, 0.10), vec2(0.021, 0.009)), 0.004);
    float eyeR = softShape(sdEllipse(p - vec2(0.052, 0.10), vec2(0.021, 0.009)), 0.004);
    float eyePulse = 0.55 + 0.45 * sin(t * 5.0);
    color += vec3(0.13, 0.38, 1.0) * (eyeL + eyeR) * (0.35 + volume * 0.9) * eyePulse;

    // Brazos levantados hacia la esfera.
    vec2 leftHand = vec2(-0.25, 0.59);
    vec2 rightHand = vec2(0.25, 0.59);
    float leftArm = softShape(sdSegment(p, vec2(-0.20, 0.00), leftHand, 0.055), 0.012);
    float rightArm = softShape(sdSegment(p, vec2(0.20, 0.00), rightHand, 0.055), 0.012);
    vec3 sleeve = vec3(0.035, 0.10, 0.42) + vec3(0.02, 0.05, 0.20) * mid;
    color = mix(color, sleeve, max(leftArm, rightArm));

    float handGlow = softShape(sdCircle(p - leftHand, 0.065), 0.012) +
                     softShape(sdCircle(p - rightHand, 0.065), 0.012);
    color = mix(color, vec3(0.09, 0.16, 0.52), handGlow);
    color += vec3(0.04, 0.17, 0.65) * handGlow * (0.3 + treble);

    // Bola de energía: núcleo, filamentos y corona luminosa.
    float orbDistance = sdCircle(p - orb, orbRadius);
    float aura = energyAura(p, orb, orbRadius) * (0.55 + highEnergy * 1.2 + volume * 0.45);
    color += vec3(0.02, 0.18, 0.95) * aura;

    float orbBody = softShape(orbDistance, 0.009);
    float orbInner = softShape(sdCircle(p - orb, orbRadius * 0.58), 0.006);
    float orbPulse = 0.75 + 0.25 * sin(t * 8.0 + highEnergy * 5.0);
    vec3 energyBlue = vec3(0.10, 0.42, 1.0) * orbPulse;
    color = mix(color, energyBlue, orbBody);
    color = mix(color, vec3(0.42, 0.84, 1.0), orbInner * (0.55 + highEnergy * 0.35));

    // Remolinos internos reactivos al audio.
    vec2 op = (p - orb) / max(orbRadius, 0.001);
    float angle = atan(op.y, op.x);
    float swirl = 0.5 + 0.5 * sin(angle * 5.0 + length(op) * 13.0 - t * (3.0 + treble * 8.0));
    float swirlMask = smoothstep(0.15, 0.95, length(op)) * orbBody;
    color += vec3(0.18, 0.48, 0.95) * swirl * swirlMask * (0.25 + treble * 0.75);

    // Chispas orbitando la bola.
    for (int i = 0; i < 7; i++) {
        float fi = float(i);
        float a = t * (0.45 + fi * 0.07) + fi * 0.897;
        float r = orbRadius * (1.25 + 0.24 * sin(t * 2.0 + fi));
        vec2 sparkPos = orb + vec2(cos(a), sin(a)) * r;
        float spark = softShape(sdCircle(p - sparkPos, 0.012 + treble * 0.012), 0.008);
        color += vec3(0.25, 0.65, 1.0) * spark * (0.45 + highEnergy);
    }

    // Líneas verticales convertidas en osciloscopios reactivos al waveform.
    float scopeL = oscilloscope(p, -0.59, 0.07);
    float scopeR = oscilloscope(p, 0.59, 0.43);
    color += vec3(0.08, 0.34, 1.0) * (scopeL + scopeR) * (0.35 + treble * 0.7 + beat * 1.4);

    // Ejes de referencia de los osciloscopios.
    float scaleL = softShape(sdSegment(p, vec2(-0.59, -0.77), vec2(-0.59, 0.57), 0.0025), 0.004);
    float scaleR = softShape(sdSegment(p, vec2(0.59, -0.77), vec2(0.59, 0.57), 0.0025), 0.004);
    color += vec3(0.03, 0.12, 0.40) * (scaleL + scaleR) * (0.45 + beat);

    // Flash de beat muy breve sobre toda la escena.
    color += vec3(0.015, 0.035, 0.16) * beat * (0.4 + highEnergy);

    // Viñeta final y corrección de color.
    float vignette = 1.0 - smoothstep(0.55, 1.45, length(p * vec2(0.72, 0.92)));
    color *= 0.72 + vignette * 0.38;
    color = pow(max(color, 0.0), vec3(0.88));

    gl_FragColor = vec4(color, 1.0);
}
