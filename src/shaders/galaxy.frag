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

// ---------- Utilidades ----------
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

// Paleta cromática dinámica
vec3 palette(float t) {
    vec3 a = vec3(0.5);
    vec3 b = vec3(0.5);
    vec3 c = vec3(1.0);
    vec3 d = vec3(0.0, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
}

void main() {
    // Coordenadas centradas y corregidas por aspect ratio
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    
    float dist = length(p);
    float angle = atan(p.y, p.x);

    // ---------- Datos de audio ----------
    // Muestreo del espectro (0..1 a lo largo del eje X)
    float specLow  = texture2D(uSpectrum, vec2(0.05, 0.5)).r;
    float specMid  = texture2D(uSpectrum, vec2(0.30, 0.5)).r;
    float specHigh = texture2D(uSpectrum, vec2(0.70, 0.5)).r;

    // Muestreo de la waveform según el ángulo para envolvente circular
    float wSample = texture2D(uWaveform, vec2(fract(angle / 6.28318 + 0.5), 0.5)).r;

    // Amplitudes normalizadas
    float bass   = uBass;
    float mid    = uMid;
    float treble = uTreble;
    float vol    = uVolume;

    // Beat con decay para pulsos vivos
    float beatPulse = uBeat * uBeat;

    // ---------- Fondo: nebulosa fluida ----------
    vec2 q = p * (1.5 + bass * 2.0);
    q += vec2(uTime * 0.15, -uTime * 0.1);
    float n = fbm(q + fbm(q * 0.8 + uTime * 0.2));
    
    vec3 col = palette(n * 0.5 + uTime * 0.05 + treble * 0.3);
    col *= 0.25 + 0.5 * n;
    col += vec3(0.05, 0.02, 0.15) * (1.0 - dist);

    // ---------- Anillo reactivo al bajo ----------
    float ringRadius = 0.35 + bass * 0.15 + beatPulse * 0.05;
    float ringWidth  = 0.03 + mid * 0.02;
    // Distorsión angular con waveform
    float warpedDist = dist + (wSample - 0.5) * 0.08 * (0.3 + mid);
    float ring = smoothstep(ringWidth, 0.0, abs(warpedDist - ringRadius));
    col += palette(0.15 + uTime * 0.1) * ring * (1.0 + beatPulse * 2.0);

    // ---------- Rayos radiales reactivos al medio ----------
    float rays = pow(abs(sin(angle * 12.0 + uTime * 1.5)), 8.0);
    rays *= smoothstep(ringRadius + 0.2, ringRadius, dist);
    rays *= mid * 2.0 + beatPulse;
    col += palette(0.5 + uTime * 0.05) * rays * 0.6;

    // ---------- Espectro circular alrededor del anillo ----------
    // Cada ángulo lee una frecuencia distinta
    float freqIndex = fract(angle / 6.28318 + 0.5);
    float specValue = texture2D(uSpectrum, vec2(freqIndex * 0.9 + 0.05, 0.5)).r;
    
    float barRadius = ringRadius + 0.05 + specValue * 0.35;
    float bar = smoothstep(0.008, 0.0, abs(dist - barRadius));
    // Solo dibuja barras desde el anillo hacia afuera
    bar *= step(ringRadius + 0.03, dist);
    col += palette(freqIndex + uTime * 0.1) * bar * (1.5 + treble);

    // Líneas internas del espectro (más tenues)
    for (int i = 1; i < 6; i++) {
        float fi = float(i) / 6.0;
        float r = ringRadius + 0.05 + specValue * 0.35 * fi;
        float l = smoothstep(0.003, 0.0, abs(dist - r));
        l *= step(ringRadius + 0.03, dist);
        col += palette(freqIndex + fi + uTime * 0.1) * l * 0.4;
    }

    // ---------- Puntos orbitales con el treble ----------
    float orbitCount = 60.0;
    float orbitAngle = angle * orbitCount / 6.28318;
    float orbitCell = fract(orbitAngle) - 0.5;
    float orbitRing = ringRadius + 0.6 + sin(uTime * 1.5 + floor(orbitAngle)) * 0.05;
    float orbitDist = abs(dist - orbitRing);
    float orbitDot = smoothstep(0.02, 0.0, orbitDist) *
                     smoothstep(0.35, 0.0, abs(orbitCell)) *
                     (treble * 3.0 + 0.1);
    col += vec3(0.8, 0.9, 1.0) * orbitDot;

    // ---------- Destello central con el beat ----------
    float centerFlash = exp(-dist * 6.0) * (beatPulse * 1.5 + vol * 0.5);
    col += palette(0.3 + uTime * 0.2) * centerFlash;

    // ---------- Estela de la waveform como onda horizontal ----------
    float waveY = texture2D(uWaveform, vec2(uv.x, 0.5)).r - 0.5;
    float waveLine = smoothstep(0.008, 0.0, abs((uv.y - 0.5) - waveY * 0.25));
    col += palette(uv.x + uTime * 0.1) * waveLine * (0.6 + mid);

    // ---------- Viñeta y viñeta de color ----------
    float vignette = smoothstep(1.2, 0.3, dist);
    col *= vignette;

    // ---------- Bloom / saturación por volumen ----------
    col = pow(col, vec3(0.9)) * (1.0 + vol * 0.4);

    // ---------- Grain sutil reactivo ----------
    float grain = hash(uv * uResolution + uTime) - 0.5;
    col += grain * 0.03 * (1.0 + treble);

    // ---------- Gamma corrección ----------
    col = pow(max(col, 0.0), vec3(1.0 / 2.2));

    gl_FragColor = vec4(col, 1.0);
}