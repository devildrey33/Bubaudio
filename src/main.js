import Application from "./Application.js";

const app = new Application();
await app.initialize();
app.settings.reset();


window.app = app;


app.audio.load("C:\\devildrey33\\Bubaudio\\src\\assets\\audio\\test.mp3");


/*const album = app.library.albums[0];

const tracks = app.library.getAlbumTracks(album.id);
//console.log(tracks);

await app.player.playQueue(tracks);*/