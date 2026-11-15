import shaderData from "./shaders";

import { getCurrentWindow } from "@tauri-apps/api/window";

import AudioAnalyzer        from "./audio/AudioAnalyzer.js";
import Visualizer           from "./rendering/Visualizer.js";

import PlayerControls       from "./ui/PlayerControls.js";
import QueuePanel           from "./ui/QueuePanel.js";
import LibraryPanel         from "./ui/LibraryPanel.js";
import AudioDebugPanel      from "./ui/AudioDebugPanel.js";
import NowPlayingTooltip    from "./ui/NowPlayingTooltip.js";

import PlayerSettings       from "./settings/PlayerSettings.js";

import LibraryIndexer       from "./libraryindexer/LibraryIndexer.js";

import Player               from "./playlist/Player.js";


export default class Application {

    #fullscreenToggleQueue = Promise.resolve();

    #debugMode = true;

    constructor() {
        this.settings       = null;
        this.library        = null;

        this.audio          = null;
        this.player         = null;
        this.panelQueue     = null;
        this.panelLibrary   = null;
        this.panelControls  = null;
        this.debugPanel     = null;
        this.renderer       = null;
    }


    async initialize() {

        //======================================================================
        // Configuración
        //======================================================================

        this.settings = new PlayerSettings();

        this.settings.load();

        if (this.settings.musicPath === "") {
            await this.settings.selectFolder();
        }


        //======================================================================
        // Biblioteca
        //======================================================================

        this.library = new LibraryIndexer();

        try {

            await this.library.load();

            console.log(
                `Biblioteca cargada (${this.library.artistCount} artistas, ${this.library.albumCount} álbumes, ${this.library.trackCount} canciones)`
            );
        }
        catch {

            console.log("Escaneando biblioteca...");

            await this.library.scan(this.settings.musicPath);

            await this.library.save();

            console.log(
                `Biblioteca escaneada (${this.library.artistCount} artistas, ${this.library.albumCount} álbumes, ${this.library.trackCount} canciones)`
            );
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
        this.renderer.canvas.addEventListener(
            "dblclick",
            () => this.#toggleFullscreen()
        );
        this.renderer.start();

        //======================================================================
        // UI
        //======================================================================

        this.panelControls = new PlayerControls(
            this.player,
//            this.player.queue,
            this.settings,
            this.renderer,
            this.library
        );

        this.panelQueue = new QueuePanel();
        this.player.addEventListener("queuechanged", () => {
            this.panelQueue.setQueue(this.player.queue);

            if (this.player.queue.currentQueueId !== null) {
                this.panelQueue.setCurrentTrack(
                    this.player.queue.currentQueueId
                );
            }
        });

        this.player.addEventListener("shufflechange", () => {
            this.panelQueue.setQueue(this.player.queue);

            if (this.player.queue.currentQueueId !== null) {
                this.panelQueue.setCurrentTrack(
                    this.player.queue.currentQueueId
                );
            }
        });

        this.panelLibrary = new LibraryPanel(
            this.library,
            this.player,
            this.panelQueue
        );

        this.nowPlayingTooltip= new NowPlayingTooltip();


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

        });        

        console.log("Application inicializada");
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