export default class PlayerControls {

    // Reproductor de audio
    #audio;

    // Cola de reproducción
    #queue;

    // Preferencias a los ajustes
    #settings;

    // Botones
    #btnPlay;

    #btnStop;

    #btnPrev;

    #btnNext;

    #btnFolder

    // Controles de progreso
    #progressBar;

    #volumeBar;

    #currentTime;

    #totalTime;

    

    /**
     * Constructor.
     *
     * @param {AudioAnalyzer} audio
     * @param {PlaybackQueue} queue
     * @param {Settings} settings
     */
    constructor(audio, queue, settings) {

        this.#queue = queue;
        this.#audio = audio;
        this.#settings = settings;
        this.#cacheDom();

        this.#registerEvents();

        this.#update();
    }


    /**
     * Obtiene las referencias a los elementos HTML.
     */
    #cacheDom() {
        this.#btnPlay = document.getElementById("btn-play");
        this.#btnStop = document.getElementById("btn-stop");
        this.#btnPrev = document.getElementById("btn-prev");
        this.#btnNext = document.getElementById("btn-next");
        this.#progressBar = document.getElementById("progress-bar");
        this.#volumeBar = document.getElementById("volume-bar");
        this.#currentTime = document.getElementById("current-time");
        this.#totalTime = document.getElementById("total-time");
        this.#btnFolder = document.getElementById("btn-select-folder");        

    }


    /**
     * Registra todos los eventos de los controles.
     */
    #registerEvents() {

        this.#btnPlay.addEventListener(
            "click",
            () => this.#onPlayPause()
        );

        this.#btnStop.addEventListener(
            "click",
            () => this.#onStop()
        );

        this.#btnPrev.addEventListener(
            "click",
            () => this.#onPrevious()
        );

        this.#btnNext.addEventListener(
            "click",
            () => this.#onNext()
        );

        this.#progressBar.addEventListener(
            "input",
            () => this.#onSeek()
        );

        this.#volumeBar.addEventListener(
            "input",
            () => this.#onVolume()
        );

        this.#btnFolder.addEventListener(
            "click",
            async () => this.#settings.selectFolder());

    }


    /**
     * Alterna entre Play y Pause.
     */
    async #onPlayPause() {

        await this.#audio.resume();

        if (
            this.#audio.isPlaying
        ) {
            this.#audio.pause();
        }
        else {
            this.#audio.play();
        }

        this.#updatePlayButton();
    }


    /**
     * Detiene la reproducción.
     */
    #onStop() {

        this.#audio.stop();

        this.#progressBar.value = 0;

        this.#updatePlayButton();
    }


    /**
     * Canción anterior.
     */
    async #onPrevious() {

        const track =
            this.#queue.previous();

        await this.#loadTrack(
            track
        );
    }


    /**
     * Canción siguiente.
     */
    async #onNext() {

        const track =
            this.#queue.next();

        await this.#loadTrack(
            track
        );
    }


    /**
     * Cambia la posición de reproducción.
     */
    #onSeek() {

        const duration =
            this.#audio.duration;

        if (duration <= 0) {
            return;
        }

        const position =
            duration *
            (
                this.#progressBar.value /
                100
            );

        this.#audio.seek(
            position
        );
    }


    /**
     * Cambia el volumen.
     */
    #onVolume() {

        this.#audio.volumeLevel =
            this.#volumeBar.value /
            100;
    }


    /**
     * Carga una canción de la cola.
     *
     * @param {Object|null} track
     */
    async #loadTrack(track) {

        if (!track) {
            return;
        }

        await this.#audio.load(
            track.path
        );

        await this.#audio.resume();

        await this.#audio.play();

        this.#updatePlayButton();
    }


    /**
     * Actualiza el icono Play/Pause.
     */
    #updatePlayButton() {

        const icon =
            this.#btnPlay.querySelector(
                ".icon-play"
            );

        icon.textContent =
            this.#audio.isPlaying
                ? "⏸"
                : "▶";
    }


    /**
     * Actualiza el estado visual
     * de los botones Previous y Next.
     */
    #updateNavigationButtons() {

        this.#btnPrev.disabled =
            !this.#queue.hasPrevious?.();

        this.#btnNext.disabled =
            !this.#queue.hasNext?.();
    }


    /**
     * Convierte segundos a mm:ss.
     *
     * @param {Number} seconds
     * @returns {String}
     */
    #formatTime(seconds) {

        if (
            Number.isNaN(seconds)
        ) {
            return "00:00";
        }

        const minutes =
            Math.floor(
                seconds / 60
            );

        const secs =
            Math.floor(
                seconds % 60
            );

        return (
            String(minutes)
                .padStart(2, "0")
            +
            ":"
            +
            String(secs)
                .padStart(2, "0")
        );
    }


    /**
     * Actualiza la interfaz.
     *
     * Se ejecuta una vez por frame.
     */
    #update() {

        const current =
            this.#audio.currentTime;

        const duration =
            this.#audio.duration;

        if (duration > 0) {

            this.#progressBar.value =
                (
                    current /
                    duration
                ) * 100;
        }

        this.#currentTime.textContent =
            this.#formatTime(
                current
            );

        this.#totalTime.textContent =
            this.#formatTime(
                duration
            );

        this.#updatePlayButton();

        this.#updateNavigationButtons();

        requestAnimationFrame(
            () => this.#update()
        );
    }
}