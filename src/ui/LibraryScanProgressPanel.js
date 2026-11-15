export default class LibraryScanProgressPanel {

    #overlay;
    #status;
    #artist;
    #folder;
    #counts;
    #hideTimer = null;

    constructor(library) {
        this.#overlay = document.getElementById("library-scan-overlay");
        this.#status = document.getElementById("library-scan-status");
        this.#artist = document.getElementById("library-scan-artist");
        this.#folder = document.getElementById("library-scan-folder");
        this.#counts = document.getElementById("library-scan-counts");

        if (
            !this.#overlay ||
            !this.#status ||
            !this.#artist ||
            !this.#folder ||
            !this.#counts
        ) {
            throw new Error(
                "LibraryScanProgressPanel: no se encontró el panel de progreso"
            );
        }

        library.addEventListener("scanstart", () => this.#onScanStart());
        library.addEventListener(
            "scanprogress",
            event => this.#onScanProgress(event.detail)
        );
        library.addEventListener(
            "scancomplete",
            event => this.#onScanComplete(event.detail)
        );
        library.addEventListener(
            "scanerror",
            event => this.#onScanError(event.detail.error)
        );
    }

    #onScanStart() {
        clearTimeout(this.#hideTimer);
        this.#hideTimer = null;
        this.#status.textContent = "Preparando el escaneo...";
        this.#artist.textContent = "Grupo: —";
        this.#folder.textContent = "Carpeta: —";
        this.#setCounts(0, 0, 0);
        this.#overlay.hidden = false;
    }

    #onScanProgress(progress) {
        const folderName = progress.currentPath
            .split(/[\\/]/)
            .filter(Boolean)
            .pop();

        this.#status.textContent = "Buscando música...";
        this.#artist.textContent = `Grupo: ${progress.artistName || "—"}`;
        this.#folder.textContent = `Carpeta: ${folderName || "—"}`;
        this.#setCounts(
            progress.artistCount,
            progress.albumCount,
            progress.trackCount
        );
    }

    #onScanComplete(result) {
        this.#setCounts(
            result.artistCount,
            result.albumCount,
            result.trackCount
        );
        this.#status.textContent = "Escaneo completado";
        this.#hideAfter(500);
    }

    #onScanError(error) {
        const message = error instanceof Error ? error.message : String(error);
        this.#status.textContent = `Error al escanear: ${message}`;
        this.#hideAfter(3000);
    }

    #setCounts(artists, albums, tracks) {
        this.#counts.textContent =
            `${artists} grupos · ${albums} discos · ${tracks} canciones`;
    }

    #hideAfter(delay) {
        clearTimeout(this.#hideTimer);
        this.#hideTimer = setTimeout(() => {
            this.#overlay.hidden = true;
            this.#hideTimer = null;
        }, delay);
    }
}
