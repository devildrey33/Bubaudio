import shaderData from "./shaders";

import { getCurrentWindow } from "@tauri-apps/api/window";

import AudioAnalyzer        from "./audio/AudioAnalyzer.js";
import Visualizer           from "./rendering/Visualizer.js";

import PlayerControls       from "./ui/PlayerControls.js";
import QueuePanel           from "./ui/QueuePanel2.js";
import LibraryPanel         from "./ui/LibraryPanel.js";
import AudioDebugPanel      from "./ui/AudioDebugPanel.js";
import NowPlayingTooltip    from "./ui/NowPlayingTooltip.js";
import RandomListTooltip    from "./ui/RandomListTooltip.js";
import LibraryScanProgressPanel from "./ui/LibraryScanProgressPanel.js";
import OptionsPanel        from "./ui/OptionsPanel.js";
import PanelResizeController from "./ui/PanelResizeController.js";

import PlayerSettings       from "./settings/PlayerSettings.js";

import LibraryIndexer       from "./libraryindexer/LibraryIndexer.js";

import Player               from "./playlist/Player.js";
import PlaylistStore        from "./playlist/PlaylistStore.js";


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

function normalizeTrackPath(path) {
    return String(path)
        .replace(/[\\/]/g, "\\")
        .replace(/\\+$/, "")
        .toLowerCase();
}


export default class Application {

    #fullscreenToggleQueue = Promise.resolve();

    #debugMode = true;

    constructor() {
        this.settings       = null;
        this.library        = null;
        this.playlistStore  = null;

        this.audio          = null;
        this.player         = null;
        this.panelQueue     = null;
        this.panelLibrary   = null;
        this.panelControls  = null;
        this.debugPanel     = null;
        this.renderer       = null;
        this.nowPlayingTooltip = null;
        this.randomListTooltip = null;
        this.libraryScanProgressPanel = null;
        this.optionsPanel = null;
        this.libraryPanelResizer = null;
        this.queuePanelResizer = null;
    }


    async initialize() {

        //======================================================================
        // Configuración
        //======================================================================

        this.settings = new PlayerSettings();

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
                await this.library.scan(this.settings.musicPaths);
                this.panelLibrary?.render();
            }
        );

        if (this.settings.musicPaths.length === 0) {
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

        this.panelControls = new PlayerControls(
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

        this.settings.lastQueue = {
            trackPaths: queue.items.map(item => item.track.path),
            currentIndex: Number.isInteger(currentIndex) ? currentIndex : 0,
            shuffleOrder
        };
    }

    async #saveCurrentPlaylist(name) {
        const tracks = this.player.queue.orderedItems.map(
            item => item.track
        );
        const playlist = await this.playlistStore.create(name, tracks);
        this.panelLibrary?.refresh();
        return playlist;
    }

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

        for (const savedIndex of validSavedIndexes) {
            savedIndexToCurrentIndex.set(savedIndex, tracks.length);
            tracks.push(savedTracks[savedIndex]);
        }

        const shuffleOrder = snapshot.shuffleOrder
            .map(index => savedIndexToCurrentIndex.get(index))
            .filter(index => Number.isInteger(index));
        const orderedIndexes = [...new Set(shuffleOrder)];
        if (snapshot.shuffleOrder.length > 0) {
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