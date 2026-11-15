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