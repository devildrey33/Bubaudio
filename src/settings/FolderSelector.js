import { open } from "@tauri-apps/plugin-dialog";

/**
 * Utilidad estática para solicitar al usuario una carpeta desde el diálogo
 * nativo de Tauri. No mantiene estado ni valida la ruta seleccionada.
 */
export default class FolderSelector {

    /**
     * Abre el diálogo nativo para elegir un único directorio raíz de música.
     * Si el usuario cancela, devuelve null. Los errores que produzca el plugin
     * de diálogo se propagan al llamador.
     *
     * @returns {Promise<string|null>} Ruta seleccionada o null si se canceló.
     */
    static async selectFolder() {
        // directory restringe la selección a carpetas; multiple:false hace que
        // open devuelva una ruta individual en vez de una lista de rutas.
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