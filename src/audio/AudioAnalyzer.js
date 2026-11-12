import {
    readDir,
    readTextFile,
    writeTextFile,
    mkdir,
    readFile,
    BaseDirectory
}
from "@tauri-apps/plugin-fs";

export default class AudioAnalyzer {

    // Rangos de frecuencia utilizados para las bandas
    static BASS_MIN = 20;
    static BASS_MAX = 250;

    static MID_MIN = 250;
    static MID_MAX = 4000;

    static TREBLE_MIN = 4000;
    static TREBLE_MAX = 16000;

    // Factor de suavizado
    static SMOOTHING = 0.2;

    // Umbral utilizado para detectar beats
    static BEAT_THRESHOLD = 0.15;


    // Contexto principal de Web Audio API
    #audioContext;

    // Elemento HTML de reproducción
    #audioElement;

    // Nodo fuente
    #source;

    // Analizador FFT
    #analyser;

    // Datos de frecuencia
    #fftData;

    // Datos de forma de onda
    #timeData;

    // Tamaño FFT
    #fftSize;

    // Valores suavizados
    #bass = 0;

    #mid = 0;

    #treble = 0;

    #volume = 0;

    #beat = 0;

    #blobUrl = null;

    /**
     * Constructor.
     * @param {Number} fftSize
     */
    constructor(fftSize = 2048) {

        this.#fftSize = fftSize;

        this.#audioContext = new AudioContext();

        this.#audioElement = new Audio();

        this.#source = this.#audioContext.createMediaElementSource(this.#audioElement);

        this.#analyser = this.#audioContext.createAnalyser();
        this.#analyser.fftSize = this.#fftSize;

        this.#source.connect(this.#analyser);
        this.#analyser.connect(this.#audioContext.destination);

        this.#fftData = new Uint8Array(fftSize / 2);
        this.#timeData = new Uint8Array(fftSize / 2);
    }


    /**
     * Carga un archivo de audio.
     *
     * Se lee mediante Tauri y se convierte a Blob para
     * evitar las restricciones del WebView con rutas
     * locales y recursos UNC.
     *
     * @param {String} path
     */
    async load(path) {

        this.stop();

        // Liberar el Blob anterior para evitar fugas
        // de memoria cuando cambiamos de canción.
        if (this.#blobUrl !== null) {

            URL.revokeObjectURL(
                this.#blobUrl
            );

            this.#blobUrl = null;
        }

        // Leer el fichero completo.
        const data = await readFile(path);

        // Intentar deducir el mime type.
        const extension = path
            .split(".")
            .pop()
            ?.toLowerCase();

        let mimeType = "audio/mpeg";

        switch (extension) {

            case "flac" :
                mimeType = "audio/flac";
                break;

            case "ogg" :
                mimeType = "audio/ogg";
                break;

            case "opus" :
                mimeType = "audio/ogg";
                break;

            case "wav" :
                mimeType = "audio/wav";
                break;

            case "m4a" :
                mimeType = "audio/mp4";
                break;

            case "aac" :
                mimeType = "audio/aac";
                break;
        }

        // Crear Blob reproducible por HTMLAudioElement.
        const blob = new Blob(
            [data],
            { type : mimeType }
        );

        this.#blobUrl = URL.createObjectURL(
            blob
        );

        this.#audioElement.src = this.#blobUrl;

        this.#audioElement.load();
    }


    /**
     * Inicia la reproducción.
     */
    play() {
        return this.#audioElement.play();
    }


    /**
     * Pausa la reproducción.
     */
    pause() {
        this.#audioElement.pause();
    }


    /**
     * Reanuda el AudioContext.
     */
    async resume() {
        if (this.#audioContext && this.#audioContext.state === "suspended") {
            await this.#audioContext.resume();
        }
    }


    /**
     * Actualiza FFT y waveform.
     * Debe llamarse una vez por frame.
     */
    update() {

        if (!this.#analyser) {
            return;
        }

        this.#analyser.getByteFrequencyData(this.#fftData);
        this.#analyser.getByteTimeDomainData(this.#timeData);

        const bass = this.#averageBand(AudioAnalyzer.BASS_MIN, AudioAnalyzer.BASS_MAX);

        const mid = this.#averageBand(AudioAnalyzer.MID_MIN, AudioAnalyzer.MID_MAX);
        const treble = this.#averageBand(AudioAnalyzer.TREBLE_MIN, AudioAnalyzer.TREBLE_MAX);
        const volume = this.#computeVolume();

        // Suavizado
        this.#bass += (bass - this.#bass) * AudioAnalyzer.SMOOTHING;

        this.#mid += (mid - this.#mid) * AudioAnalyzer.SMOOTHING;

        this.#treble += (treble - this.#treble) * AudioAnalyzer.SMOOTHING;

        this.#volume += (volume - this.#volume) * AudioAnalyzer.SMOOTHING;

        // Beat detector básico
        if (bass > this.#bass + AudioAnalyzer.BEAT_THRESHOLD) {
            this.#beat = 1.0;
        }

        this.#beat *= 0.92;
    }


    /**
     * Calcula el volumen medio.
     */
    #computeVolume() {
        let total = 0;
        for (let i = 0; i < this.#fftData.length; i++) {
            total += this.#fftData[i];
        }

        return (total / this.#fftData.length / 255);
    }


    /**
     * Calcula una banda de frecuencia.
     */
    #averageBand(minFreq, maxFreq) {
        const nyquist = this.#audioContext.sampleRate * 0.5;
        const minIndex = Math.floor(minFreq / nyquist * this.#fftData.length);
        const maxIndex = Math.floor(maxFreq / nyquist * this.#fftData.length);

        let total = 0;
        let count = 0;

        for (let i = minIndex; i <= maxIndex; i++) {
            total += this.#fftData[i];
            count++;
        }

        if (count === 0) {
            return 0;
        }

        return (
            total / count / 255
        );
    }


    get bass() {
        return this.#bass;
    }

    get mid() {
        return this.#mid;
    }

    get treble() {
        return this.#treble;
    }

    get volume() {
        return this.#volume;
    }

    get beat() {
        return this.#beat;
    }

    get spectrum() {
        return this.#fftData;
    }

    get waveform() {
        return this.#timeData;
    }


    async destroy() {
        this.pause();

        if (this.#blobUrl !== null) {

            URL.revokeObjectURL(
                this.#blobUrl
            );

            this.#blobUrl = null;
        }

        if (this.#audioContext) {
            await this.#audioContext.close();
        }
    }

    /**
     * Detiene la reproducción.
     */
    stop() {
        if (!this.#audioElement) {
            return;
        }

        this.#audioElement.pause();
        this.#audioElement.currentTime = 0;
    }


    /**
     * Posición actual en segundos.
     */
    get currentTime() {
        return this.#audioElement ? this.#audioElement.currentTime : 0;
    }


    /**
     * Duración total en segundos.
     */
    get duration() {
        return this.#audioElement ? this.#audioElement.duration || 0 : 0;
    }


    /**
     * Volumen actual.
     */
    get volumeLevel() {
        return this.#audioElement.volume;
    }


    /**
     * Modifica el volumen.
     */
    set volumeLevel(value) {
        this.#audioElement.volume = Math.min(1, Math.max(0, value));
    }


    /**
     * Cambia la posición de reproducción.
     */
    seek(seconds) {
        if (!this.#audioElement) {
            return;
        }
        this.#audioElement.currentTime = seconds;
    }


    /**
     * Estado actual.
     */
    get isPlaying() {
        return (this.#audioElement && !this.#audioElement.paused);
    }    

    get audioElement() {
        return this.#audioElement;
    }    
}