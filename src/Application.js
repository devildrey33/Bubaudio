import shaderData from "./shaders";

import { getCurrentWindow }     from "@tauri-apps/api/window";

import AudioAnalyzer            from "./audio/AudioAnalyzer.js";
import Visualizer               from "./rendering/Visualizer.js";

import ControlsPanel           from "./ui/ControlsPanel.js";
import QueuePanel               from "./ui/QueuePanel2.js";
import LibraryPanel             from "./ui/LibraryPanel.js";
import AudioDebugPanel          from "./ui/AudioDebugPanel.js";
import NowPlayingTooltip        from "./ui/NowPlayingTooltip.js";
import RandomListTooltip        from "./ui/RandomListTooltip.js";
import LibraryScanProgressPanel from "./ui/LibraryScanProgressPanel.js";
import OptionsPanel             from "./ui/OptionsPanel.js";
import PanelResizeController    from "./ui/PanelResizeController.js";

import PlayerSettings           from "./settings/PlayerSettings.js";

import LibraryIndexer           from "./libraryindexer/LibraryIndexer.js";

import Player                   from "./playlist/Player.js";
import PlaylistStore            from "./playlist/PlaylistStore.js";


/**
 * Compara dos listas de raíces de música sin distinguir mayúsculas ni tipos
 * de separador. Mantiene significativo el orden de las rutas y elimina
 * separadores finales para que variaciones de formato no fuercen otro escaneo.
 *
 * @param {string[]} first Primera lista de rutas.
 * @param {string[]} second Segunda lista de rutas.
 * @returns {boolean} true si ambas listas normalizadas coinciden en orden.
 */
function sameMusicPaths(first, second) {
    const normalize = path => String(path)
        .replace(/[\\/]/g, "\\")
        .replace(/\\+$/, "")
        .toLowerCase();
    const normalizedFirst = first.map(normalize);
    const normalizedSecond = second.map(normalize);

    return normalizedFirst.length === normalizedSecond.length &&
        normalizedFirst.every((path, index) =>
            path === normalizedSecond[index]
        );
}

/**
 * Normaliza una ruta de pista para poder relacionarla con la biblioteca aunque
 * difieran las mayúsculas o el tipo de separador. No comprueba la existencia
 * del archivo ni modifica la ruta original.
 *
 * @param {string} path Ruta de una pista.
 * @returns {string} Ruta normalizada para usar como clave.
 */
function normalizeTrackPath(path) {
    return String(path)
        .replace(/[\\/]/g, "\\")
        .replace(/\\+$/, "")
        .toLowerCase();
}


/**
 * Punto de composición de la aplicación. Carga preferencias e índice musical,
 * crea los servicios de audio y reproducción, conecta sus eventos con la
 * interfaz y aplica la acción configurada para el inicio.
 */
export default class Application {

    // Encadena las solicitudes de pantalla completa para que lecturas y cambios
    // rápidos no se ejecuten concurrentemente.
    #fullscreenToggleQueue = Promise.resolve();

    // Permite activar o desactivar el panel de diagnóstico de audio.
    #debugMode = true;

    /**
     * Inicializa las referencias. Los servicios y paneles se crean más tarde
     * en initialize(), siguiendo el orden requerido por sus dependencias.
     */
    constructor() {
        this.settings                   = null;
        this.library                    = null;
        this.playlistStore              = null;

        this.audio                      = null;
        this.player                     = null;
        this.panelQueue                 = null;
        this.panelLibrary               = null;
        this.panelControls              = null;
        this.debugPanel                 = null;
        this.renderer                   = null;
        this.nowPlayingTooltip          = null;
        this.randomListTooltip          = null;
        this.libraryScanProgressPanel   = null;
        this.optionsPanel               = null;
        this.libraryPanelResizer        = null;
        this.queuePanelResizer          = null;
    }


    /**
     * Arranca la aplicación en fases:
     * 1. Carga ajustes, crea los controladores de tamaño y prepara la biblioteca.
     * 2. Carga o escanea la biblioteca, solicitando raíces si aún no existen.
     * 3. Crea audio, reproductor y visualizador.
     * 4. Construye los paneles y enlaza eventos de UI/reproducción.
     * 5. Restaura la cola o ejecuta el modo de inicio elegido.
     *
     * Los errores de carga de listas guardadas se notifican sin impedir el
     * resto de la inicialización; los demás errores no capturados se propagan.
     *
     * @returns {Promise<void>}
     */
    async initialize() {

        //======================================================================
        // Configuración
        //======================================================================

        this.settings = new PlayerSettings();

        // load() aplica valores por defecto/migraciones; el tema se refleja en
        // el documento antes de crear componentes visuales.
        this.settings.load();
        document.documentElement.dataset.theme = this.settings.theme;
//        this.settings.reset();

        this.libraryPanelResizer = new PanelResizeController({
            panelId: "library-panel",
            handleId: "library-resize-handle",
            settings: this.settings,
            settingName: "libraryPanelWidth",
            cssVariable: "--library-panel-width",
            anchor: "right",
            minWidth: 250,
            maxWidth: 600
        });
        this.queuePanelResizer = new PanelResizeController({
            panelId: "queue-panel",
            handleId: "queue-resize-handle",
            settings: this.settings,
            settingName: "queuePanelWidth",
            cssVariable: "--queue-panel-width",
            anchor: "left",
            minWidth: 280,
            maxWidth: 650
        });

        this.library = new LibraryIndexer();
        this.playlistStore = new PlaylistStore();
        // Un archivo de listas dañado no bloquea la biblioteca ni el reproductor.
        try {
            await this.playlistStore.load();
        }
        catch (error) {
            console.error("No se pudieron cargar las listas guardadas", error);
            window.alert(
                `No se pudieron cargar las listas guardadas: ${String(error)}`
            );
        }

        this.libraryScanProgressPanel =
            new LibraryScanProgressPanel(this.library);
        this.optionsPanel = new OptionsPanel(
            this.settings,
            async () => {
                // El callback usado al cambiar las raíces vuelve a indexar y
                // refresca la vista cuando termina el escaneo.
                await this.library.scan(this.settings.musicPaths);
                this.panelLibrary?.render();
            }
        );

        if (this.settings.musicPaths.length === 0) {
            // Sin una raíz configurada, la selección inicial es necesaria para
            // tener una biblioteca que el reproductor pueda consultar.
            await this.optionsPanel.open({ required: true });
        }
        else {
            await this.#loadOrScanLibrary();
        }


        //======================================================================
        // Audio
        //======================================================================

        this.audio = new AudioAnalyzer();

        if (this.#debugMode) {
            this.debugPanel = new AudioDebugPanel(this.audio);
        }

        this.player = new Player(this.audio, this.panelQueue);
        this.player.setShuffle(this.settings.shuffle);
        this.player.setRepeatMode(
            this.settings.repeat ? "queue" : "none"
        );

        this.renderer = new Visualizer(this.audio);
        this.renderer.setShader(this.settings.shaderIndex);
        // El doble clic alterna pantalla completa solo si no ocurrió sobre un
        // control o elemento interactivo de la interfaz.
        document.addEventListener("dblclick", (event) => {
            const target = event.target;

            if (
                target instanceof Element &&
                target.closest(
                    "button, input, select, textarea, a, summary, " +
                    ".queue-item, .library-row, [role='button'], [role='menuitem']"
                )
            ) {
                return;
            }

            this.#toggleFullscreen();
        });
        this.renderer.start();

        //======================================================================
        // UI
        //======================================================================

        this.panelControls = new ControlsPanel(
            this.player,
//            this.player.queue,
            this.settings,
            this.renderer,
            this.library,
            () => this.optionsPanel.open()
        );

        this.panelQueue = new QueuePanel(this.player, this.library, {
            onSavePlaylist: name => this.#saveCurrentPlaylist(name)
        });
        // Los cambios de cola/mezcla refrescan el panel y guardan una
        // instantánea para poder recuperar la sesión en el próximo inicio.
        this.player.addEventListener("queuechanged", () => {
            this.panelQueue.setQueue(this.player.queue);

            if (this.player.queue.currentQueueId !== null) {
                this.panelQueue.setCurrentTrack(
                    this.player.queue.currentQueueId
                );
            }

            this.#persistLastQueue();
        });

        this.player.addEventListener("shufflechange", () => {
            this.panelQueue.setQueue(this.player.queue);

            if (this.player.queue.currentQueueId !== null) {
                this.panelQueue.setCurrentTrack(
                    this.player.queue.currentQueueId
                );
            }

            this.#persistLastQueue();
        });

        this.panelLibrary = new LibraryPanel(
            this.library,
            this.player,
            this.panelQueue,
            this.playlistStore
        );

        this.nowPlayingTooltip = new NowPlayingTooltip();
        this.randomListTooltip = new RandomListTooltip();


        //======================================================================
        // Eventos de depuración
        //======================================================================

        this.#setupDebugEvents();

        this.player.addEventListener("trackchanged", (event) => {
            this.nowPlayingTooltip.show(
                event.detail.track
            );

            this.panelQueue.setCurrentTrack(
                event.detail.item.queueId
            );

            this.#persistLastQueue();
        });        

        this.player.addEventListener("randomlistgenerated", (event) => {
            this.randomListTooltip.show(event.detail.label);
        });

        await this.#startConfiguredPlayback();

        console.log("Application inicializada");
    }

    /**
     * Intenta cargar el índice persistido y compara sus raíces con las
     * configuradas. Si falta, está dañado o corresponde a otras rutas, escanea
     * la biblioteca actual y registra el resultado. Un error de carga se
     * informa en consola y se trata como índice que debe reconstruirse; los
     * errores del nuevo escaneo se propagan.
     *
     * @returns {Promise<void>}
     * @private
     */
    async #loadOrScanLibrary() {
        let libraryIsCurrent = false;
        try {
            await this.library.load();

            libraryIsCurrent = sameMusicPaths(
                this.library.musicPaths,
                this.settings.musicPaths
            );
        }
        catch (error) {
            console.warn("No se pudo cargar el índice de música", error);
        }

        if (!libraryIsCurrent) {
            console.log("Escaneando biblioteca...");
            await this.library.scan(this.settings.musicPaths);

            console.log(
                `Biblioteca escaneada (${this.library.artistCount} artistas, ${this.library.albumCount} álbumes, ${this.library.trackCount} canciones)`
            );
        }
        else {
            console.log(
                `Biblioteca cargada (${this.library.artistCount} artistas, ${this.library.albumCount} álbumes, ${this.library.trackCount} canciones)`
            );
        }
    }

    /**
     * Guarda una instantánea compacta de la cola en ajustes. Las pistas se
     * almacenan por ruta; currentIndex y shuffleOrder se expresan como índices
     * de queue.items para poder regenerar los queueId al restaurar.
     *
     * Si la cola está vacía, elimina la instantánea persistida.
     *
     * @private
     */
    #persistLastQueue() {
        const queue = this.player.queue;
        if (queue.items.length === 0) {
            this.settings.lastQueue = null;
            return;
        }

        const itemIndex = new Map(
            queue.items.map((item, index) => [item.queueId, index])
        );
        const currentIndex = itemIndex.get(queue.currentQueueId);
        const shuffleOrder = queue.shuffle
            ? queue.shuffleOrder
                .map(queueId => itemIndex.get(queueId))
                .filter(index => Number.isInteger(index))
            : [];

        // El setter valida la estructura y guarda una copia profunda en
        // PlayerSettings.
        this.settings.lastQueue = {
            trackPaths: queue.items.map(item => item.track.path),
            currentIndex: Number.isInteger(currentIndex) ? currentIndex : 0,
            shuffleOrder
        };
    }

    /**
     * Guarda como lista persistente las pistas en el orden visible de la cola,
     * refresca la biblioteca para mostrarla y devuelve el registro creado.
     *
     * @param {string} name Nombre de la lista nueva.
     * @returns {Promise<object>} Lista creada por PlaylistStore.
     * @private
     */
    async #saveCurrentPlaylist(name) {
        const tracks = this.player.queue.orderedItems.map(
            item => item.track
        );
        const playlist = await this.playlistStore.create(name, tracks);
        this.panelLibrary?.refresh();
        return playlist;
    }

    /**
     * Ejecuta la acción elegida para el inicio: restaura la última cola o pide
     * a los controles que generen una lista aleatoria del modo configurado.
     * Los errores se registran y se presentan al usuario en una alerta.
     *
     * @returns {Promise<void>}
     * @private
     */
    async #startConfiguredPlayback() {
        try {
            if (this.settings.startupMode === "lastQueue") {
                await this.#restoreLastQueue();
                return;
            }

            await this.panelControls.startWithRandomList(
                this.settings.startupMode
            );
        }
        catch (error) {
            console.error("No se pudo ejecutar la acción de inicio", error);
            window.alert(
                `No se pudo ejecutar la acción de inicio: ${String(error)}`
            );
        }
    }

    /**
     * Reconstruye la última cola guardada relacionando sus rutas con pistas de
     * la biblioteca actual. Omite las pistas que ya no existen y ajusta la
     * selección a la siguiente pista disponible desde el índice guardado (o a
     * la primera disponible). Si la cola guardada incluía mezcla, remapea sus
     * índices al conjunto filtrado y completa cualquier pista nueva/restante.
     *
     * Si no hay instantánea o ninguna ruta coincide con la biblioteca, no hace
     * nada.
     *
     * @returns {Promise<void>}
     * @private
     */
    async #restoreLastQueue() {
        const snapshot = this.settings.lastQueue;
        if (!snapshot) {
            return;
        }

        const tracksByPath = new Map(
            this.library.tracks.map(track => [
                normalizeTrackPath(track.path),
                track
            ])
        );
        const savedTracks = snapshot.trackPaths.map(path =>
            tracksByPath.get(normalizeTrackPath(path)) ?? null
        );
        const validSavedIndexes = savedTracks
            .map((track, index) => track ? index : -1)
            .filter(index => index >= 0);

        if (validSavedIndexes.length === 0) {
            return;
        }

        const selectedSavedIndex =
            validSavedIndexes.find(index => index >= snapshot.currentIndex) ??
            validSavedIndexes[0];
        const savedIndexToCurrentIndex = new Map();
        const tracks = [];

        // Compacta la cola eliminando pistas ausentes y conserva una relación
        // entre los índices guardados y los nuevos índices compactos.
        for (const savedIndex of validSavedIndexes) {
            savedIndexToCurrentIndex.set(savedIndex, tracks.length);
            tracks.push(savedTracks[savedIndex]);
        }

        const shuffleOrder = snapshot.shuffleOrder
            .map(index => savedIndexToCurrentIndex.get(index))
            .filter(index => Number.isInteger(index));
        const orderedIndexes = [...new Set(shuffleOrder)];
        if (snapshot.shuffleOrder.length > 0) {
            // La cola filtrada puede contener menos elementos que la original;
            // agrega los índices no presentes para producir una permutación.
            const orderedIndexSet = new Set(orderedIndexes);
            for (let index = 0; index < tracks.length; index++) {
                if (!orderedIndexSet.has(index)) {
                    orderedIndexes.push(index);
                }
            }
        }

        await this.player.restoreQueue(
            tracks,
            savedIndexToCurrentIndex.get(selectedSavedIndex),
            orderedIndexes
        );
    }


    /**
     * Registra trazas de diagnóstico para los eventos del reproductor. No
     * altera la cola ni el estado de reproducción.
     *
     * @private
     */
    #setupDebugEvents() {

        this.player.addEventListener("trackchanged", e => {
            console.log(
                "TRACK:",
                e.detail.track.artist,
                "-",
                e.detail.track.title
            );
        });


        this.player.addEventListener("play", () => {
            console.log("PLAY");
        });


        this.player.addEventListener("pause", () => {
            console.log("PAUSE");
        });
    }


    /**
     * Alterna el estado de pantalla completa de la ventana Tauri. Las llamadas
     * se encadenan para que cada una consulte el estado resultante de la
     * anterior; un fallo se registra y se absorbe para no romper la cadena de
     * solicitudes posteriores.
     *
     * @private
     */
    #toggleFullscreen() {

        this.#fullscreenToggleQueue = this.#fullscreenToggleQueue
            .then(async () => {
                const appWindow = getCurrentWindow();
                const isFullscreen = await appWindow.isFullscreen();
                await appWindow.setFullscreen(!isFullscreen);
            })
            .catch(error => {
                console.error(
                    "No se pudo alternar el modo de pantalla completa",
                    error
                );
            });
    }

}