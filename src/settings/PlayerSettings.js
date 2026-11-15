import FolderSelector from "./FolderSelector.js";


function normalizeMusicPath(value) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    let path = value.trim().replace(/\//g, "\\");
    const isUncPath = path.startsWith("\\\\");
    const pathBody = isUncPath ? path.slice(2) : path;
    path = (isUncPath ? "\\\\" : "") + pathBody.replace(/\\+/g, "\\");
    path = path.replace(/\\+$/, "");

    if (/^[a-zA-Z]:$/.test(path)) {
        path += "\\";
    }

    return path || null;
}

function isSameOrNestedPath(parentPath, candidatePath) {
    const parent = parentPath.toLowerCase();
    const candidate = candidatePath.toLowerCase();
    const prefix = parent.endsWith("\\") ? parent : `${parent}\\`;

    return candidate === parent || candidate.startsWith(prefix);
}


export default class PlayerSettings {

    // Clave utilizada en localStorage.
    static STORAGE_KEY = "bubaudio.settings";
    static STARTUP_MODES = ["lastQueue", "artist", "album", "tracks50"];
    static THEMES = ["dark", "light"];

    // Configuración por defecto.
    static DEFAULT_SETTINGS = {
        // Directorios raíz de la biblioteca musical.
        musicPaths: [],
        // Volumen inicial.
        volume: 1.0,
        // Modo aleatorio.
        shuffle: false,
        // Modo repetición.
        repeat: false,
        // Lista que se genera al terminar la cola.
        queueEndMode: null,
        // Acción al iniciar el reproductor.
        startupMode: "lastQueue",
        // Tema de la interfaz.
        theme: "dark",
        // Anchura de los paneles laterales.
        libraryPanelWidth: 300,
        queuePanelWidth: 350,
        // Última cola reproducida, almacenada como rutas.
        lastQueue: null,
        // Fecha del último escaneo de la biblioteca.
        lastLibraryScan: null,
        // Visualizacion seleccionada
        shaderIndex:0
    };


    // Configuración actualmente cargada.
    #settings;

    /**
     * Constructor.
     * Inicializa la configuración con los valores por defecto.
     */
    constructor() {
        this.#settings = structuredClone(
            PlayerSettings.DEFAULT_SETTINGS
        );
    }

    async selectFolder() {
        const path = await FolderSelector.selectFolder();

        if (!path) {
            return null;
        }

        const result = this.addMusicPath(path);
        console.log("Directorio de música seleccionado:", path);
        return {
            path,
            ...result
        };
    }

    addMusicPath(path) {
        const normalizedPath = normalizeMusicPath(path);

        if (!normalizedPath) {
            throw new TypeError("La ruta de música no es válida");
        }

        const currentPaths = this.musicPaths;
        const musicPaths = PlayerSettings.normalizeMusicPaths([
            ...currentPaths,
            normalizedPath
        ]);
        const changed = musicPaths.length !== currentPaths.length ||
            musicPaths.some((value, index) => value !== currentPaths[index]);

        if (changed) {
            this.#settings.musicPaths = musicPaths;
            this.save();
        }

        return {
            changed,
            musicPaths: [...musicPaths]
        };
    }

    removeMusicPath(path) {
        const normalizedPath = normalizeMusicPath(path);
        if (!normalizedPath) {
            return false;
        }

        const currentPaths = this.musicPaths;
        const musicPaths = currentPaths.filter(value =>
            value.toLowerCase() !== normalizedPath.toLowerCase()
        );

        if (musicPaths.length === currentPaths.length) {
            return false;
        }

        this.#settings.musicPaths = musicPaths;
        this.save();
        return true;
    }

    static normalizeMusicPaths(paths) {
        const roots = [];
        const candidates = Array.isArray(paths) ? paths : [paths];

        for (const candidate of candidates) {
            const path = normalizeMusicPath(candidate);
            if (!path || roots.some(root =>
                isSameOrNestedPath(root, path)
            )) {
                continue;
            }

            const retainedRoots = roots.filter(root =>
                !isSameOrNestedPath(path, root)
            );
            roots.splice(0, roots.length, ...retainedRoots, path);
        }

        return roots;
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
        try {
            const json = localStorage.getItem(
                PlayerSettings.STORAGE_KEY
            );

            if (json) {
                const storedSettings = JSON.parse(json);
                const musicPaths = Array.isArray(storedSettings.musicPaths)
                    ? storedSettings.musicPaths
                    : [storedSettings.musicPath];

                this.#settings = {
                    ...structuredClone(PlayerSettings.DEFAULT_SETTINGS),
                    ...storedSettings,
                    musicPaths: PlayerSettings.normalizeMusicPaths(musicPaths)
                };
                delete this.#settings.musicPath;

                if (
                    ![null, "artist", "album", "tracks50"].includes(
                        this.#settings.queueEndMode
                    )
                ) {
                    this.#settings.queueEndMode = null;
                }

                if (
                    !PlayerSettings.STARTUP_MODES.includes(
                        this.#settings.startupMode
                    )
                ) {
                    this.#settings.startupMode = "lastQueue";
                }

                if (!PlayerSettings.THEMES.includes(this.#settings.theme)) {
                    this.#settings.theme = "dark";
                }

                if (
                    !Number.isInteger(this.#settings.libraryPanelWidth) ||
                    this.#settings.libraryPanelWidth < 250 ||
                    this.#settings.libraryPanelWidth > 600
                ) {
                    this.#settings.libraryPanelWidth = 300;
                }

                if (
                    !Number.isInteger(this.#settings.queuePanelWidth) ||
                    this.#settings.queuePanelWidth < 280 ||
                    this.#settings.queuePanelWidth > 650
                ) {
                    this.#settings.queuePanelWidth = 350;
                }

                if (!this.#isValidLastQueue(this.#settings.lastQueue)) {
                    this.#settings.lastQueue = null;
                }

                if (
                    !Array.isArray(storedSettings.musicPaths) ||
                    storedSettings.musicPath ||
                    JSON.stringify(storedSettings.musicPaths) !==
                        JSON.stringify(this.#settings.musicPaths)
                ) {
                    this.save();
                }
            }

        }
        catch {
            this.reset();
        }

        return this.#settings;
    }

    #isValidLastQueue(queue) {
        return queue === null || (
            typeof queue === "object" &&
            !Array.isArray(queue) &&
            Array.isArray(queue.trackPaths) &&
            queue.trackPaths.length > 0 &&
            queue.trackPaths.every(path => typeof path === "string") &&
            Number.isInteger(queue.currentIndex) &&
            queue.currentIndex >= 0 &&
            queue.currentIndex < queue.trackPaths.length &&
            Array.isArray(queue.shuffleOrder) &&
            (
                queue.shuffleOrder.length === 0 ||
                (
                    queue.shuffleOrder.length === queue.trackPaths.length &&
                    new Set(queue.shuffleOrder).size ===
                        queue.trackPaths.length &&
                    queue.shuffleOrder.every(index =>
                        Number.isInteger(index) &&
                        index >= 0 &&
                        index < queue.trackPaths.length
                    )
                )
            )
        );
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
        this.#settings = structuredClone(
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


    get musicPaths() {
        return [...this.#settings.musicPaths];
    }

    set musicPaths(value) {
        this.#settings.musicPaths =
            PlayerSettings.normalizeMusicPaths(value);
        this.save();
    }

    get musicPath() {
        return this.#settings.musicPaths[0] ?? "";
    }

    set musicPath(value) {
        this.musicPaths = value ? [value] : [];
    }


    /**
     * Volumen del reproductor.
     * Rango: 0.0 - 1.0
     */
    get volume() {
        return this.#settings.volume;
    }

    set volume(value) {
        this.#settings.volume = Math.max(0, Math.min(1, value));
        this.save();
    }


    /**
     * Estado del modo aleatorio.
     */
    get shuffle() {
        return this.#settings.shuffle;
    }

    set shuffle(value) {
        this.#settings.shuffle = Boolean(value);
        this.save();
    }


    /**
     * Estado del modo repetición.
     */
    get repeat() {
        return this.#settings.repeat;
    }

    set repeat(value) {
        this.#settings.repeat = Boolean(value);
        this.save();
    }

    get queueEndMode() {
        return this.#settings.queueEndMode;
    }

    set queueEndMode(value) {
        if (![null, "artist", "album", "tracks50"].includes(value)) {
            throw new RangeError(`Modo de generación no válido: ${value}`);
        }

        this.#settings.queueEndMode = value;
        this.save();
    }

    get startupMode() {
        return this.#settings.startupMode;
    }

    set startupMode(value) {
        if (!PlayerSettings.STARTUP_MODES.includes(value)) {
            throw new RangeError(`Modo de inicio no válido: ${value}`);
        }

        this.#settings.startupMode = value;
        this.save();
    }

    get theme() {
        return this.#settings.theme;
    }

    set theme(value) {
        if (!PlayerSettings.THEMES.includes(value)) {
            throw new RangeError(`Tema no válido: ${value}`);
        }

        this.#settings.theme = value;
        this.save();
    }

    get libraryPanelWidth() {
        return this.#settings.libraryPanelWidth;
    }

    set libraryPanelWidth(value) {
        if (!Number.isInteger(value) || value < 250 || value > 600) {
            throw new RangeError(
                `Anchura del panel de biblioteca no válida: ${value}`
            );
        }

        this.#settings.libraryPanelWidth = value;
        this.save();
    }

    get queuePanelWidth() {
        return this.#settings.queuePanelWidth;
    }

    set queuePanelWidth(value) {
        if (!Number.isInteger(value) || value < 280 || value > 650) {
            throw new RangeError(
                `Anchura del panel de lista no válida: ${value}`
            );
        }

        this.#settings.queuePanelWidth = value;
        this.save();
    }

    get lastQueue() {
        return this.#settings.lastQueue
            ? structuredClone(this.#settings.lastQueue)
            : null;
    }

    set lastQueue(value) {
        if (!this.#isValidLastQueue(value)) {
            throw new TypeError("El estado de la última cola no es válido");
        }

        this.#settings.lastQueue = value
            ? structuredClone(value)
            : null;
        this.save();
    }


    /**
     * Shader seleccionado actualmente.
     */
    get shaderIndex() {
        return this.#settings.shaderIndex;
    }

    set shaderIndex(value) {
        this.#settings.shaderIndex = value;
        this.save();
    }

    
}