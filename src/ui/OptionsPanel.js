import MusicPathsSetupPanel from "./MusicPathsSetupPanel.js";

function samePaths(first, second) {
    const normalize = path => path
        .replace(/[\\/]/g, "\\")
        .replace(/\\+$/, "")
        .toLowerCase();

    return first.length === second.length &&
        first.every((path, index) =>
            normalize(path) === normalize(second[index])
        );
}


export default class OptionsPanel {

    #settings;
    #onMusicPathsChanged;
    #overlay;
    #startupMode;
    #theme;
    #status;
    #closeButton;
    #saveButton;
    #musicPathsPanel;
    #initialMusicPaths = [];
    #resolveOpen = null;
    #openPromise = null;
    #saving = false;

    constructor(settings, onMusicPathsChanged) {
        this.#settings = settings;
        this.#onMusicPathsChanged = onMusicPathsChanged;
        this.#overlay = document.getElementById("options-overlay");
        this.#startupMode = document.getElementById("startup-mode");
        this.#theme = document.getElementById("ui-theme");
        this.#status = document.getElementById("options-status");
        this.#closeButton = document.getElementById("options-close");
        this.#saveButton = document.getElementById("options-save");

        if (
            !this.#overlay ||
            !this.#startupMode ||
            !this.#theme ||
            !this.#status ||
            !this.#closeButton ||
            !this.#saveButton
        ) {
            throw new Error("OptionsPanel: no se encontró el panel de opciones");
        }

        this.#musicPathsPanel = new MusicPathsSetupPanel(
            settings,
            () => this.#updateSaveButton()
        );
        this.#closeButton.addEventListener(
            "click",
            () => this.#saveAndClose()
        );
        this.#saveButton.addEventListener(
            "click",
            () => this.#saveAndClose()
        );
        this.#theme.addEventListener("change", () => {
            document.documentElement.dataset.theme = this.#theme.value;
        });
    }

    open({ required = false } = {}) {
        if (this.#openPromise) {
            return this.#openPromise;
        }

        this.#initialMusicPaths = this.#settings.musicPaths;
        this.#startupMode.value = this.#settings.startupMode;
        this.#theme.value = this.#settings.theme;
        document.documentElement.dataset.theme = this.#settings.theme;
        this.#status.textContent = "";
        this.#closeButton.hidden = required;
        this.#saveButton.textContent = required
            ? "Continuar"
            : "Guardar y cerrar";
        this.#musicPathsPanel.render();
        this.#overlay.hidden = false;
        this.#updateSaveButton();

        this.#openPromise = new Promise(resolve => {
            this.#resolveOpen = resolve;
        });

        return this.#openPromise;
    }

    async #saveAndClose() {
        if (this.#saving) {
            return;
        }

        if (this.#settings.musicPaths.length === 0) {
            this.#status.textContent =
                "Añade al menos un directorio raíz de música para continuar.";
            return;
        }

        this.#saving = true;
        this.#status.textContent = "Guardando opciones...";
        this.#updateSaveButton();

        try {
            this.#settings.startupMode = this.#startupMode.value;
            this.#settings.theme = this.#theme.value;

            if (
                !samePaths(
                    this.#initialMusicPaths,
                    this.#settings.musicPaths
                )
            ) {
                this.#status.textContent =
                    "Actualizando la biblioteca de música...";
                await this.#onMusicPathsChanged();
            }

            this.#overlay.hidden = true;
            this.#resolveOpen?.();
            this.#resolveOpen = null;
            this.#openPromise = null;
        }
        catch (error) {
            console.error(
                "No se pudieron aplicar las opciones de la biblioteca",
                error
            );
            this.#status.textContent =
                `No se pudieron aplicar las opciones: ${String(error)}`;
        }
        finally {
            this.#saving = false;
            this.#updateSaveButton();
        }
    }

    #updateSaveButton() {
        this.#saveButton.disabled =
            this.#saving || this.#settings.musicPaths.length === 0;
        this.#closeButton.disabled = this.#saving;
        this.#startupMode.disabled = this.#saving;
        this.#theme.disabled = this.#saving;
        this.#musicPathsPanel.setDisabled(this.#saving);
    }
}
