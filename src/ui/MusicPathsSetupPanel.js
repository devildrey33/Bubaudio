export default class MusicPathsSetupPanel {

    #settings;
    #overlay;
    #pathList;
    #status;
    #addButton;
    #continueButton;
    #resolveSetup = null;

    constructor(settings) {
        this.#settings = settings;
        this.#overlay = document.getElementById("music-path-setup-overlay");
        this.#pathList = document.getElementById("music-path-list");
        this.#status = document.getElementById("music-path-setup-status");
        this.#addButton = document.getElementById("music-path-add");
        this.#continueButton = document.getElementById(
            "music-path-continue"
        );

        if (
            !this.#overlay ||
            !this.#pathList ||
            !this.#status ||
            !this.#addButton ||
            !this.#continueButton
        ) {
            throw new Error(
                "MusicPathsSetupPanel: no se encontró el panel de configuración"
            );
        }

        this.#addButton.addEventListener(
            "click",
            () => this.#onAddMusicPath()
        );
        this.#continueButton.addEventListener(
            "click",
            () => this.#finishSetup()
        );
        this.#renderPaths();
    }

    waitForSetup() {
        if (this.#settings.musicPaths.length > 0) {
            return Promise.resolve();
        }

        this.#overlay.hidden = false;
        this.#renderPaths();

        return new Promise(resolve => {
            this.#resolveSetup = resolve;
        });
    }

    async #onAddMusicPath() {
        this.#addButton.disabled = true;

        try {
            const result = await this.#settings.selectFolder();
            if (result) {
                this.#renderPaths(
                    result.changed
                        ? "Directorio añadido. Las rutas anidadas se consolidan automáticamente."
                        : "Este directorio ya está cubierto por una carpeta configurada."
                );
            }
        }
        catch (error) {
            console.error("No se pudo añadir el directorio de música", error);
            this.#status.textContent =
                `No se pudo seleccionar la carpeta: ${String(error)}`;
        }
        finally {
            this.#addButton.disabled = false;
        }
    }

    #renderPaths(statusMessage = null) {
        this.#pathList.replaceChildren();

        for (const path of this.#settings.musicPaths) {
            const item = document.createElement("div");
            item.className = "music-path-item";

            const label = document.createElement("span");
            label.textContent = path;

            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "music-path-remove";
            removeButton.textContent = "×";
            removeButton.setAttribute(
                "aria-label",
                `Quitar directorio ${path}`
            );
            removeButton.addEventListener("click", () => {
                this.#settings.removeMusicPath(path);
                this.#renderPaths();
            });

            item.append(label, removeButton);
            this.#pathList.appendChild(item);
        }

        const pathCount = this.#settings.musicPaths.length;
        this.#continueButton.disabled = pathCount === 0;
        this.#status.textContent = statusMessage ??
            (pathCount === 0
                ? "Añade al menos un directorio raíz para continuar."
                : `${pathCount} directorio(s) configurado(s). Puedes añadir más.`);
    }

    #finishSetup() {
        if (this.#settings.musicPaths.length === 0) {
            return;
        }

        this.#overlay.hidden = true;
        this.#resolveSetup?.();
        this.#resolveSetup = null;
    }
}
