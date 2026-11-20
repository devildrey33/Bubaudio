precision highp float;

varying vec2 vUv;
uniform float uTime;
uniform vec2  uResolution;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;
uniform sampler2D uSpectrum;
uniform sampler2D uWave;

#define TAU 6.2831853

// ---------- Hashes ----------
float hash21(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
vec2 hash22(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

// Devuelve: (distBorde, distCentro, hashCelda)
vec3 voronoiCell(vec2 x){
    vec2 n = floor(x);
    vec2 f = fract(x);
    vec2 mg = vec2(0.0), mr = vec2(0.0);
    float md = 8.0;

    for(int j = -1; j <= 1; j++){
        for(int i = -1; i <= 1; i++){
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash22(n + g);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if(d < md){ md = d; mr = r; mg = g; }
        }
    }

    float md2 = 8.0;
    for(int j = -2; j <= 2; j++){
        for(int i = -2; i <= 2; i++){
            vec2 g = mg + vec2(float(i), float(j));
            vec2 o = hash22(n + g);
            vec2 r = g + o - f;
            if(dot(mr - r, mr - r) > 0.0001)
                md2 = min(md2, dot(0.5*(mr + r), normalize(r - mr)));
        }
    }

    float cellId = hash21(n + mg);
    return vec3(md2, length(mr), cellId);
}

void main(){
    vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float r   = length(uv);
    float ang = atan(uv.y, uv.x);

    // ---------- 1. Rotación global (mid + midBeat) ----------
    float rot = uTime * 0.06 + uMid * 0.5 + uMidBeat * 0.4;
    mat2 R = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    vec2 p = R * uv;

    // ---------- 2. Escala de la retícula (bass + beat) ----------
    float scale = 4.0 + uBass * 2.5 + uBeat * 1.5;
    vec2 gp = p * scale;

    // ---------- 3. Distorsión por la forma de onda (uWave) ----------
    float wS = texture2D(uWave, vec2(fract(r * 0.35 + uTime * 0.05), 0.5)).r;
    gp += vec2(wS, -wS) * (0.25 + uVolume * 0.6);

    // ---------- 4. "Shatter" en beats: expansión radial ----------
    gp *= 1.0 + uBeat * 0.12;

    // ---------- 5. Célula Voronoi ----------
    vec3 v = voronoiCell(gp);
    float edgeDist   = v.x;
    float centerDist = v.y;
    float cellId     = v.z;

    // ---------- 6. Glow de bordes (uMid + treble shimmer) ----------
    float lineW = 0.035 + uVolume * 0.02;
    float edgeGlow = smoothstep(lineW, 0.0, edgeDist);
    edgeGlow = pow(edgeGlow, 1.6);

    // ---------- 7. Núcleo de cada célula (respira con el espectro) ----------
    float cellCore = smoothstep(0.75, 0.0, centerDist);
    float spec = texture2D(uSpectrum, vec2(cellId, 0.5)).r;
    spec = pow(spec, 1.3);

    // Color por celda (paleta cíclica estable)
    vec3 cellColor = 0.5 + 0.5 * cos(TAU * (cellId + vec3(0.0, 0.33, 0.67)));

    // ---------- 8. Ondas expansivas desde el centro en cada beat ----------
    float ringPhase = fract(uTime * 0.75);
    float ring = exp(-abs(r - ringPhase * 1.4) * 28.0) * uBeat;
    float ring2 = exp(-abs(r - fract(uTime * 0.75 + 0.5) * 1.4) * 32.0) * uMidBeat * 0.5;

    // ---------- 9. Shimmer de agudos (chispas en la retícula) ----------
    float shimmer = step(0.985, hash21(floor(gp * 18.0) + uTime * 0.5));
    shimmer *= uTreble + uTrebleBeat * 1.5;

    // ---------- 10. Composición ----------
    vec3 col = vec3(0.0);
    col += cellColor * cellCore * (0.12 + spec * 2.0 + uVolume * 0.35);
    col += vec3(0.90, 0.95, 1.00) * edgeGlow * (0.30 + uMid * 1.4);
    col += cellColor * edgeGlow * spec * 0.7;
    col += vec3(1.00, 0.80, 0.55) * (ring + ring2) * 2.0;
    col += vec3(1.00) * shimmer;

    // ---------- 11. Aberración cromática en beats ----------
    float ca = uBeat * 0.03 + uMidBeat * 0.015;
    col.r *= 1.0 + ca;
    col.b *= 1.0 + ca;

    // ---------- 12. Viñeta + tone mapping ----------
    col *= smoothstep(1.5, 0.35, r);
    col  = col / (col + vec3(1.0));
    col  = pow(col, vec3(0.4545));

    gl_FragColor = vec4(col, 1.0);
}