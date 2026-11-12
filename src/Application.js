import shaderData from "./shaders";

import AudioAnalyzer   from "./audio/AudioAnalyzer.js";
import Visualizer      from "./rendering/Visualizer.js";

import PlayerControls  from "./ui/PlayerControls.js";

import PlayerSettings  from "./settings/PlayerSettings.js";

import LibraryIndexer  from "./libraryindexer/LibraryIndexer.js";

import Player          from "./playlist/Player.js";


export default class Application {

    constructor() {
        this.settings  = null;
        this.library   = null;

        this.audio     = null;
        this.player    = null;

        this.controls  = null;
        this.renderer  = null;
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

        this.player = new Player(this.audio);

        this.renderer = new Visualizer(this.audio);
        this.renderer.setShader(this.settings.shaderIndex);
        this.renderer.start();

        //======================================================================
        // UI
        //======================================================================

        this.controls = new PlayerControls(
            this.player,
//            this.player.queue,
            this.settings,
            this.renderer
        );


        //======================================================================
        // Eventos de depuración
        //======================================================================

        this.#setupDebugEvents();

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

}