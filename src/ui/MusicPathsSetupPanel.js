export default class MusicPathsSetupPanel {

    #settings;
    #pathList;
    #status;
    #addButton;
    #onChanged;
    #disabled = false;

    constructor(settings, onChanged = () => {}) {
        this.#settings = settings;
        this.#onChanged = onChanged;
        this.#pathList = document.getElementById("music-path-list");
        this.#status = document.getElementById("music-path-setup-status");
        this.#addButton = document.getElementById("music-path-add");

        if (!this.#pathList || !this.#status || !this.#addButton) {
            throw new Error(
                "MusicPathsSetupPanel: no se encontró el gestor de directorios"
            );
        }

        this.#addButton.addEventListener(
            "click",
            () => this.#onAddMusicPath()
        );
        this.render();
    }

    render(statusMessage = null) {
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
                if (this.#settings.removeMusicPath(path)) {
                    this.render("Directorio eliminado.");
                    this.#onChanged();
                }
            });
            removeButton.disabled = this.#disabled;

            item.append(label, removeButton);
            this.#pathList.appendChild(item);
        }

        const pathCount = this.#settings.musicPaths.length;
        this.#status.textContent = statusMessage ??
            (pathCount === 0
                ? "Añade al menos un directorio raíz de música."
                : `${pathCount} directorio(s) configurado(s).`);
    }

    setDisabled(disabled) {
        this.#disabled = Boolean(disabled);
        this.#addButton.disabled = this.#disabled;

        for (const button of this.#pathList.querySelectorAll("button")) {
            button.disabled = this.#disabled;
        }
    }

    async #onAddMusicPath() {
        this.#addButton.disabled = true;

        try {
            const result = await this.#settings.selectFolder();
            if (!result) {
                return;
            }

            this.render(
                result.changed
                    ? "Directorio añadido. Las rutas anidadas se consolidan automáticamente."
                    : "Este directorio ya está cubierto por una carpeta configurada."
            );

            if (result.changed) {
                this.#onChanged();
            }
        }
        catch (error) {
            console.error("No se pudo añadir el directorio de música", error);
            this.#status.textContent =
                `No se pudo seleccionar la carpeta: ${String(error)}`;
        }
        finally {
            this.#addButton.disabled = this.#disabled;
        }
    }
}
