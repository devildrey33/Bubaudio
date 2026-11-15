import {
    BaseDirectory,
    mkdir,
    readDir,
    readTextFile,
    writeTextFile
} from "@tauri-apps/plugin-fs";

const PLAYLISTS_FILE = "playlists.json";
const PLAYLISTS_VERSION = 1;
const MAX_PLAYLIST_NAME_LENGTH = 100;

function isValidTrack(track) {
    return track !== null &&
        typeof track === "object" &&
        typeof track.path === "string" &&
        track.path.length > 0;
}

function isValidPlaylist(playlist) {
    return playlist !== null &&
        typeof playlist === "object" &&
        typeof playlist.id === "string" &&
        typeof playlist.name === "string" &&
        playlist.name.trim().length > 0 &&
        typeof playlist.createdAt === "string" &&
        Array.isArray(playlist.tracks) &&
        playlist.tracks.length > 0 &&
        playlist.tracks.every(isValidTrack);
}

export default class PlaylistStore {

    #playlists = [];

    get playlists() {
        return structuredClone(this.#playlists);
    }

    getById(id) {
        const playlist = this.#playlists.find(item => item.id === id);
        return playlist ? structuredClone(playlist) : null;
    }

    async load() {
        await mkdir(".", {
            baseDir: BaseDirectory.AppData,
            recursive: true
        });

        const entries = await readDir(".", {
            baseDir: BaseDirectory.AppData
        });
        const fileExists = entries.some(entry =>
            entry.isFile && entry.name === PLAYLISTS_FILE
        );

        if (!fileExists) {
            this.#playlists = [];
            return this.playlists;
        }

        const data = JSON.parse(await readTextFile(
            PLAYLISTS_FILE,
            { baseDir: BaseDirectory.AppData }
        ));

        if (
            data?.version !== PLAYLISTS_VERSION ||
            !Array.isArray(data.playlists) ||
            !data.playlists.every(isValidPlaylist)
        ) {
            throw new Error(
                "PlaylistStore: el archivo de listas guardadas no es válido"
            );
        }

        this.#playlists = data.playlists;
        return this.playlists;
    }

    async create(name, tracks) {
        const normalizedName = String(name).trim();
        if (!normalizedName) {
            throw new TypeError("El nombre de la lista no puede estar vacío");
        }
        if (normalizedName.length > MAX_PLAYLIST_NAME_LENGTH) {
            throw new RangeError(
                `El nombre de la lista supera ${MAX_PLAYLIST_NAME_LENGTH} caracteres`
            );
        }
        if (!Array.isArray(tracks) || tracks.length === 0) {
            throw new TypeError("No hay canciones para guardar");
        }
        if (!tracks.every(isValidTrack)) {
            throw new TypeError(
                "La cola contiene canciones sin una ruta válida"
            );
        }

        const playlist = {
            id: crypto.randomUUID(),
            name: normalizedName,
            createdAt: new Date().toISOString(),
            tracks: structuredClone(tracks)
        };
        const playlists = [...this.#playlists, playlist];

        await this.#write(playlists);
        this.#playlists = playlists;

        return structuredClone(playlist);
    }

    async remove(id) {
        const playlists = this.#playlists.filter(
            playlist => playlist.id !== id
        );

        if (playlists.length === this.#playlists.length) {
            return false;
        }

        await this.#write(playlists);
        this.#playlists = playlists;
        return true;
    }

    async #write(playlists) {
        await mkdir(".", {
            baseDir: BaseDirectory.AppData,
            recursive: true
        });
        await writeTextFile(
            PLAYLISTS_FILE,
            JSON.stringify({
                version: PLAYLISTS_VERSION,
                playlists
            }, null, 4),
            { baseDir: BaseDirectory.AppData }
        );
    }
}
