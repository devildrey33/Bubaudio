import Application from "./Application.js";

const app = new Application();
await app.initialize();
window.app = app;


//app.audio.load("C:\\devildrey33\\Bubaudio\\src\\assets\\audio\\test.mp3");


const album = app.library.randomAlbum();
const tracks = app.library.getAlbumTracks(album.id);
//console.log(tracks);

await app.player.playQueue(tracks);
app.panelQueue.setQueue(app.player.queue);
