import shaders from "../shaders";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ContextMenu from "./ContextMenu.js";

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
    #btnShuffle;
    #btnRepeat;

    #library;
    #repeatMenu;
    #onMusicPathsChanged;

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
     * @param {LibraryIndexer} library
     */
    constructor(
        player,
        settings,
        renderer,
        library,
        onMusicPathsChanged = null
    ) {

        this.#player = player;
        this.#settings = settings;
        this.#renderer = renderer;
        this.#library = library;
        this.#onMusicPathsChanged = onMusicPathsChanged;

        this.#cacheDom();
        this.#repeatMenu = new ContextMenu();
        this.#volumeBar.value = this.#settings.volume * 100;
        this.#player.setVolume(this.#settings.volume);
        this.#registerEvents();
        this.#restoreQueueEndMode();
        this.#updateShuffleButton();
        this.#updateRepeatButton();
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
        this.#btnShuffle = document.getElementById("btn-shuffle");
        this.#btnRepeat = document.getElementById("btn-repeat");

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
        this.#btnShuffle.addEventListener("click", () => this.#onShuffle());
        this.#btnRepeat.addEventListener("click", () => this.#openRepeatMenu());

        this.#player.addEventListener("shufflechange", () => {
            this.#settings.shuffle = this.#player.queue.shuffle;
            this.#updateShuffleButton();
        });
        this.#player.addEventListener("repeatchange", () => {
            this.#settings.repeat =
                this.#player.queue.repeatMode !== "none";
            this.#settings.queueEndMode = this.#player.queueEndMode;
            this.#updateRepeatButton();
        });
        this.#player.addEventListener("queuegenerationerror", (event) => {
            console.error(
                "No se pudo generar la lista al terminar la cola",
                event.detail.error
            );
            window.alert(
                `No se pudo generar la lista al terminar la cola: ${String(event.detail.error)}`
            );
        });

        this.#progressBar.addEventListener("input", () => this.#onSeek());
        this.#volumeBar.addEventListener("input", () => this.#onVolume());

        this.#btnFolder.addEventListener(
            "click",
            () => this.#onSelectMusicPath()
        );

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

    async #onSelectMusicPath() {
        try {
            const selection = await this.#settings.selectFolder();
            if (!selection) {
                return;
            }

            await this.#library.scan(this.#settings.musicPaths);
            if (this.#onMusicPathsChanged) {
                await this.#onMusicPathsChanged();
            }
        }
        catch (error) {
            console.error(
                "No se pudo actualizar la biblioteca de música",
                error
            );
            window.alert(
                `No se pudo actualizar la biblioteca de música: ${String(error)}`
            );
        }
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
        await this.#player.restartOrPrevious();
    }


    /**
     * Reproduce la siguiente canción.
     */
    async #onNext() {
        await this.#player.next();
    }

    #onShuffle() {
        const enabled = !this.#player.queue.shuffle;

        this.#player.setShuffle(enabled);
    }


    #updateShuffleButton() {
        const enabled = this.#player.queue.shuffle;

        this.#btnShuffle.classList.toggle("active", enabled);
        this.#btnShuffle.setAttribute("aria-pressed", String(enabled));
    }

    #updateRepeatButton() {
        const enabled =
            this.#player.queue.repeatMode !== "none" ||
            this.#player.queueEndMode !== null;

        this.#btnRepeat.classList.toggle("active", enabled);
        this.#btnRepeat.setAttribute("aria-pressed", String(enabled));
    }


    #openRepeatMenu() {
        const bounds = this.#btnRepeat.getBoundingClientRect();
        const repeatMode = this.#player.queue.repeatMode;
        const shuffle = this.#player.queue.shuffle;
        const queueEndMode = this.#player.queueEndMode;

        this.#repeatMenu.show({
            clientX: bounds.left,
            clientY: bounds.bottom
        }, [
            {
                label: "Sin repetición",
                icon: repeatMode === "none" && queueEndMode === null
                    ? "✓"
                    : "⏹",
                action: () => this.#setPlaybackMode("none", false)
            },
            {
                label: "Repetir cola",
                icon: repeatMode === "queue" &&
                    !shuffle
                    ? "✓"
                    : "🔁",
                action: () => this.#setPlaybackMode("queue", false)
            },
            {
                label: "Repetir + shuffle",
                icon: repeatMode === "queue" && shuffle
                    ? "✓"
                    : "🔀",
                action: () => this.#setPlaybackMode("queue", true)
            },
            {
                label: "Generar lista al terminar",
                icon: queueEndMode !== null ? "✓" : "▤",
                children: [
                    {
                        label: "Grupo aleatorio",
                        icon: queueEndMode === "artist" ? "✓" : "👥",
                        disabled: this.#library.artistCount === 0,
                        action: () => this.#generateAfterQueue(
                            "artist",
                            () => this.#getRandomArtistTracks(),
                            "grupo aleatorio"
                        )
                    },
                    {
                        label: "Disco aleatorio",
                        icon: queueEndMode === "album" ? "✓" : "💿",
                        disabled: this.#library.albumCount === 0,
                        action: () => this.#generateAfterQueue(
                            "album",
                            () => this.#getRandomAlbumTracks(),
                            "disco aleatorio"
                        )
                    },
                    {
                        label: "50 canciones aleatorias",
                        icon: queueEndMode === "tracks50" ? "✓" : "🎵",
                        disabled: this.#library.trackCount === 0,
                        action: () => this.#generateAfterQueue(
                            "tracks50",
                            () => this.#getRandomTracks(),
                            "50 canciones aleatorias"
                        )
                    }
                ]
            },
            {
                label: "Apagar reproductor",
                icon: "⏻",
                action: () => this.#closePlayer()
            },
            {
                label: "Apagar Windows...",
                icon: "🖥",
                action: () => this.#scheduleWindowsShutdown()
            }
        ], document.getElementById("controls-trigger"));
    }


    #setPlaybackMode(repeatMode, shuffle) {
        this.#player.setRepeatMode(repeatMode);
        this.#player.setShuffle(shuffle);
    }

    #restoreQueueEndMode() {
        const options = {
            artist: {
                description: "grupo aleatorio",
                factory: () => this.#getRandomArtistTracks()
            },
            album: {
                description: "disco aleatorio",
                factory: () => this.#getRandomAlbumTracks()
            },
            tracks50: {
                description: "50 canciones aleatorias",
                factory: () => this.#getRandomTracks()
            }
        };
        const mode = this.#settings.queueEndMode;
        const option = options[mode];

        if (option) {
            this.#generateAfterQueue(
                mode,
                option.factory,
                option.description,
                false
            );
        }
    }


    #getRandomArtistTracks() {
        const artist = this.#library.randomArtist();

        return artist
            ? this.#library.getArtistTracks(artist.id)
            : [];
    }


    #getRandomAlbumTracks() {
        const album = this.#library.randomAlbum();

        return album
            ? this.#library.getAlbumTracks(album.id)
            : [];
    }


    #getRandomTracks() {
        const tracks = [...this.#library.tracks];

        for (let index = tracks.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [tracks[index], tracks[randomIndex]] =
                [tracks[randomIndex], tracks[index]];
        }

        return tracks.slice(0, 50);
    }


    async #generateAfterQueue(
        mode,
        factory,
        description,
        generateIfEmpty = true
    ) {
        try {
            await this.#player.setQueueEndMode(mode, async () => {
                const tracks = await factory();

                if (tracks.length === 0) {
                    throw new Error(
                        `No hay canciones para generar: ${description}.`
                    );
                }

                return tracks;
            }, { generateIfEmpty });
        }
        catch (error) {
            console.error(
                `No se pudo generar la lista de ${description}`,
                error
            );
            window.alert(
                `No se pudo generar la lista de ${description}: ${String(error)}`
            );
        }
    }


    async #closePlayer() {
        try {
            this.#player.stop();
            await getCurrentWindow().close();
        }
        catch (error) {
            console.error("No se pudo cerrar BubAudio", error);
            window.alert("No se pudo cerrar BubAudio.");
        }
    }


    async #scheduleWindowsShutdown() {
        const confirmed = window.confirm(
            "Windows se apagará en 60 segundos. Guarda tu trabajo antes de continuar."
        );

        if (!confirmed) {
            return;
        }

        try {
            await invoke("schedule_windows_shutdown");
            this.#player.stop();
            window.alert(
                "Apagado programado para dentro de 60 segundos. Para cancelarlo, ejecuta «shutdown /a»."
            );
        }
        catch (error) {
            console.error("No se pudo programar el apagado de Windows", error);
            window.alert(
                `No se pudo programar el apagado de Windows: ${String(error)}`
            );
        }
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

        const volume = this.#volumeBar.value / 100;

        this.#player.setVolume(volume);
        this.#settings.volume = volume;
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

        this.#btnPrev.disabled = !this.#player.canGoPrevious;

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