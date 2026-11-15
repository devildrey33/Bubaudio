export default class LibraryPanel {

    #container;
    #library;

    constructor(library, containerId = "library-tree") {

        this.#library = library;
        this.#container = document.getElementById(containerId);

        if (!this.#container) {
            throw new Error(
                `LibraryPanel: no se encontró el contenedor '${containerId}'`
            );
        }

        this.render();
    }


    render() {

        this.#container.replaceChildren();

        if (this.#library.artistCount === 0) {
            const emptyMessage = document.createElement("div");
            emptyMessage.className = "library-empty";
            emptyMessage.textContent = "La biblioteca está vacía";
            this.#container.appendChild(emptyMessage);
            return;
        }

        const artists = [...this.#library.artists].sort((a, b) =>
            a.name.localeCompare(b.name, "es", {
                numeric: true,
                sensitivity: "base"
            })
        );

        for (const artist of artists) {
            this.#container.appendChild(
                this.#createArtistNode(artist)
            );
        }
    }


    #createArtistNode(artist) {

        const artistNode = document.createElement("details");
        artistNode.className = "library-node library-artist";

        const artistLabel = document.createElement("summary");
        artistLabel.className = "library-row";
        artistLabel.textContent = artist.name;
        artistNode.appendChild(artistLabel);

        const albums = this.#library
            .getArtistAlbums(artist.id)
            .sort((a, b) => a.title.localeCompare(b.title, "es", {
                numeric: true,
                sensitivity: "base"
            }));

        const albumList = document.createElement("div");
        albumList.className = "library-children";

        for (const album of albums) {
            albumList.appendChild(
                this.#createAlbumNode(album)
            );
        }

        artistNode.appendChild(albumList);
        return artistNode;
    }


    #createAlbumNode(album) {

        const albumNode = document.createElement("details");
        albumNode.className = "library-node library-album";

        const albumLabel = document.createElement("summary");
        albumLabel.className = "library-row";
        albumLabel.textContent = album.title;
        albumNode.appendChild(albumLabel);

        const tracks = this.#library
            .getAlbumTracks(album.id)
            .sort((a, b) => a.title.localeCompare(b.title, "es", {
                numeric: true,
                sensitivity: "base"
            }));

        const trackList = document.createElement("div");
        trackList.className = "library-children library-tracks";

        for (const track of tracks) {
            const trackRow = document.createElement("div");
            trackRow.className = "library-row library-track";
            trackRow.textContent = track.title;
            trackList.appendChild(trackRow);
        }

        albumNode.appendChild(trackList);
        return albumNode;
    }
}