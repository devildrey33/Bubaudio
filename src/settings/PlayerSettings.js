import FolderSelector from "./FolderSelector.js";


export default class PlayerSettings {

    // Clave utilizada en localStorage.
    static STORAGE_KEY = "bubaudio.settings";

    // Configuración por defecto.
    static DEFAULT_SETTINGS = {

        // Ruta raíz de la biblioteca musical.
        musicPath: "",
        // Volumen inicial.
        volume: 1.0,
        // Modo aleatorio.
        shuffle: false,
        // Modo repetición.
        repeat: false,
        // Shader seleccionado.
        visualizer: "galaxy"
    };


    // Configuración actualmente cargada.
    #settings;

    #btnFolder;

    /**
     * Constructor.
     * Inicializa la configuración con los valores por defecto.
     */
    constructor() {

        this.#settings =
            structuredClone(
                PlayerSettings.DEFAULT_SETTINGS
            );

        this.#btnFolder = document.getElementById("btn-select-folder");        
        this.#btnFolder.addEventListener(
            "click",
            async () => this.selectFolder);

    }

    async selectFolder() {
        const path = await FolderSelector.selectFolder();

        if (!path) {
            return;
        }

        this.#settings.musicPath = path;

        this.save();

        console.log(
            "Biblioteca:",
            path
        );        
    }

    /**
     * Carga los ajustes desde localStorage.
     *
     * Si no existe ninguna configuración guardada,
     * se mantienen los valores por defecto.
     *
     * @returns {Object}
     */
    load() {

        const json =
            localStorage.getItem(
                PlayerSettings.STORAGE_KEY
            );

        if (json) {

            this.#settings =
                JSON.parse(
                    json
                );
        }

        return this.#settings;
    }


    /**
     * Guarda la configuración actual.
     */
    save() {

        localStorage.setItem(
            PlayerSettings.STORAGE_KEY,

            JSON.stringify(
                this.#settings,
                null,
                4
            )
        );
    }


    /**
     * Restablece toda la configuración
     * a sus valores por defecto.
     */
    reset() {

        this.#settings =
            structuredClone(
                PlayerSettings.DEFAULT_SETTINGS
            );

        this.save();
    }


    /**
     * Devuelve el objeto completo de configuración.
     */
    get settings() {
        return this.#settings;
    }


    /**
     * Ruta raíz de la colección musical.
     */
    get musicPath() {

        return this.#settings.musicPath;
    }

    set musicPath(value) {

        this.#settings.musicPath =
            value;
    }


    /**
     * Volumen del reproductor.
     * Rango: 0.0 - 1.0
     */
    get volume() {

        return this.#settings.volume;
    }

    set volume(value) {

        this.#settings.volume =
            Math.max(
                0,
                Math.min(
                    1,
                    value
                )
            );
    }


    /**
     * Estado del modo aleatorio.
     */
    get shuffle() {

        return this.#settings.shuffle;
    }

    set shuffle(value) {

        this.#settings.shuffle =
            Boolean(value);
    }


    /**
     * Estado del modo repetición.
     */
    get repeat() {

        return this.#settings.repeat;
    }

    set repeat(value) {

        this.#settings.repeat =
            Boolean(value);
    }


    /**
     * Shader seleccionado actualmente.
     */
    get visualizer() {

        return this.#settings.visualizer;
    }

    set visualizer(value) {

        this.#settings.visualizer =
            value;
    }
}