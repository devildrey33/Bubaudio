export default class NowPlayingTooltip {

    #element;

    #title;
    #artist;
    #album;

    #hideTimer = null;

    constructor() {

        this.#element = document.getElementById(
            "now-playing-tooltip"
        );

        this.#title = document.getElementById(
            "now-playing-title"
        );

        this.#artist = document.getElementById(
            "now-playing-artist"
        );

        this.#album = document.getElementById(
            "now-playing-album"
        );
    }

    show(track) {
        if (!track) {
            return;
        }
        clearTimeout(this.#hideTimer);

        this.#title.textContent  = track.title ?? "";
        this.#artist.textContent = track.artist ?? "";
        this.#album.textContent  = track.album ?? "";

        this.#element.classList.add(
            "visible"
        );

        this.#hideTimer = setTimeout(() => {
            this.hide();
        }, 5000);
    }


    hide() {
        this.#element.classList.remove(
            "visible"
        );
    }
}