import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const version = process.argv[2];

if (
    !version ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
) {
    console.error(
        "Uso: npm run set-version -- <versión> (por ejemplo, 0.5.1)"
    );
    process.exit(1);
}

function readJson(relativePath) {
    const fullPath = path.join(rootPath, relativePath);
    const text = readFileSync(fullPath, "utf8");

    return {
        fullPath,
        lineEnding: text.includes("\r\n") ? "\r\n" : "\n",
        value: JSON.parse(text)
    };
}

function writeJson(file) {
    const text = JSON.stringify(file.value, null, 2)
        .replace(/\n/g, file.lineEnding) + file.lineEnding;
    writeFileSync(file.fullPath, text, "utf8");
}

function updateCargoManifest(text) {
    const sectionStart = text.indexOf("[package]");
    if (sectionStart === -1) {
        throw new Error("No se encontró [package] en Cargo.toml");
    }

    const sectionEnd = text.indexOf("\n[", sectionStart + 9);
    const end = sectionEnd === -1 ? text.length : sectionEnd;
    const section = text.slice(sectionStart, end);
    const nameMatch = section.match(/^name\s*=\s*"([^"]+)"/m);
    const versionPattern = /^version\s*=\s*"[^"]+"/m;

    if (!nameMatch || !versionPattern.test(section)) {
        throw new Error("No se pudo leer name/version de Cargo.toml");
    }

    const updatedSection = section.replace(
        versionPattern,
        `version = "${version}"`
    );

    return {
        packageName: nameMatch[1],
        text: text.slice(0, sectionStart) +
            updatedSection +
            text.slice(end)
    };
}

function updateCargoLock(text, packageName) {
    const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
        `(\\[\\[package\\]\\]\\r?\\nname\\s*=\\s*"${escapedName}"\\r?\\nversion\\s*=\\s*")[^"]+(")`
    );

    if (!pattern.test(text)) {
        throw new Error(
            `No se encontró el paquete ${packageName} en Cargo.lock`
        );
    }

    return text.replace(pattern, `$1${version}$2`);
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const cargoTomlPath = path.join(rootPath, "src-tauri", "Cargo.toml");
const cargoLockPath = path.join(rootPath, "src-tauri", "Cargo.lock");
const cargoToml = readFileSync(cargoTomlPath, "utf8");
const cargo = updateCargoManifest(cargoToml);
const cargoLock = readFileSync(cargoLockPath, "utf8");
const updatedCargoLock = updateCargoLock(cargoLock, cargo.packageName);

if (!packageLock.value.packages || !packageLock.value.packages[""]) {
    throw new Error("No se encontró el paquete raíz en package-lock.json");
}

packageJson.value.version = version;
packageLock.value.version = version;
packageLock.value.packages[""].version = version;
tauriConfig.value.version = version;

writeJson(packageJson);
writeJson(packageLock);
writeJson(tauriConfig);
writeFileSync(cargoTomlPath, cargo.text, "utf8");
writeFileSync(cargoLockPath, updatedCargoLock, "utf8");

console.log(`Versión actualizada a ${version} en npm, Tauri y Cargo.`);
