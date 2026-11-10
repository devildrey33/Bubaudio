//import * as THREE from "../node_modules/three/build/three.module.js";
import shaders from "./shaders";
import AudioAnalyzer from "./audio/AudioAnalyzer.js";
import Visualizer from "./rendering/Visualizer.js";
import PlayerControls from "./ui/PlayerControls.js";
import testMp3 from "./assets/audio/test.mp3";
import PlayerSettings from "./settings/PlayerSettings.js";
import LibraryIndexer from "./libraryindexer/LibraryIndexer.js";
import PlaybackQueue from "./playlist/PlaybackQueue.js";

// Cargo las opciones
const settings = new PlayerSettings();
settings.load();

if (settings.musicPath === "") {
    await settings.selectFolder();
}

// Modificar opciones
/*settings.musicPath = '';
//settings.musicPath = String.raw`\\St0rm-nas\mp3`;
settings.volume = 0.75;
settings.shuffle = true;

// Guardar
settings.save();*/

const library = new LibraryIndexer();


// Inicio la lista
const queue = new PlaybackQueue();
queue.add({
    artist: "null",
    album: "null",
    title: "null",
    path: "./assets/audio/test.mp3"
});
queue.shuffle = true;
queue.repeat = true;


// Inicio el audio y los controles
const audio = new AudioAnalyzer();
//await audio.load(queue.current.path);

const controls = new PlayerControls(audio, queue, settings);


const renderer = new Visualizer(
    audio,
//        shaders.spiral,
//        shaders.tunnel,
//        shaders.digitalocean,
//        shaders.plasma,
        shaders.digitalocean2,
//        shaders.livingorb2,


    //shaders.livingorb,
        //shaders.dualwaveform,
//        shaders.liquidorb,
//   shaders.liquidorb2,
//    shaders.dualoscy,
    
//    shaders.galaxy,
    shaders.fullscreen
);

renderer.start();

await audio.load(testMp3);

await audio.resume();
audio.play();


//await library.scan("c:\\Jocs");
try {
    await library.load();
    console.log("Biblioteca cargada desde AppData :" + library.artistCount + " artistas, " + library.albumCount + " álbumes" + ", " + library.trackCount + " canciones");
}
catch {
    console.log("Escaneando biblioteca musical...");
    await library.scan(settings.musicPath);
    await library.save();
    console.log("Biblioteca escaneada y guardada :" + library.artistCount + " artistas, " + library.albumCount + " álbumes" + ", " + library.trackCount + " canciones");
}