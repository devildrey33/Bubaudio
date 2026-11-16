import FolderSelector from "./FolderSelector.js";


/**
 * Normaliza una ruta raíz de música para almacenarla y compararla en Windows.
 * Convierte separadores, colapsa repeticiones sin destruir el prefijo UNC,
 * quita separadores finales (salvo la raíz de una unidad) y devuelve null
 * cuando el valor no es una cadena no vacía.
 *
 * @param {*} value Valor que se interpretará como ruta.
 * @returns {string|null} Ruta normalizada o null si está vacía/no es texto.
 */
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

/**
 * Comprueba si candidatePath coincide con parentPath o está dentro de él.
 * La comparación ignora mayúsculas y añade un separador al prefijo para no
 * confundir rutas vecinas como "Music" y "Music-old".
 *
 * @param {string} parentPath Ruta raíz candidata.
 * @param {string} candidatePath Ruta que se compara con la raíz.
 * @returns {boolean} true si ambas rutas son iguales o una está anidada.
 */
function isSameOrNestedPath(parentPath, candidatePath) {
    const parent = parentPath.toLowerCase();
    const candidate = candidatePath.toLowerCase();
    const prefix = parent.endsWith("\\") ? parent : `${parent}\\`;

    return candidate === parent || candidate.startsWith(prefix);
}


/**
 * Gestiona las preferencias del reproductor y su persistencia en localStorage.
 * Los valores predeterminados y las listas de valores permitidos se definen en
 * propiedades estáticas; la instancia mantiene el estado editable actual.
 */
export default class PlayerSettings {

    // Clave de almacenamiento y valores aceptados para preferencias enumeradas.
    static STORAGE_KEY = "bubaudio.settings";
    static STARTUP_MODES = ["lastQueue", "artist", "album", "tracks50"];
    static THEMES = ["dark", "light"];

    // Esquema base aplicado al iniciar, restablecer o completar ajustes antiguos.
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
        // Índice del shader/visualización elegido por el usuario.
        shaderIndex:0
    };


    // Configuración actualmente cargada; se inicializa con una copia profunda
    // para no modificar el objeto estático de valores predeterminados.
    #settings;

    /**
     * Inicializa la instancia con una copia independiente de los valores por
     * defecto. Para recuperar las preferencias guardadas se debe llamar a load().
     */
    constructor() {
        this.#settings = structuredClone(
            PlayerSettings.DEFAULT_SETTINGS
        );
    }

    /**
     * Abre el selector nativo de carpetas y añade la ruta elegida a la lista
     * de raíces de música. Si se cancela, devuelve null; en otro caso devuelve
     * la ruta original junto con el resultado de addMusicPath, que indica si
     * cambió la lista normalizada.
     *
     * @returns {Promise<object|null>} Ruta y resultado de la operación, o null
     * si se canceló el diálogo.
     */
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

    /**
     * Añade una raíz de música normalizada. Las rutas redundantes se resuelven
     * con normalizeMusicPaths: se ignoran duplicados y raíces cubiertas por otra
     * más amplia, y una nueva raíz padre reemplaza sus raíces descendientes.
     * Si la lista cambia, actualiza el estado y lo guarda inmediatamente.
     *
     * @param {string} path Ruta que se quiere añadir.
     * @returns {{changed: boolean, musicPaths: string[]}} Indica si cambió y
     * devuelve una copia de la lista resultante.
     * @throws {TypeError} Si path no representa una ruta de texto válida.
     */
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
        // Compara longitud y posiciones para detectar tanto adiciones como
        // cambios de orden provocados por la normalización de raíces.
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

    /**
     * Elimina una raíz por coincidencia sin distinguir mayúsculas. Una entrada
     * inválida o no encontrada no modifica la configuración y devuelve false.
     *
     * @param {string} path Ruta que se quitará.
     * @returns {boolean} true si se eliminó una raíz.
     */
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

    /**
     * Normaliza una entrada que puede ser una ruta o una lista de rutas y
     * elimina raíces redundantes. El resultado conserva el orden de las raíces
     * retenidas; si se añade una raíz padre, esta sustituye las descendientes
     * que ya se habían añadido.
     *
     * @param {string|Array<string>} paths Ruta o conjunto de rutas.
     * @returns {string[]} Rutas válidas, normalizadas y no redundantes.
     */
    static normalizeMusicPaths(paths) {
        const roots = [];
        const candidates = Array.isArray(paths) ? paths : [paths];

        for (const candidate of candidates) {
            const path = normalizeMusicPath(candidate);
            // Una raíz ya retenida cubre esta ruta si es igual o ancestro.
            if (!path || roots.some(root =>
                isSameOrNestedPath(root, path)
            )) {
                continue;
            }

            // Si la ruta nueva es un ancestro, elimina las raíces más
            // específicas antes de agregarla.
            const retainedRoots = roots.filter(root =>
                !isSameOrNestedPath(path, root)
            );
            roots.splice(0, roots.length, ...retainedRoots, path);
        }

        return roots;
    }

    /**
     * Carga los ajustes desde localStorage y completa claves que falten con
     * los valores predeterminados. Normaliza rutas y valida los modos, el tema,
     * tamaños de panel y la última cola; también migra la clave antigua
     * musicPath al formato musicPaths.
     *
     * Si no hay datos guardados, conserva los valores iniciales. Si la lectura,
     * el análisis o la validación lanza una excepción, restablece y guarda los
     * valores predeterminados.
     *
     * @returns {object} Objeto de configuración interno de esta instancia.
     */
    load() {
        try {
            const json = localStorage.getItem(
                PlayerSettings.STORAGE_KEY
            );

            if (json) {
                const storedSettings = JSON.parse(json);
                // La expansión por defecto completa claves nuevas sin perder
                // valores guardados; luego se sobrescribe musicPaths con su
                // forma normalizada para aceptar también el esquema antiguo.
                const musicPaths = Array.isArray(storedSettings.musicPaths)
                    ? storedSettings.musicPaths
                    : [storedSettings.musicPath];

                this.#settings = {
                    ...structuredClone(PlayerSettings.DEFAULT_SETTINGS),
                    ...storedSettings,
                    musicPaths: PlayerSettings.normalizeMusicPaths(musicPaths)
                };
                delete this.#settings.musicPath;

                // Los valores enumerados desconocidos se sustituyen por un
                // valor seguro del esquema actual.
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

                // Guarda solo cuando hay que migrar/normalizar la estructura
                // de rutas o retirar la propiedad heredada musicPath.
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
            // Una configuración ilegible o incompatible se reemplaza por los
            // valores predeterminados y se persiste mediante reset().
            this.reset();
        }

        return this.#settings;
    }

    /**
     * Comprueba la estructura mínima necesaria para restaurar la última cola.
     * Acepta null como ausencia de cola; en caso contrario exige rutas de pista,
     * un índice actual válido y un orden aleatorio vacío o una permutación
     * completa de índices. No valida otros metadatos de la cola.
     *
     * @param {*} queue Valor que se quiere validar.
     * @returns {boolean} true si puede usarse como estado de cola guardado.
     * @private
     */
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
     * Serializa todos los ajustes actuales en localStorage con formato legible.
     * Si el almacenamiento no está disponible o falla, la excepción se propaga.
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
     * Sustituye todo el estado por una copia de los valores predeterminados y
     * guarda inmediatamente el resultado.
     */
    reset() {
        this.#settings = structuredClone(
            PlayerSettings.DEFAULT_SETTINGS
        );

        this.save();
    }


    /**
     * Devuelve el objeto interno completo de configuración. Es una referencia
     * mutable: modificarla directamente no valida ni guarda los cambios.
     */
    get settings() {
        return this.#settings;
    }


    /** Devuelve una copia superficial de las raíces de música configuradas. */
    get musicPaths() {
        return [...this.#settings.musicPaths];
    }

    /**
     * Reemplaza la lista de raíces, aplicando normalización y deduplicación, y
     * persiste el cambio.
     */
    set musicPaths(value) {
        this.#settings.musicPaths =
            PlayerSettings.normalizeMusicPaths(value);
        this.save();
    }

    /**
     * Alias compatible con el ajuste antiguo de una sola ruta: devuelve la
     * primera raíz configurada o una cadena vacía si no hay ninguna.
     */
    get musicPath() {
        return this.#settings.musicPaths[0] ?? "";
    }

    /** Alias de compatibilidad que reemplaza musicPaths por cero o una ruta. */
    set musicPath(value) {
        this.musicPaths = value ? [value] : [];
    }


    /**
     * Volumen inicial del reproductor. El setter limita el valor al rango
     * 0-1 y guarda el resultado.
     */
    get volume() {
        return this.#settings.volume;
    }

    set volume(value) {
        this.#settings.volume = Math.max(0, Math.min(1, value));
        this.save();
    }


    /** Indica si está activada la reproducción aleatoria. */
    get shuffle() {
        return this.#settings.shuffle;
    }

    set shuffle(value) {
        this.#settings.shuffle = Boolean(value);
        this.save();
    }


    /** Indica si está activada la repetición de la cola. */
    get repeat() {
        return this.#settings.repeat;
    }

    set repeat(value) {
        this.#settings.repeat = Boolean(value);
        this.save();
    }

    /** Modo que se usará para generar contenido al terminar la cola. */
    get queueEndMode() {
        return this.#settings.queueEndMode;
    }

    set queueEndMode(value) {
        // null desactiva la generación; los demás valores corresponden a
        // estrategias de selección conocidas por el reproductor.
        if (![null, "artist", "album", "tracks50"].includes(value)) {
            throw new RangeError(`Modo de generación no válido: ${value}`);
        }

        this.#settings.queueEndMode = value;
        this.save();
    }

    /** Acción que se ejecutará al iniciar la aplicación. */
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

    /** Tema visual actualmente seleccionado. */
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

    /** Anchura guardada del panel de biblioteca, en píxeles. */
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

    /** Anchura guardada del panel de cola, en píxeles. */
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

    /**
     * Devuelve una copia profunda del estado de la última cola para que el
     * consumidor no modifique accidentalmente la configuración almacenada.
     */
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


    /** Índice del shader/visualización seleccionado actualmente. */
    get shaderIndex() {
        return this.#settings.shaderIndex;
    }

    /**
     * Guarda el índice de shader recibido. No valida el rango; la comprobación
     * de que el índice existe corresponde al componente que carga los shaders.
     */
    set shaderIndex(value) {
        this.#settings.shaderIndex = value;
        this.save();
    }

    
}