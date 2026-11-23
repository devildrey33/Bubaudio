/* Tests para el espectrograma

// Espectrograma
float fft = texture(uFFTHistory, vec2(vUv.x, historyY).r);

// Cascada
float fft = texture(uFFTHistory, vec2(historyY, vUv.y).r);

// Tunel
float fft = texture(uFFTHistory, vec2(historyY, freq)).r;

*/

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;

uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;

uniform float uBeat;
uniform float uMidBeat;
uniform float uTrebleBeat;

uniform float uKick;
uniform float uSnare;
uniform float uVoice;
uniform float uHiHat;
// Los peaks van de 0 a 1
uniform float uKickPeak;
uniform float uSnarePeak;
uniform float uVoicePeak;
uniform float uHiHatPeak;

uniform sampler2D uSpectrum;
uniform sampler2D uWaveform;
uniform sampler2D uFFTHistory;
uniform float uFFTHistoryOffset;


void main(){
vec2 uv = vUv;

float y = fract(
    uv.y +
    uFFTHistoryOffset
);

float fft =
    texture(
        uFFTHistory,
        vUv
    ).r;

float writeLine = uFFTHistoryOffset;

vec3 color = vec3(fft);

if (abs(vUv.y - writeLine) < 0.005) {
    color = vec3(1.0, 0.0, 0.0);
}

gl_FragColor = vec4(color, 1.0);


//gl_FragColor =  vec4(vec3(fft),1.0);
/*gl_FragColor =
    vec4(
        fft,
        fft,
        fft,
        1.0
    );*/
        //gl_FragColor = vec4(color, 1.0);
}