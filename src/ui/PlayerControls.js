import shaders from "../shaders";

export default class PlayerControls {

    //--------------------------------------------------------------------------
    // REFERENCIAS PRINCIPALES
    //--------------------------------------------------------------------------

    // Reproductor principal.
    #player;

    // Configuración persistente.
    #settings;

    // Visualizador de shaders.
    #renderer;


    //--------------------------------------------------------------------------
    // BOTONES DE REPRODUCCIÓN
    //--------------------------------------------------------------------------

    #btnPlay;
    #btnStop;
    #btnPrev;
    #btnNext;
    #btnFolder;


    //--------------------------------------------------------------------------
    // CONTROLES DE PROGRESO
    //--------------------------------------------------------------------------

    #progressBar;
    #volumeBar;
    #currentTime;
    #totalTime;


    //--------------------------------------------------------------------------
    // CONTROLES DE SHADERS
    //--------------------------------------------------------------------------

    #btnShaderPrev;
    #btnShaderNext;
    #shaderSelect;


    /**
     * Constructor.
     *
     * @param {Player} player
     * @param {PlayerSettings} settings
     * @param {Visualizer} renderer
     */
    constructor(player, settings, renderer) {

        this.#player = player;
        this.#settings = settings;
        this.#renderer = renderer;

        this.#cacheDom();
        this.#registerEvents();
        this.#populateShaders();
        this.#update();
    }


    /**
     * Obtiene todas las referencias del DOM.
     */
    #cacheDom() {

        this.#btnPlay = document.getElementById("btn-play");
        this.#btnStop = document.getElementById("btn-stop");
        this.#btnPrev = document.getElementById("btn-prev");
        this.#btnNext = document.getElementById("btn-next");
        this.#btnFolder = document.getElementById("btn-select-folder");

        this.#progressBar = document.getElementById("progress-bar");
        this.#volumeBar = document.getElementById("volume-bar");
        this.#currentTime = document.getElementById("current-time");
        this.#totalTime = document.getElementById("total-time");

        this.#btnShaderPrev = document.getElementById("btn-shader-prev");
        this.#btnShaderNext = document.getElementById("btn-shader-next");
        this.#shaderSelect = document.getElementById("shader-select");
    }


    /**
     * Registra todos los eventos de la interfaz.
     */
    #registerEvents() {

        this.#btnPlay.addEventListener("click", () => this.#onPlayPause());
        this.#btnStop.addEventListener("click", () => this.#onStop());

        this.#btnPrev.addEventListener("click", () => this.#onPrevious());
        this.#btnNext.addEventListener("click", () => this.#onNext());

        this.#progressBar.addEventListener("input", () => this.#onSeek());
        this.#volumeBar.addEventListener("input", () => this.#onVolume());

        this.#btnFolder.addEventListener("click", async () => this.#settings.selectFolder());

        this.#btnShaderPrev.addEventListener("click", () => this.#onPreviousShader());
        this.#btnShaderNext.addEventListener("click", () => this.#onNextShader());
        this.#shaderSelect.addEventListener("change", () => this.#onShaderChanged());
    }


    /**
     * Alterna entre Play y Pause.
     */
    async #onPlayPause() {

        if (this.#player.paused) {
            await this.#player.play();
        }
        else {
            this.#player.pause();
        }

        this.#updatePlayButton();
    }


    /**
     * Detiene la reproducción.
     */
    #onStop() {

        this.#player.stop();

        this.#progressBar.value = 0;

        this.#updatePlayButton();
    }


    /**
     * Reproduce la canción anterior.
     */
    async #onPrevious() {
        await this.#player.previous();
    }


    /**
     * Reproduce la siguiente canción.
     */
    async #onNext() {
        await this.#player.next();
    }


    /**
     * Cambia la posición de reproducción.
     */
    #onSeek() {

        const duration = this.#player.duration;

        if (duration <= 0) {
            return;
        }

        const position = duration * (this.#progressBar.value / 100);

        this.#player.seek(position);
    }


    /**
     * Modifica el volumen.
     */
    #onVolume() {

        this.#player.setVolume(
            this.#volumeBar.value / 100
        );
    }


    /**
     * Actualiza el icono Play/Pause.
     */
    #updatePlayButton() {

        const icon = this.#btnPlay.querySelector(".icon-play");

        icon.textContent =
            this.#player.paused
                ? "▶"
                : "⏸";
    }


    /**
     * Actualiza el estado de los botones
     * anterior y siguiente.
     */
    #updateNavigationButtons() {

        this.#btnPrev.disabled =
            !this.#player.queue.hasPrevious();

        this.#btnNext.disabled =
            !this.#player.queue.hasNext();
    }


    /**
     * Convierte segundos a mm:ss.
     *
     * @param {Number} seconds
     * @returns {String}
     */
    #formatTime(seconds) {

        if (Number.isNaN(seconds)) {
            return "00:00";
        }

        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);

        return (
            String(minutes).padStart(2, "0") +
            ":" +
            String(secs).padStart(2, "0")
        );
    }


    /**
     * Actualiza continuamente la interfaz.
     */
    #update() {

        const current = this.#player.currentTime;
        const duration = this.#player.duration;

        if (duration > 0) {
            this.#progressBar.value =
                (current / duration) * 100;
        }

        this.#currentTime.textContent =
            this.#formatTime(current);

        this.#totalTime.textContent =
            this.#formatTime(duration);

        this.#updatePlayButton();
        this.#updateNavigationButtons();

        requestAnimationFrame(
            () => this.#update()
        );
    }


    /**
     * Rellena el selector con todos los shaders.
     */
    #populateShaders() {

        this.#shaderSelect.innerHTML = "";

        shaders.shaders.forEach((shader, index) => {

            const option = document.createElement("option");

            option.value = index;
            option.textContent = shader.name;

            this.#shaderSelect.appendChild(option);
        });

        this.#shaderSelect.value =
            this.#renderer.shaderIndex;
    }


    /**
     * Aplica el shader seleccionado en el selector.
     */
    #onShaderChanged() {

        const index = parseInt(
            this.#shaderSelect.value
        );

        this.#renderer.setShader(index);

        this.#settings.shaderIndex = index;

        this.#settings.save();
    }


    /**
     * Selecciona el siguiente shader.
     */
    #onNextShader() {

        this.#renderer.nextShader();

        this.#shaderSelect.value =
            this.#renderer.shaderIndex;

        this.#settings.shaderIndex =
            this.#renderer.shaderIndex;

        this.#settings.save();
    }


    /**
     * Selecciona el shader anterior.
     */
    #onPreviousShader() {

        this.#renderer.previousShader();

        this.#shaderSelect.value =
            this.#renderer.shaderIndex;

        this.#settings.shaderIndex =
            this.#renderer.shaderIndex;

        this.#settings.save();
    }
}