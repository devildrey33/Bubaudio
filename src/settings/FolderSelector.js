import { open } from "@tauri-apps/plugin-dialog";


export default class FolderSelector {

    /**
     * Abre el selector nativo de carpetas.
     *
     * @returns {Promise<String|null>}
     */
    static async selectFolder() {
        const path = await open({
            directory: true,
            multiple: false,
            title: "Añadir directorio raíz de música"
        });

        if (!path) {
            return null;
        }

        return path;
    }
}